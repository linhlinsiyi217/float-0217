package app.floatphone.shell

import android.app.Activity
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/**
 * 后台保活（尽力而为，国产系统仍可能杀后台，不能保证 100%）：
 * 1) 常驻前台服务 START_STICKY（PushService 原本就是）；
 * 2) 被划掉任务后 3 秒闹钟拉起（PushService.onTaskRemoved）；
 * 3) 每 15 分钟的 JobScheduler 定时检查服务还在不在（KeepAliveJobService）；
 * 4) 引导用户开三项设置：电池无限制、自启动、最近任务上锁。
 */
object KeepAlive {

    // 把常驻前台服务再起一次（已在跑就无副作用）
    fun ensureService(ctx: Context) {
        try {
            val i = Intent(ctx, PushService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        } catch (_: Exception) {
            // 安卓 12 以后后台启动前台服务可能被系统拒绝，只能尽力而为
        }
    }

    // 每 15 分钟检查一次服务还在不在（重启手机后也保留）
    fun scheduleJob(ctx: Context) {
        try {
            val js = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
            if (js.allPendingJobs.any { it.id == 10086 }) return
            val job = JobInfo.Builder(10086, ComponentName(ctx, KeepAliveJobService::class.java))
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build()
            js.schedule(job)
        } catch (_: Exception) {}
    }

    fun isIgnoringBattery(ctx: Context): Boolean {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    // 电池：申请「不优化」
    fun requestIgnoreBattery(a: Activity) {
        try {
            a.startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${a.packageName}"))
            )
        } catch (_: Exception) {
            try {
                a.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (_: Exception) {}
        }
    }

    // 自启动：各手机厂商的设置页依次尝试，都不行就打开本应用详情页
    fun openAutoStart(a: Activity) {
        val targets = listOf(
            "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
            "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
            "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity"
        )
        for ((pkg, cls) in targets) {
            try {
                val i = Intent().setComponent(ComponentName(pkg, cls))
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                a.startActivity(i)
                return
            } catch (_: Exception) {}
        }
        try {
            a.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${a.packageName}"))
            )
        } catch (_: Exception) {}
    }

    // 保活引导弹窗（可反复调用，例如网页里「后台保活」页面）
    fun showGuide(a: Activity) {
        val s = Sheet(a).handle()
            .label("KEEP ALIVE")
            .title("让消息\n不漏掉")
            .scrollText(
                "请做下面三步：\n\n" +
                "1. 电池：选择“无限制”或“不优化”\n" +
                "2. 自启动：打开本应用的自启动开关\n" +
                "3. 最近任务：把本应用卡片上锁（下拉卡片或点锁图标）\n\n" +
                "不同手机的页面名字会有点不一样，找相近的选项就行。",
                180
            )
            .primary("去设置电池") { requestIgnoreBattery(a) }
            .secondary("去开自启动") { openAutoStart(a) }
            .ghost("我知道了") { UpdateManager.closeCurrent() }
        UpdateManager.open(s)
    }

    // 第一次打开只提示一次；有别的弹窗在显示时先不打扰
    fun showGuideOnce(a: Activity) {
        val sp = a.getSharedPreferences("float_keepalive", Context.MODE_PRIVATE)
        if (sp.getBoolean("guided", false)) return
        if (UpdateManager.hasSheet()) return
        sp.edit().putBoolean("guided", true).apply()
        showGuide(a)
    }
}

/** 每 15 分钟被系统叫醒一次：把常驻服务再拉起来（不在就重启，在就无副作用）。 */
class KeepAliveJobService : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        try { KeepAlive.ensureService(this) } catch (_: Exception) {}
        // 顺手查一次线上版本：有新版本时发一条系统通知，点击进 App 自动弹更新窗
        try { UpdateManager.checkInBackground(this) } catch (_: Exception) {}
        return false
    }
    override fun onStopJob(params: JobParameters?): Boolean = true
}
