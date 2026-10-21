package app.floatphone.shell

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.Window
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** 全局只用的几个颜色：白底黑白灰为主，高饱和色只做小面积点缀（小圆点）。 */
object UiColor {
    val WHITE = 0xFFFFFFFF.toInt()
    val INK = 0xFF1C1C1E.toInt()
    val BLACK = 0xFF111111.toInt()
    val GRAY_TEXT = 0xFF9A9AA0.toInt()
    val GRAY_BG = 0xFFF5F5F7.toInt()
    val GRAY_LINE = 0xFFE5E5EA.toInt()
    // 固定的三个高饱和色，只做小面积点缀
    val BLUE = 0xFF2F6BFF.toInt()
    val RED = 0xFFFF3B30.toInt()
    val ORANGE = 0xFFFF9500.toInt()
}

/** 更新条目的分类：与网站 app-version.json 的 type 字段一一对应。 */
object ChangeTypes {
    const val APP = "app"
    const val CONTENT = "content"
    const val GLOBAL = "global"
    const val PROMPT = "prompt"
    const val FIX = "fix"
    const val OTHER = "other"

    val ORDER = listOf(APP, CONTENT, GLOBAL, PROMPT, FIX)

    fun label(t: String): String = when (t) {
        APP -> "应用"
        CONTENT -> "页面内容"
        GLOBAL -> "全局"
        PROMPT -> "提示词"
        FIX -> "修复"
        else -> "其他"
    }

    fun color(t: String): Int = when (t) {
        APP -> UiColor.BLUE
        CONTENT -> UiColor.BLACK
        GLOBAL -> UiColor.ORANGE
        PROMPT -> UiColor.GRAY_TEXT
        FIX -> UiColor.RED
        else -> UiColor.GRAY_TEXT
    }

    /** 非法值归到页面内容类，保证旧数据也能显示。 */
    fun normalize(t: String): String = if (t in ORDER) t else CONTENT
}

/** 一条更新：短名字 + 一句说明。 */
data class ChangeItem(val title: String, val detail: String)

/** 一个分类组：小圆点 + 组名，下面挂若干条更新。 */
data class ChangeGroup(val type: String, val items: List<ChangeItem>)

/**
 * 底部弹出的轻量弹窗：白底大圆角、黑色大按钮、浅灰辅助色。
 * 高饱和色只出现在分类小圆点上。
 */
class Sheet(private val a: Activity) {
    private val dialog = Dialog(a)
    private val card = LinearLayout(a)
    private var fill: View? = null
    private var rest: View? = null
    private var hintL: TextView? = null

    val isShowing: Boolean get() = dialog.isShowing

    private fun dp(v: Int) = (v * a.resources.displayMetrics.density + 0.5f).toInt()

    private fun bg(color: Int, r: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(r).toFloat()
    }

    init {
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        card.orientation = LinearLayout.VERTICAL
        card.background = bg(UiColor.WHITE, 32)
        card.setPadding(dp(24), dp(12), dp(24), dp(20))
        val outer = FrameLayout(a)
        outer.setPadding(dp(10), 0, dp(10), dp(10))
        outer.addView(card, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        dialog.setContentView(outer)
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setGravity(Gravity.BOTTOM)
            setLayout(MATCH_PARENT, WRAP_CONTENT)
            setDimAmount(0.35f)
            setWindowAnimations(android.R.style.Animation_InputMethod)
        }
    }

    private fun tv(text: String, sp: Float, color: Int, bold: Boolean = false): TextView =
        TextView(a).apply {
            this.text = text
            textSize = sp
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
        }

    private fun add(v: View, top: Int = 0, h: Int = WRAP_CONTENT) {
        val lp = LinearLayout.LayoutParams(MATCH_PARENT, h)
        lp.topMargin = dp(top)
        card.addView(v, lp)
    }

    private fun dot(color: Int, sizeDp: Int = 7): View = View(a).apply {
        val d = GradientDrawable()
        d.shape = GradientDrawable.OVAL
        d.setColor(color)
        background = d
    }

    fun handle(): Sheet {
        val v = View(a)
        v.background = bg(UiColor.GRAY_LINE, 3)
        val lp = LinearLayout.LayoutParams(dp(40), dp(5))
        lp.gravity = Gravity.CENTER_HORIZONTAL
        card.addView(v, lp)
        return this
    }

    fun label(t: String): Sheet {
        val v = tv(t, 12f, UiColor.GRAY_TEXT, true)
        v.letterSpacing = 0.2f
        add(v, 18)
        return this
    }

    fun title(t: String): Sheet {
        add(tv(t, 28f, UiColor.INK, true), 8)
        return this
    }

    /** 一两句总结（普通正文）。 */
    fun text(t: String): Sheet {
        if (t.isBlank()) return this
        val v = tv(t, 15f, UiColor.INK)
        v.setLineSpacing(0f, 1.2f)
        add(v, 10)
        return this
    }

    /** 一行灰色小提示，如「包含应用更新，需要安装」。 */
    fun note(t: String): Sheet {
        if (t.isBlank()) return this
        add(tv(t, 13f, UiColor.GRAY_TEXT), 8)
        return this
    }

    /** 精简的更新内容：几条短句，浅灰圆角框，不滚动。 */
    fun bullets(lines: List<String>): Sheet {
        val box = LinearLayout(a)
        box.orientation = LinearLayout.VERTICAL
        box.background = bg(UiColor.GRAY_BG, 18)
        box.setPadding(dp(16), dp(10), dp(16), dp(10))
        for (l in lines) {
            val t = tv("·  $l", 15f, UiColor.INK)
            t.setPadding(0, dp(5), 0, dp(5))
            box.addView(t)
        }
        add(box, 16)
        return this
    }

