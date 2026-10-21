// lib/offline-rich.ts
// 书页式线下正文的行内渲染。行为对齐曲曲 cofRich / cofInline（《45》§4），只学行为：
//   **动作**（含单星号） → 弱色粗体
//   “台词” / 「台词」 / "台词" → 加重主色，且引号留在外面、只给内容压一条 45% 灰荧光带
//   > 独白（连续行）     → 左侧竖线的缩进块
//   空行                 → 分段
//   (译：…)              → 译文用「」接在原文后面，浅一档小字，括号与「译：」不露
//
// 铁律：先转义再套标签。正文是用户与模型写的字，一个字都不许带着标签进 innerHTML。
// 存储里的原文不动，这里只产出「屏幕上画的那一份」；编辑框、复制出去的都是原文。

export function escapeOfflineHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** 剥掉写给状态栏/走向的标签：那是给别的层用的，不是正文 */
export function stripOfflineControlTags(text: string): string {
    return text
        .replace(/\n?[ \t]*<status\s*>[\s\S]*?<\/status\s*>/gi, "")
        .replace(/\n?[ \t]*<choices\s*>[\s\S]*?(?:<\/choices\s*>|$)/gi, "")
        .trim();
}

type TrSlot = { index: number; text: string };

const TR_RE = /[(（]\s*译[:：]\s*([^)）]*)[)）]/g;

/** 抽走 (译：…) 换成 \u0000n\u0000 占位：动作与台词的正则都咬不到它 */
function trTake(text: string, out: TrSlot[]): string {
    TR_RE.lastIndex = 0;
    return text.replace(TR_RE, (_all, t: string) => {
        const trimmed = t.trim();
        if (!trimmed) return "";
        out.push({ index: out.length, text: trimmed });
        return `\u0000${out.length - 1}\u0000`;
    });
}

function trPut(html: string, list: TrSlot[]): string {
    if (!list.length) return html;
    return html.replace(/\u0000(\d+)\u0000/g, (_all, i: string) => {
        const slot = list[Number(i)];
        if (!slot) return "";
        return `<span class="cof-tr">「${escapeOfflineHtml(slot.text)}」</span>`;
    });
}

/** 行内写法。输入是「一行的原文」，输出是带标签的 HTML */
export function renderOfflineInline(raw: string): string {
    const trs: TrSlot[] = [];
    let s = escapeOfflineHtml(trTake(raw, trs));
    // 动作先套：跑在纯文本上，不会咬到后面生成的标签
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="cof-em">$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<strong class="cof-em">$1</strong>');
    // 台词：引号留在色带外面，荧光带只压说出口的那句话
    s = s.replace(/“([^”]*)”/g, '<span class="cof-say">“<span class="cof-hl">$1</span>”</span>');
    s = s.replace(/「([^」]*)」/g, '<span class="cof-say">「<span class="cof-hl">$1</span>」</span>');
    // 英文双引号转义后是 &quot;；内容里认「除裸引号什么都行」——裸引号只出现在上一步的标签里
    s = s.replace(/&quot;([^"]*?)&quot;/g, '<span class="cof-say">&quot;<span class="cof-hl">$1</span>&quot;</span>');
    return trPut(s, trs);
}

/** 整段正文 → 书页段落 HTML。@params raw 为这一段的原文（已剥控制标签） */
export function renderOfflineRich(raw: string): string {
    const lines = String(raw ?? "").replace(/\r\n?/g, "\n").split("\n");
    let html = "";
    let quote: string[] = [];
    const flushQuote = () => {
        if (!quote.length) return;
        html += `<blockquote class="cof-quote">${quote.map(line => `<p class="cof-line">${renderOfflineInline(line)}</p>`).join("")}</blockquote>`;
        quote = [];
    };
    for (const line of lines) {
        const t = line.trim();
        if (t.startsWith(">")) {
            quote.push(t.slice(1).replace(/^\s+/, ""));
            continue;
        }
        flushQuote();
        if (!t) continue; // 空行只分段
        html += `<p class="cof-line">${renderOfflineInline(t)}</p>`;
    }
    flushQuote();
    return html;
}

/** 复制出去的那一份：译文跟着走但记号不跟（《存档》档），括号换成「」 */
export function offlineCopyPlain(text: string): string {
    TR_RE.lastIndex = 0;
    return text.replace(TR_RE, (_all, t: string) => {
        const trimmed = t.trim();
        return trimmed ? `「${trimmed}」` : "";
    });
}
