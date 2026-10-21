package app.floatphone.shell

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.WebView
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

object UpdateManager {
    // 版本信息文件地址（网站 public 文件夹里的 app-version.json）
    const val VERSION_URL = "https://float-0217.vercel.app/app-version.json"
    private const val SP = "float_update"
    private const val LOG_MAX_LINES = 4      // 更新内容最多几条（旧 changelog 兜底用）
    private const val LOG_MAX_CHANGES = 8    // 分类条目最多几条
    private const val TITLE_MAX_CHARS = 20   // 条目小标题最多几个字
    private const val DETAIL_MAX_CHARS = 36  // 条目说明最多几个字

    @Volatile private var busy = false
    private var current: Sheet? = null
    private val main = Handler(Looper.getMainLooper())

    data class Change(val type: String, val title: String, val detail: String)

    data class Info(
        val code: Int,
        val name: String,
        val apkUrl: String,
        val summary: String,
        val changes: List<Change>,
        val force: Boolean,
        val webVersion: String
    )

    private fun sp(c: Context) = c.getSharedPreferences(SP, Context.MODE_PRIVATE)

    fun installedCode(c: Context): Int {
        val pi = c.packageManager.getPackageInfo(c.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode.toInt()
        else @Suppress("DEPRECATION") pi.versionCode
    }

    fun installedName(c: Context): String = try {
        c.packageManager.getPackageInfo(c.packageName, 0).versionName ?: ""
    } catch (_: Exception) { "" }

    private fun apkFile(c: Context) = File(File(c.cacheDir, "updates"), "update.apk")

    // 把一条文字压短
    private fun shorten(s: String, max: Int): String {
        val t = s.trim()
        return if (t.length > max) t.take(max) + "…" else t
    }

    // 解析 changes 数组（新格式：带分类）；没有就用旧 changelog 数组，全归为页面内容
    private fun parseChanges(j: JSONObject): List<Change> {
        val arr = j.optJSONArray("changes")
        if (arr != null) {
            return (0 until minOf(arr.length(), LOG_MAX_CHANGES)).mapNotNull { k ->
                val o = arr.optJSONObject(k) ?: return@mapNotNull null
                val title = shorten(o.optString("title"), TITLE_MAX_CHARS)
                if (title.isEmpty()) return@mapNotNull null
                Change(
                    ChangeTypes.normalize(o.optString("type", ChangeTypes.CONTENT)),
                    title,
                    shorten(o.optString("detail"), DETAIL_MAX_CHARS),
                )
            }
        }
        val old = j.optJSONArray("changelog") ?: return emptyList()
        return (0 until minOf(old.length(), LOG_MAX_LINES))
            .map { Change(ChangeTypes.CONTENT, shorten(old.getString(it), TITLE_MAX_CHARS), "") }
            .filter { it.title.isNotEmpty() }
    }

    // 把平铺的分类条目按 ChangeTypes 顺序分组成
    private fun groupChanges(changes: List<Change>): List<ChangeGroup> =
        ChangeTypes.ORDER.mapNotNull { type ->
            val items = changes.filter { it.type == type }
                .map { ChangeItem(it.title, it.detail) }
            if (items.isEmpty()) null else ChangeGroup(type, items)
        }

    // 有没有「应用」类条目：有就得装新 APK，不是刷新页面能解决的
    private fun hasAppChange(changes: List<Change>) =
        changes.any { it.type == ChangeTypes.APP }

    private fun installHint(hasApp: Boolean) =
        if (hasApp) "包含应用更新，需要安装新版本"
        else "页面更新，无需安装，刷新即可"

    private fun changesOrDefault(changes: List<Change>): List<Change> =
        if (changes.isEmpty())
            listOf(Change(ChangeTypes.CONTENT, "修复了一些问题，体验更稳定", ""))
        else changes

    private fun changesToJson(changes: List<Change>): JSONArray {
        val arr = JSONArray()
        for (c in changes) {
            arr.put(JSONObject().put("type", c.type).put("title", c.title).put("detail", c.detail))
        }
        return arr
    }

    private fun changesFromJson(s: String): List<Change> = try {
        val arr = JSONArray(s)
        (0 until arr.length()).mapNotNull { k ->
            val o = arr.optJSONObject(k) ?: return@mapNotNull null
            Change(
                ChangeTypes.normalize(o.optString("type", ChangeTypes.CONTENT)),
                o.optString("title"),
                o.optString("detail"),
            )
        }
    } catch (_: Exception) { emptyList() }

    // 统一入口：同一时间只显示一个弹窗
    fun open(s: Sheet) {
        current?.dismiss()
        current = s
        s.show()
    }

    fun hasSheet(): Boolean = current?.isShowing == true
    fun closeCurrent() { current?.dismiss() }

    // ========== 1. 检查更新（onResume 里调用）==========
    fun check(a: Activity, webView: WebView? = null) {
        if (busy || hasSheet()) return
        busy = true
        thread {
            var info: Info? = null
            try {
                val conn = URL("$VERSION_URL?t=${System.currentTimeMillis()}")
                    .openConnection() as HttpURLConnection
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                val j = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                info = Info(
                    j.getInt("versionCode"),
                    j.optString("versionName"),
                    j.optString("apkUrl"),
                    j.optString("summary"),
                    parseChanges(j),
                    j.optBoolean("force", false),
                    j.optString("webVersion")
                )
            } catch (_: Exception) {}
            main.post {
                busy = false
                val i = info ?: return@post
                if (a.isFinishing) return@post
                if (i.code > installedCode(a) && i.apkUrl.isNotEmpty()) {
                    showNewApk(a, i)
                } else if (webView != null && i.webVersion.isNotEmpty()) {
                    val saved = sp(a).getString("web_version", null)
                    if (saved == null) {
                        // 第一次安装：不弹窗，只记录
                        sp(a).edit().putString("web_version", i.webVersion).apply()
                    } else if (saved != i.webVersion) {
                        showNewWeb(a, i, webView)
                    }
                }
            }
        }
    }

    // ========== 2. 发现新安装包 ==========
    private fun showNewApk(a: Activity, i: Info) {
        val title = if (i.name.isNotEmpty()) "新版本 ${i.name}" else "发现新版本"
        val changes = changesOrDefault(i.changes)
        val s = Sheet(a).handle()
            .label("NEW VERSION")
            .title(title)
            .text(i.summary)
            .note(installHint(hasAppChange(changes)))
            .changes(groupChanges(changes))
            .primary("立即更新") { startApk(a, i) }
        if (i.force) s.cancelable(false) else s.secondary("稍后再说") { closeCurrent() }
        open(s)
    }

    // ========== 3. 下载 ==========
    private fun startApk(a: Activity, i: Info) {
        val f = apkFile(a)
        // 上次已经下载好了（点过"下次打开再说"）：直接进入"准备好了"
        if (f.exists() && sp(a).getInt("downloaded_code", 0) == i.code) {
            ready(a, i, f)
            return
        }
        sp(a).edit()
            .putInt("pending_code", i.code)
            .putString("pending_summary", i.summary)
            .putString("pending_changes", changesToJson(changesOrDefault(i.changes)).toString())
            .apply()

        val s = Sheet(a).handle()
            .label("DOWNLOADING")
            .title("正在下载\n新版本")
            .progress(0)
            .hints("0%", "请保持网络畅通")
            .cancelable(false)
        open(s)

        thread {
            try {
                f.parentFile?.mkdirs()
                val tmp = File(f.parentFile, "update.tmp")
                val conn = URL(i.apkUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 15000
                if (conn.responseCode != 200) throw IllegalStateException("http ${conn.responseCode}")
                val total = conn.contentLength
                conn.inputStream.use { input ->
                    tmp.outputStream().use { out ->
                        val buf = ByteArray(16 * 1024)
                        var done = 0L
                        var last = -1
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val p = (done * 100 / total).toInt()
                                if (p != last) {
                                    last = p
                                    main.post { s.setProgress(p) }
                                }
                            }
                        }
                    }
                }
                if (f.exists()) f.delete()
                tmp.renameTo(f)
                sp(a).edit().putInt("downloaded_code", i.code).apply()
                main.post { ready(a, i, f) }
            } catch (e: Exception) {
                main.post {
                    s.dismiss()
                    val msg = if (e.message?.startsWith("http 404") == true)
                        "安装包还没准备好，请稍后再试"
                    else "下载失败，请检查网络后重试"
                    Toast.makeText(a, msg, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    // ========== 4. 下载完成：新版本已经准备好了 ==========
    private fun ready(a: Activity, i: Info, f: File) {
        val s = Sheet(a).handle()
            .label("UPDATE READY")
            .title("新版本\n已经准备好了")
            .progress(100)
            .hints("下载完成", "安装后生效")
            .primary("立即安装") { install(a, f) }
        if (i.force) s.cancelable(false) else s.ghost("下次打开再说") { closeCurrent() }
        open(s)
    }

    private fun install(a: Activity, f: File) {
        // 没开"允许安装未知应用"：先带用户去开，开完回来再点一次
        if (Build.VERSION.SDK_INT >= 26 && !a.packageManager.canRequestPackageInstalls()) {
            Toast.makeText(a, "请先允许本应用安装更新，开启后返回再点一次", Toast.LENGTH_LONG).show()
            a.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${a.packageName}"))
            )
            return
        }
        try {
            val uri = FileProvider.getUriForFile(a, a.packageName + ".updatefileprovider", f)
            val it = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            a.startActivity(it)
        } catch (_: Exception) {
            Toast.makeText(a, "无法打开安装页，请稍后重试", Toast.LENGTH_SHORT).show()
        }
    }

    // ========== 5. 网页内容更新（不用重装：只显示非 app 类条目）==========
    private fun showNewWeb(a: Activity, i: Info, w: WebView) {
        val webChanges = i.changes.filter { it.type != ChangeTypes.APP }
        val s = Sheet(a).handle()
            .label("NEW CONTENT")
            .title("页面内容有更新")
            .text(i.summary)
            .note(installHint(false))
            .changes(groupChanges(changesOrDefault(webChanges)))
            .primary("立即更新") {
                w.clearCache(true)
                sp(a).edit().putString("web_version", i.webVersion).apply()
                val r = Sheet(a).handle()
                    .label("UPDATE READY")
                    .title("页面已经\n更新好了")
                    .progress(100)
                    .hints("下载完成", "刷新后生效")
                    .primary("立即刷新") { w.reload(); closeCurrent() }
                    .ghost("下次打开再说") { closeCurrent() }
                open(r)
            }
            .secondary("稍后再说") { closeCurrent() }
        open(s)
    }

    // ========== 6. 新版本第一次打开：更新日志（onCreate 里调用）==========
    fun showChangelogIfNeeded(a: Activity) {
        val p = sp(a)
        val now = installedCode(a)
        val last = p.getInt("last_seen_code", 0)
        if (last == 0) {
            // 全新安装：只记录，不弹
            p.edit().putInt("last_seen_code", now).apply()
            return
        }
        if (now > last) {
            val pendingCode = p.getInt("pending_code", 0)
            val saved = if (pendingCode == now)
                changesFromJson(p.getString("pending_changes", "") ?: "")
            else emptyList()
            val savedSummary = if (pendingCode == now) p.getString("pending_summary", "") ?: "" else ""
            p.edit().putInt("last_seen_code", now).apply()
            try { apkFile(a).delete() } catch (_: Exception) {}
            val changes = changesOrDefault(saved)
            val s = Sheet(a).handle()
                .label("WHAT'S NEW")
                .title("已更新到\n${installedName(a)}")
                .text(savedSummary)
                .note(installHint(false))
                .changes(groupChanges(changes))
                .primary("知道了") { closeCurrent() }
            open(s)
        }
    }
}