    /**
     * 按分类分组的更新内容：每组「小圆点 + 组名」，组里每条是
     * 「粗体小标题 + 灰色一行说明」。内容多时框内可上下滑。
     */
    fun changes(groups: List<ChangeGroup>, heightDp: Int = 220): Sheet {
        if (groups.isEmpty()) return this
        val sv = ScrollView(a)
        sv.isVerticalScrollBarEnabled = false
        sv.background = bg(UiColor.GRAY_BG, 18)
        val box = LinearLayout(a)
        box.orientation = LinearLayout.VERTICAL
        box.setPadding(dp(16), dp(12), dp(16), dp(12))
        groups.forEachIndexed { gi, g ->
            // 组头：小圆点 + 组名
            val head = LinearLayout(a)
            head.orientation = LinearLayout.HORIZONTAL
            head.gravity = Gravity.CENTER_VERTICAL
            head.addView(dot(ChangeTypes.color(g.type)), LinearLayout.LayoutParams(dp(7), dp(7)))
            val headTv = tv(ChangeTypes.label(g.type), 13f, UiColor.GRAY_TEXT, true)
            headTv.setPadding(dp(6), 0, 0, 0)
            head.addView(headTv)
            if (gi > 0) {
                val headLp = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
                headLp.topMargin = dp(14)
                box.addView(head, headLp)
            } else {
                box.addView(head)
            }
            // 组内条目：粗体小标题 + 灰色一行说明
            for (it in g.items) {
                val t = tv(it.title, 14f, UiColor.INK, true)
                t.setPadding(0, dp(6), 0, 0)
                box.addView(t)
                if (it.detail.isNotBlank()) {
                    val d = tv(it.detail, 13f, UiColor.GRAY_TEXT)
                    d.setPadding(0, dp(1), 0, 0)
                    box.addView(d)
                }
            }
        }
        sv.addView(box)
        add(sv, 16, dp(heightDp))
        return this
    }

    /** 较长的文字（保活引导用），可上下滑动。 */
    fun scrollText(t: String, heightDp: Int = 180): Sheet {
        val sv = ScrollView(a)
        sv.background = bg(UiColor.GRAY_BG, 18)
        val body = tv(t, 15f, UiColor.INK)
        body.setLineSpacing(0f, 1.25f)
        body.setPadding(dp(16), dp(14), dp(16), dp(14))
        sv.addView(body)
        add(sv, 16, dp(heightDp))
        return this
    }

    fun progress(p: Int): Sheet {
        val bar = LinearLayout(a)
        bar.orientation = LinearLayout.HORIZONTAL
        bar.background = bg(UiColor.GRAY_LINE, 3)
        val f = View(a)
        f.background = bg(UiColor.BLACK, 3)
        val r = View(a)
        bar.addView(f, LinearLayout.LayoutParams(0, MATCH_PARENT, p.toFloat()))
        bar.addView(r, LinearLayout.LayoutParams(0, MATCH_PARENT, (100 - p).toFloat()))
        fill = f
        rest = r
        add(bar, 24, dp(6))
        return this
    }

    fun hints(l: String, r: String): Sheet {
        val row = LinearLayout(a)
        row.orientation = LinearLayout.HORIZONTAL
        val lt = tv(l, 13f, UiColor.GRAY_TEXT)
        val rt = tv(r, 13f, UiColor.GRAY_TEXT)
        rt.gravity = Gravity.END
        row.addView(lt, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        row.addView(rt, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        hintL = lt
        add(row, 10)
        return this
    }

    fun setProgress(p: Int) {
        val q = p.coerceIn(0, 100)
        fill?.layoutParams = LinearLayout.LayoutParams(0, MATCH_PARENT, q.toFloat())
        rest?.layoutParams = LinearLayout.LayoutParams(0, MATCH_PARENT, (100 - q).toFloat())
        hintL?.text = "$q%"
    }

    private fun button(t: String, bgc: Int, fg: Int, top: Int, onClick: () -> Unit): Sheet {
        val v = tv(t, 17f, fg, true)
        v.gravity = Gravity.CENTER
        v.background = bg(bgc, 28)
        v.setOnClickListener { onClick() }
        add(v, top, dp(56))
        return this
    }

    fun primary(t: String, onClick: () -> Unit): Sheet =
        button(t, UiColor.BLACK, UiColor.WHITE, 24, onClick)

    fun secondary(t: String, onClick: () -> Unit): Sheet =
        button(t, UiColor.GRAY_BG, UiColor.INK, 12, onClick)

    fun ghost(t: String, onClick: () -> Unit): Sheet {
        val v = tv(t, 15f, UiColor.GRAY_TEXT)
        v.gravity = Gravity.CENTER
        v.setPadding(0, dp(14), 0, dp(4))
        v.setOnClickListener { onClick() }
        add(v, 8)
        return this
    }

    fun cancelable(b: Boolean): Sheet {
        dialog.setCancelable(b)
        dialog.setCanceledOnTouchOutside(b)
        return this
    }

    fun show(): Sheet {
        if (!a.isFinishing) dialog.show()
        return this
    }

    fun dismiss() {
        try { dialog.dismiss() } catch (_: Exception) {}
    }
}
