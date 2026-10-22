package app.floatphone.shell

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
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
    // 固定的三个高饱和色，只做小面积点缀（分类小圆点）
    val BLUE = 0xFF2F6BFF.toInt()
    val RED = 0xFFFF3B30.toInt()
    val ORANGE = 0xFFFF9500.toInt()
}

/** 一条更新内容：type 是分类（app / content / global / prompt / fix），其他值显示成「其他」。 */
data class Change(val type: String, val title: String, val detail: String)

/** 有最大高度的滚动区：内容少时按内容高度，内容多时最高 maxPx，超出可上下滑。 */
class MaxHeightScrollView(ctx: Context, private val maxPx: Int) : ScrollView(ctx) {
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(
            widthMeasureSpec,
            View.MeasureSpec.makeMeasureSpec(maxPx, View.MeasureSpec.AT_MOST)
        )
    }
}

/**
 * 底部弹出的轻量弹窗：白底大圆角、黑色大按钮、浅灰辅助色。
 * 高饱和色只出现在分类小圆点上。内容不删减：一句总结 + 按类别分开的小小分解。
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

    /** 一两句总结。 */
    fun summary(t: String): Sheet {
        if (t.isBlank()) return this
        val v = tv(t, 16f, UiColor.INK)
        v.setLineSpacing(0f, 1.25f)
        add(v, 14)
        return this
    }

    /** 一行灰色小提示，例如「包含应用更新，需要安装」。 */
    fun note(t: String): Sheet {
        if (t.isBlank()) return this
        add(tv(t, 13f, UiColor.GRAY_TEXT), 6)
        return this
    }

    /** 分类小标签：圆点带颜色，文字是黑色。 */
    private fun chip(type: String): TextView {
        val (label, color) = when (type) {
            "app" -> "应用" to UiColor.BLUE
            "content" -> "页面内容" to UiColor.INK
            "global" -> "全局" to UiColor.ORANGE
            "prompt" -> "提示词" to UiColor.GRAY_TEXT
            "fix" -> "修复" to UiColor.RED
            else -> "其他" to UiColor.GRAY_TEXT
        }
        val sp = SpannableString("●  $label")
        sp.setSpan(ForegroundColorSpan(color), 0, 1, 0)
        return TextView(a).apply {
            text = sp
            textSize = 12f
            setTextColor(UiColor.INK)
            typeface = Typeface.DEFAULT_BOLD
            background = bg(UiColor.WHITE, 12)
            setPadding(dp(10), dp(4), dp(12), dp(4))
        }
    }

    /** 按分类分组显示更新内容：每组一个小标签，每条是「粗体小标题 + 灰色一行说明」。 */
    fun changes(list: List<Change>, maxHeightDp: Int = 260): Sheet {
        if (list.isEmpty()) return this
        val box = LinearLayout(a)
        box.orientation = LinearLayout.VERTICAL
        box.setPadding(dp(14), dp(12), dp(14), dp(14))
        val order = listOf("app", "content", "global", "prompt", "fix")
        val types = order + list.map { it.type }.filter { it !in order }.distinct()
        var first = true
        for (ty in types) {
            val items = list.filter { it.type == ty }
            if (items.isEmpty()) continue
            val clp = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT)
            clp.topMargin = if (first) 0 else dp(14)
            box.addView(chip(ty), clp)
            first = false
            for (ch in items) {
                val tlp = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
                tlp.topMargin = dp(8)
                box.addView(tv(ch.title, 15f, UiColor.INK, true), tlp)
                if (ch.detail.isNotBlank()) {
                    val d = tv(ch.detail, 13f, UiColor.GRAY_TEXT)
                    d.setLineSpacing(0f, 1.2f)
                    val dlp = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
                    dlp.topMargin = dp(2)
                    box.addView(d, dlp)
                }
            }
        }
        val sv = MaxHeightScrollView(a, dp(maxHeightDp))
        sv.background = bg(UiColor.GRAY_BG, 18)
        sv.addView(box)
        add(sv, 16)
        return this
    }

    /** 较长的文字（保活引导用），固定高度，可上下滑。 */
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
