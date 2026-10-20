package app.floatphone.shell

import android.app.AlertDialog
import android.app.ProgressDialog
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/** Updates for the existing WebView shell; the web app remains the source of truth. */
class UpdateManager(
    private val activity: MainActivity,
    private val webView: WebView,
) {
    private val main = Handler(Looper.getMainLooper())
    private val checking = AtomicBoolean(false)
    private var destroyed = false
    private var progressDialog: ProgressDialog? = null
    private val prefs by lazy { activity.getSharedPreferences("float_shell_updates", 0) }

    private data class RemoteVersion(
        val versionCode: Int,
        val versionName: String,
        val apkUrl: String,
        val webVersion: String,
        val force: Boolean,
        val changelog: List<String>,
    )

    fun checkForUpdates() {
        if (destroyed || !checking.compareAndSet(false, true)) return
        Thread {
            val remote = runCatching { fetchRemoteVersion() }.getOrNull()
            main.post {
                checking.set(false)
                if (destroyed || remote == null) return@post
                applyWebVersion(remote)
                if (remote.versionCode > BuildConfig.VERSION_CODE) showApkUpdate(remote)
                else if (remote.versionCode == BuildConfig.VERSION_CODE) showChangelogOnce(remote)
            }
        }.start()
    }

    private fun fetchRemoteVersion(): RemoteVersion? {
        val endpoint = URL(MainActivity.SITE_URL.trimEnd('/') + "/app-version.json?ts=" + System.currentTimeMillis())
        val connection = (endpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 8_000
            useCaches = false
        }
        return try {
            if (connection.responseCode !in 200..299) return null
            val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val rawUrl = json.optString("apkUrl").trim()
            val apkUrl = if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) rawUrl
            else URL(endpoint, rawUrl).toString()
            val changelog = buildList {
                val array = json.optJSONArray("changelog") ?: return@buildList
                for (index in 0 until array.length()) add(array.optString(index))
            }.filter { it.isNotBlank() }
            RemoteVersion(
                versionCode = json.optInt("versionCode", 0),
                versionName = json.optString("versionName", ""),
                apkUrl = apkUrl,
                webVersion = json.optString("webVersion", ""),
                force = json.optBoolean("force", false),
                changelog = changelog,
            )
        } finally {
            connection.disconnect()
        }
    }

    private fun applyWebVersion(remote: RemoteVersion) {
        if (remote.webVersion.isBlank()) return
        val previous = prefs.getString("web_version", null)
        prefs.edit().putString("web_version", remote.webVersion).apply()
        if (previous != null && previous != remote.webVersion) {
            webView.clearCache(true)
            webView.reload()
        }
    }

    private fun showChangelogOnce(remote: RemoteVersion) {
        if (remote.changelog.isEmpty()) return
        val key = "shown_changelog_${remote.versionCode}"
        if (prefs.getBoolean(key, false)) return
        prefs.edit().putBoolean(key, true).apply()
        AlertDialog.Builder(activity)
            .setTitle("本次更新")
            .setMessage(remote.changelog.joinToString("\n") { "• $it" })
            .setPositiveButton("知道了", null)
            .show()
    }

    private fun showApkUpdate(remote: RemoteVersion) {
        val message = buildString {
            append("发现新版本 ")
            append(remote.versionName.ifBlank { remote.versionCode.toString() })
            if (remote.changelog.isNotEmpty()) {
                append("\n\n")
                append(remote.changelog.joinToString("\n") { "• $it" })
            }
        }
        val builder = AlertDialog.Builder(activity)
            .setTitle("有新的 APK 更新")
            .setMessage(message)
            .setPositiveButton("下载更新") { _, _ -> downloadAndInstall(remote) }
        if (!remote.force) builder.setNegativeButton("稍后", null)
        builder.setCancelable(!remote.force).show()
    }

    private fun downloadAndInstall(remote: RemoteVersion) {
        val target = File(activity.cacheDir, "updates/app-release.apk").apply { parentFile?.mkdirs() }
        progressDialog = ProgressDialog(activity).apply {
            setTitle("正在下载更新")
            setProgressStyle(ProgressDialog.STYLE_HORIZONTAL)
            setIndeterminate(true)
            setCancelable(false)
            show()
        }
        Thread {
            val result = runCatching { download(remote.apkUrl, target) }
            main.post {
                progressDialog?.dismiss()
                progressDialog = null
                if (destroyed) return@post
                result.onSuccess { install(it) }.onFailure { error ->
                    AlertDialog.Builder(activity)
                        .setTitle("更新失败")
                        .setMessage(error.message ?: "无法下载更新，请稍后重试。")
                        .setPositiveButton("确定", null)
                        .show()
                }
            }
        }.start()
    }

    private fun download(url: String, target: File): File {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 30_000
            instanceFollowRedirects = true
        }
        try {
            if (connection.responseCode !in 200..299) error("服务器返回 ${connection.responseCode}")
            val total = connection.contentLengthLong
            main.post {
                progressDialog?.isIndeterminate = total <= 0
                if (total > 0) progressDialog?.max = 1000
            }
            FileOutputStream(target).use { output ->
                connection.inputStream.use { input ->
                    val buffer = ByteArray(16 * 1024)
                    var downloaded = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        downloaded += count
                        if (total > 0) main.post {
                            progressDialog?.progress = ((downloaded * 1000) / total).toInt().coerceIn(0, 1000)
                        }
                    }
                }
            }
            return target
        } finally {
            connection.disconnect()
        }
    }

    private fun install(apk: File) {
        val uri: Uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
    }

    fun destroy() {
        destroyed = true
        main.removeCallbacksAndMessages(null)
        progressDialog?.dismiss()
        progressDialog = null
    }
}
