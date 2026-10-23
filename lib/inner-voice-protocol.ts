// 心声 JSON 的七级兜底提取 —— 自 wanwan/js/wechat.js extractAIJson 系列改写。
// 背景：模型输出的 [心声] JSON 经常被截断、带代码围栏、字符串里塞裸换行、
// 尾部多个逗号；float 之前只做一次 JSON.parse，错一点整轮心声就丢。
// 这里把 wanwan 的韧性链路完整搬过来：
//   1. 整段直接解析
//   2. 代码围栏块内解析
//   3. 括号配对提取第一个完整 {...}
//   4. 修复常见小错误（字符串内裸换行/控制字符转义、尾逗号）后重试
//   5. 截断补全（闭合未结束字符串、去悬空逗号冒号、补齐右括号）后重试
//   6. 正则字段抢救（允许字符串未闭合）
//   7. 全部失败返回 null（这一轮当没心声，绝不把残骸塞进卡片）

export type InnerVoiceRawFields = Record<string, unknown>;

function tryParseJsonObject(s: string): InnerVoiceRawFields | null {
    if (!s) return null;
    try {
        const o = JSON.parse(s);
        if (o && typeof o === "object" && !Array.isArray(o)) return o as InnerVoiceRawFields;
    } catch {
        // 下一级兜底
    }
    return null;
}

/** 修复字符串字面量内的裸换行/控制字符转义、删除尾逗号 */
function repairJsonText(s: string): string {
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (escaped) { out += ch; escaped = false; continue; }
            if (ch === "\\") { out += ch; escaped = true; continue; }
            if (ch === '"') { out += ch; inString = false; continue; }
            if (ch === "\n") { out += "\\n"; continue; }
            if (ch === "\r") { out += "\\r"; continue; }
            if (ch === "\t") { out += "\\t"; continue; }
            if (ch.charCodeAt(0) < 0x20) continue;
            out += ch;
            continue;
        }
        if (ch === '"') { out += ch; inString = true; continue; }
        if (ch === ",") {
            let j = i + 1;
            while (j < s.length && /\s/.test(s[j])) j++;
            if (s[j] === "}" || s[j] === "]") continue;
            out += ch;
            continue;
        }
        out += ch;
    }
    return out;
}

/** 从文本任意位置提取第一个配对完整的 {...}；不完整时返回从 { 到结尾的部分 */
function sliceJsonObject(text: string): { slice: string; truncated: boolean } | null {
    const start = text.indexOf("{");
    if (start < 0) return null;
    let inString = false;
    let escaped = false;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === "\\") { escaped = true; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return { slice: text.slice(start, i + 1), truncated: false };
        }
    }
    return { slice: text.slice(start), truncated: true };
}

/** 补全被截断的 JSON：闭合未结束的字符串、去掉悬空逗号/冒号、补齐右括号 */
function completeTruncatedJson(s: string): string {
    let inString = false;
    let escaped = false;
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === "\\") { escaped = true; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === "{" || ch === "[") depth++;
        else if (ch === "}" || ch === "]") depth--;
    }
    let out = s;
    if (escaped) out = out.slice(0, -1);
    if (inString) out += '"';
    out = out.replace(/[\s,:]+$/, "");
    while (depth > 0) { out += "}"; depth--; }
    return out;
}

function unescapeJsonString(s: string): string {
    try {
        return JSON.parse('"' + s.replace(/\r\n|\r|\n/g, "\\n").replace(/\t/g, "\\t") + '"');
    } catch {
        return s
            .replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
            .replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
}

/** 正则字段抢救：JSON 无法解析时直接从文本中抠出字符串字段值（允许未闭合） */
function regexSalvageFields(text: string): InnerVoiceRawFields | null {
    const pick = (key: string): string => {
        const m = text.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)'));
        return m ? unescapeJsonString(m[1]) : "";
    };
    const thought = pick("thought");
    const status = pick("status");
    const voice = pick("心声");
    const mood = pick("心情");
    const any = thought || status || voice || mood;
    if (!any.trim()) return null;
    const out: InnerVoiceRawFields = {};
    if (thought) out.thought = thought;
    if (status) out.status = status;
    if (voice) out["心声"] = voice;
    if (mood) out["心情"] = mood;
    return out;
}

function stripCodeFences(s: string): string {
    return s.replace(/```[a-z]*\s*\n?/gi, "").replace(/```/g, "").trim();
}

/**
 * 七级兜底提取 [心声] 标签里的 JSON 对象。
 * 与 wanwan 的差异：wanwan 第 7 级把整段纯文本当 reply；float 这里解析的是
 * 心声标签内容，兜底只能是 null —— 没有可解析的字段就放弃这一轮，不展示残骸。
 */
export function extractInnerVoiceJson(text: string): InnerVoiceRawFields | null {
    if (!text) return null;
    const s = text.trim();
    if (!s) return null;

    // 1. 整段直接解析
    const direct = tryParseJsonObject(s);
    if (direct) return direct;

    // 2. 文本任意位置的代码围栏块
    const candidates: string[] = [];
    const fenced = s.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
        const inner = fenced[1].trim();
        const o = tryParseJsonObject(inner);
        if (o) return o;
        candidates.push(inner);
    }
    candidates.push(s);

    // 3-5. 括号配对提取 → 修复重试 → 截断补全
    for (const cand of candidates) {
        const sliced = sliceJsonObject(cand);
        if (!sliced) continue;
        const repaired = repairJsonText(sliced.slice);
        const o = tryParseJsonObject(sliced.slice) || tryParseJsonObject(repaired);
        if (o) return o;
        const completed = tryParseJsonObject(completeTruncatedJson(repaired));
        if (completed) return completed;
    }

    // 6. 正则字段抢救
    const salvaged = regexSalvageFields(s);
    if (salvaged) return salvaged;

    // 7. 放弃这一轮
    return null;
}

/** thought 装饰清洗：去掉模型可能附加的首尾引号/书名号（对应 wanwan _cleanThoughtDecor） */
export function cleanThoughtDecor(s: string): string {
    return (s || "").trim().replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, "").trim();
}

/** status 归一：trim 后截断到 15 字（wanwan 状态字段约束：必须简洁，约 1-15 字） */
export function normalizeInnerVoiceStatus(s: unknown): string {
    if (typeof s !== "string") return "";
    return s.trim().slice(0, 15);
}

// 仅给单测/调试暴露的围栏清洗（dispatch 侧先剥标签壳再进提取器，正常走不到）
export const __innerVoiceProtocolInternals = { stripCodeFences };
