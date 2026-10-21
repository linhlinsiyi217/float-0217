"use client";

// 心声 HTML 的清洗与作用域（行为参考曲曲 html-safe.js，但按任务书要求做白名单）：
// - 只保留认得的标签和属性；script / iframe / 表单类整体剥掉，来路不明的标签拆壳留内容
// - class 一律加 mvx- 前缀（防止页面 CSS 误伤卡片元素、也防止卡片类名撞上页面）
// - on* 事件属性、javascript: 地址、srcset、id、data-* 全部去掉
// - <style> 里的 CSS 逐条选择器加弹窗作用域前缀，样式出不了这张卡
// 仅处理调用时刻的字符串，不在模块顶层碰 DOM。

export const MIND_SCOPE_CLASS = "mvx-scope";
const MIND_CSS_PREFIX = "mvx-";

const ALLOWED_TAGS = new Set([
    "div", "span", "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "dl", "dt", "dd",
    "strong", "b", "em", "i", "u", "s", "del", "ins", "small", "big", "sub", "sup",
    "code", "pre", "blockquote", "q", "mark", "abbr", "cite", "time",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    "figure", "figcaption", "img",
]);

const ALLOWED_ATTRS = new Set([
    "style", "src", "alt", "title", "width", "height",
    "colspan", "rowspan", "align", "valign", "dir", "lang", "loading",
]);

const REMOVE_TAGS = "script,iframe,object,embed,link,meta,base,form,input,button,select,textarea,frame,frameset,applet,svg,math,audio,video,track,template,noscript";

export function safeMindUrl(url: string): boolean {
    const s = typeof url === "string" ? url.trim() : "";
    if (!s) return false;
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(s)) return true;
    return /^[\w./-]+$/.test(s); // icon/ava/TU02.jpg 这种相对路径
}

/** 白名单清洗 + CSS 作用域。scopeSelector 形如 ".mvx-scope"。 */
export function sanitizeMindHtml(html: string, scopeSelector: string): string {
    if (typeof window === "undefined" || typeof DOMParser === "undefined") return "";
    try {
        const doc = new DOMParser().parseFromString(String(html), "text/html");
        const body = doc.body;

        // 1. 危险标签连内容一起带走
        body.querySelectorAll(REMOVE_TAGS).forEach(el => el.remove());

        // 2. style 块收出来，最后统一加作用域放回顶部
        const cssParts: string[] = [];
        body.querySelectorAll("style").forEach(el => {
            cssParts.push(el.textContent || "");
            el.remove();
        });

        // 3. 白名单外的标签拆壳留内容；白名单内的过滤属性
        const all = Array.from(body.querySelectorAll("*"));
        for (const el of all) {
            if (!el.parentNode) continue; // 已随危险祖先一起被移除
            const tag = el.tagName.toLowerCase();
            if (!ALLOWED_TAGS.has(tag)) {
                unwrapElement(el);
                continue;
            }
            filterMindAttrs(el);
        }

        const inner = body.innerHTML;
        const css = cssParts.map(c => scopeMindCss(c, scopeSelector)).filter(Boolean).join("\n");
        return (css ? `<style>${css}</style>` : "") + inner;
    } catch {
        return "";
    }
}

function unwrapElement(el: Element): void {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
}

function filterMindAttrs(el: Element): void {
    for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name === "class") {
            const prefixed = attr.value.split(/\s+/).filter(Boolean)
                .map(token => (token.startsWith(MIND_CSS_PREFIX) ? token : MIND_CSS_PREFIX + token))
                .join(" ");
            el.setAttribute("class", prefixed);
            continue;
        }
        if (name.startsWith("on") || name === "id" || name === "srcset" || name.startsWith("data-") || name === "href" || name === "xlink:href") {
            el.removeAttribute(attr.name);
            continue;
        }
        if (name === "src") {
            if (!safeMindUrl(attr.value)) el.removeAttribute(attr.name);
            continue;
        }
        if (!ALLOWED_ATTRS.has(name)) el.removeAttribute(attr.name);
    }
}

// ── CSS 作用域：每条选择器加前缀；@keyframes / @font-face 整块放行，@media 递归 ──

export function scopeMindCss(raw: string, scopeSelector: string): string {
    if (!raw || !raw.trim()) return "";
    if (!scopeSelector) return String(raw);
    const text = String(raw).replace(/\/\*[\s\S]*?\*\//g, "");
    let out = "";
    let i = 0;
    const n = text.length;
    while (i < n) {
        const braceStart = text.indexOf("{", i);
        if (braceStart < 0) { out += text.slice(i); break; }
        const head = text.slice(i, braceStart);
        const bodyEnd = findMindBraceEnd(text, braceStart);
        const body = text.slice(braceStart + 1, bodyEnd);
        const atMatch = /^\s*@([\w-]+)/.exec(head);
        const at = atMatch ? atMatch[1].toLowerCase() : "";

        if (at === "keyframes" || at === "-webkit-keyframes" || at === "font-face") {
            out += head + "{" + body + "}";
        } else if (at === "media" || at === "supports" || at === "layer" || at === "container") {
            out += head + "{" + scopeMindCss(body, scopeSelector) + "}";
        } else if (at) {
            // @import / @charset 等：原样放行
            out += head + "{" + body + "}";
        } else {
            const selectors = head.split(",")
                .map(sel => scopeMindSelector(sel.trim(), scopeSelector))
                .filter(Boolean);
            out += selectors.join(", ") + "{" + body + "}";
        }
        i = bodyEnd + 1;
    }
    return out;
}

function scopeMindSelector(sel: string, scopeSelector: string): string {
    if (!sel) return "";
    if (/^(:root|html|body)\b/i.test(sel)) {
        // 用户写 :root / html / body 想改整页，一律改成只改这张卡
        return scopeSelector + sel.replace(/^(:root|html|body)/i, "");
    }
    // class 一律加前缀（跳过已带前缀的）；声明的 class 在 HTML 里已被同名前缀改写
    const prefixed = sel.replace(/(^|[^\w-])\.([A-Za-z_][\w-]*)/g, (_m, pre: string, cls: string) =>
        cls.startsWith(MIND_CSS_PREFIX) ? `${pre}.${cls}` : `${pre}.${MIND_CSS_PREFIX}${cls}`);
    if (prefixed === scopeSelector || prefixed.startsWith(scopeSelector + " ")) return prefixed;
    return scopeSelector + " " + prefixed;
}

function findMindBraceEnd(text: string, openPos: number): number {
    let depth = 0;
    for (let i = openPos; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return text.length - 1;
}
