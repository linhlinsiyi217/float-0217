"use client";

// 心声（点击 AI 头像弹出的自定义卡片）数据层。
// 行为参考曲曲 mind-data.js：主题（提示词+字段+HTML 模板）、每条会话的绑定、
// 模型 [心声] JSON 的收存、每会话最多 50 条历史、{{字段}} 模板渲染。
// 本文件不碰 DOM；HTML 清洗在 inner-voice-safe.ts，弹窗在 components/chat/inner-voice-popup.tsx。

import { kvGet, kvSet } from "./kv-db";
import { sanitizeMindHtml, MIND_SCOPE_CLASS } from "./inner-voice-safe";
import { cleanThoughtDecor, normalizeInnerVoiceStatus } from "./inner-voice-protocol";

// ── 类型 ──

export type MindField = {
    key: string;
    desc: string;
    type?: "list";
    items?: MindField[];
};

export type MindFieldValue = string | Array<Record<string, string>>;

export type MindTheme = {
    id: string;
    name: string;
    seed?: boolean;
    prompt: string;
    fields: MindField[];
    html: string;
};

export type MindRecord = {
    id: string;
    at: number;
    tid: string;
    tname: string;
    fields: Record<string, MindFieldValue>;
    /** 模板快照：主题改了删了，历史卡还长原样 */
    html: string;
    fav?: boolean;
};

export type MindBindEntry = {
    on: boolean;
    ids: string[];
    last: string;
    pend: string;
};

export type MindRenderCtx = {
    char: string;
    user: string;
    time: string;
    date: string;
    stamp: string;
    charAvatar: string;
    userAvatar: string;
};

// ── 常量 ──

const THEMES_KEY = "chat.mind.themes";
const SEED_VER_KEY = "chat.mind.seed.v";
const BIND_KEY = "chat.mind.bind";
const SANDBOX_KEY = "chat.mind.sandbox";
const LOG_PREFIX = "chat.mind.log.";

const SEED_ID = "mind-seed";
const SEED_NAME = "默认心声";
const SEED_VER = 1;

export const MIND_LIST_MAX = 20;
export const MIND_LOG_MAX = 50;
const MIND_NAME_MAX = 24;
export const MIND_EMPTY = "None";
const MIND_NAME_DEFAULT = "未命名心声";

const MIND_BUILTIN_KEYS = ["char", "user", "time", "date", "stamp", "charAvatar", "userAvatar"];

// 花括号会拆坏模板，空格与标点会让 {{}} 对不上号；中文放行
const MIND_KEY_BAD = /[{}\s`~!@#$%^&*()+=\[\]\\|;:'",.<>\/?，。；：？！、（）【】《》“”‘’—…·]/;

// ── 内置默认主题（只读）──

export function seedMindTheme(): MindTheme {
    return {
        id: SEED_ID,
        name: SEED_NAME,
        seed: true,
        prompt: [
            "这是{{char}}此刻脑子里真实闪过的东西，不是台词，也不是写给谁看的文案。",
            "",
            "写法：",
            "- 用{{char}}自己平时想事情的词，大白话；可以不成句、可以跑题、可以前后矛盾。",
            "- 从这一轮里一个具体的点出发：{{user}}的某句话、回得慢了、自己刚发出去那条……不要泛泛感慨这段关系。",
            "- 大多数时候心里没那么多戏。困了、饿了、手上的事没做完、在想别的，都可以是心声；不必每轮都和{{user}}有关，更不必每轮都嘴硬心软。",
            "- 只知道自己知道的：可以猜{{user}}在想什么，但猜就是猜，会猜错。",
            "- 情绪有多大写多大。有点开心就是有点开心，不要放大成心动、沦陷、在意得要命。",
            "",
            "不要写：",
            "- 言情腔和金句：心跳漏了一拍、想把ta揉进怀里、只对你这样、拿你没办法、……罢了。",
            "- 身体模板和网文比喻：耳尖发烫、心口一紧、心湖、沦陷、深渊。",
            "- 总结和分析腔：「我意识到」「原来我早就」「这种感觉叫」。",
            "- 用省略号和破折号堆情绪。",
            "",
            "好感度是{{char}}此刻对{{user}}的整体感觉，0 到 100 的整数；跟着关系慢慢走，大多数轮次不变或只动一两点。",
        ].join("\n"),
        fields: [
            { key: "心情", desc: "随口说出来的那种，2 到 6 个字，不用成语和四字词" },
            { key: "心声", desc: "第一人称，此刻脑子里闪过的一两句，几个字也行，最长 60 字" },
            { key: "好感度", desc: "0 到 100 的整数，只写数字本身，不要带单位或符号" },
        ],
        html: seedMindHtml(),
    };
}

function seedMindHtml(): string {
    return [
        "<style>",
        ".ms-card { display: flex; flex-direction: column; gap: 14px;",
        "  padding: 20px; border-radius: 26px; background: #ffffff; color: #3a3a3a; }",
        ".ms-top { display: flex; align-items: center; gap: 10px; }",
        ".ms-face { flex: none; width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #ededed; }",
        ".ms-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }",
        ".ms-name { font-size: 15px; font-weight: 600; letter-spacing: .01em; color: #3a3a3a;",
        "  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
        ".ms-when { font-size: 11px; letter-spacing: .04em; color: #b8b8b8; }",
        ".ms-mood { flex: none; max-width: 42%; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }",
        ".ms-mood-key { font-size: 10px; letter-spacing: .12em; color: #b8b8b8; }",
        ".ms-mood-val { max-width: 100%; font-size: 13px; letter-spacing: .02em; color: #6e6e6e;",
        "  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
        ".ms-say { position: relative; padding: 16px 16px 16px 22px; border-radius: 14px;",
        "  background: #fafafa; color: #3a3a3a; font-size: 15px; line-height: 1.85; letter-spacing: .01em; }",
        ".ms-say::before { content: \"\"; position: absolute; left: 10px; top: 16px; bottom: 16px;",
        "  width: 2px; border-radius: 2px; background: rgba(0,0,0,.09); }",
        ".ms-fav { display: flex; align-items: center; gap: 10px; }",
        ".ms-fav-key { flex: none; font-size: 12px; letter-spacing: .04em; color: #939393; }",
        ".ms-track { flex: 1; min-width: 0; height: 6px; border-radius: 999px; overflow: hidden; background: #ededed; }",
        ".ms-fill { display: block; width: 0; max-width: 100%; height: 100%; border-radius: 999px; background: #787878; }",
        ".ms-num { flex: none; min-width: 26px; text-align: right; font-size: 12px; color: #6e6e6e; font-variant-numeric: tabular-nums; }",
        "</style>",
        '<div class="ms-card">',
        '  <div class="ms-top">',
        '    <img class="ms-face" src="{{charAvatar}}" alt="">',
        '    <div class="ms-who">',
        '      <div class="ms-name">{{char}}</div>',
        '      <div class="ms-when">{{time}}</div>',
        "    </div>",
        '    <span class="ms-mood">',
        '      <span class="ms-mood-key">MOOD</span>',
        '      <span class="ms-mood-val">{{心情}}</span>',
        "    </span>",
        "  </div>",
        '  <div class="ms-say">{{心声}}</div>',
        '  <div class="ms-fav">',
        '    <span class="ms-fav-key">好感度</span>',
        '    <span class="ms-track"><span class="ms-fill" style="width:{{好感度}}%"></span></span>',
        '    <span class="ms-num">{{好感度}}</span>',
        "  </div>",
        "</div>",
    ].join("\n");
}

// ── 主题的存与洗 ──

let _themes: MindTheme[] | null = null;
let _idSeq = 0;

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = kvGet(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function writeJson(key: string, value: unknown): void {
    try {
        kvSet(key, JSON.stringify(value));
    } catch {
        // 存储失败保持内存值即可
    }
}

export function loadMindThemes(): MindTheme[] {
    if (_themes === null) {
        _themes = normalizeMindThemes(readJson<MindTheme[] | null>(THEMES_KEY, null));
        ensureSeedTheme();
    }
    return _themes;
}

function normalizeMindThemes(raw: MindTheme[] | null | undefined): MindTheme[] {
    const out: MindTheme[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(raw) ? raw : []) {
        const t = normalizeMindTheme(item);
        if (!t || seen.has(t.id)) continue;
        seen.add(t.id);
        out.push(t);
    }
    return out;
}

function normalizeMindTheme(raw: unknown): MindTheme | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    if (!id) return null;
    return {
        id,
        name: (typeof r.name === "string" ? r.name : "").slice(0, MIND_NAME_MAX) || MIND_NAME_DEFAULT,
        seed: r.seed === true,
        prompt: typeof r.prompt === "string" ? r.prompt : "",
        fields: normalizeMindFields(r.fields),
        html: typeof r.html === "string" ? r.html : "",
    };
}

function normalizeMindFields(raw: unknown): MindField[] {
    const out: MindField[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(raw) ? raw : []) {
        if (!item || typeof item !== "object") continue;
        const f = item as Record<string, unknown>;
        const key = (typeof f.key === "string" ? f.key : "").trim();
        if (!key || seen.has(key) || MIND_KEY_BAD.test(key)) continue;
        seen.add(key);
        const one: MindField = { key, desc: typeof f.desc === "string" ? f.desc : "" };
        if (f.type === "list") {
            one.type = "list";
            one.items = normalizeMindSubs(f.items);
        }
        out.push(one);
    }
    return out;
}

function normalizeMindSubs(raw: unknown): MindField[] {
    const out: MindField[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(raw) ? raw : []) {
        if (!item || typeof item !== "object") continue;
        const f = item as Record<string, unknown>;
        const key = (typeof f.key === "string" ? f.key : "").trim();
        if (!key || seen.has(key) || MIND_KEY_BAD.test(key)) continue;
        seen.add(key);
        out.push({ key, desc: typeof f.desc === "string" ? f.desc : "" });
    }
    return out;
}

// 内置主题永远在、永远排第一、永远是当前版本的原样副本
function ensureSeedTheme(): void {
    if (!_themes) return;
    const seed = seedMindTheme();
    const at = _themes.findIndex(t => t.id === SEED_ID);
    const ver = readJson<number>(SEED_VER_KEY, 0);
    if (at === 0 && ver === SEED_VER) return;
    if (at >= 0) _themes.splice(at, 1);
    _themes.unshift(seed);
    writeJson(THEMES_KEY, _themes);
    writeJson(SEED_VER_KEY, SEED_VER);
}

export function findMindTheme(id: string): MindTheme | null {
    return loadMindThemes().find(t => t.id === id) || null;
}

function newMindId(): string {
    _idSeq++;
    return `mv${Date.now()}-${_idSeq}`;
}

export function saveMindThemes(next: MindTheme[]): boolean {
    writeJson(THEMES_KEY, next);
    _themes = next;
    return true;
}

export function createMindTheme(): MindTheme {
    return {
        id: newMindId(),
        name: "",
        prompt: "",
        fields: [{ key: "心情", desc: "" }],
        html: "",
    };
}

export function deleteMindTheme(id: string): void {
    const next = loadMindThemes().filter(t => t.id !== id);
    saveMindThemes(next);
    // 从所有会话绑定里一并摘掉
    const all = loadMindBinds();
    let changed = false;
    for (const key of Object.keys(all)) {
        if (all[key].ids.includes(id)) {
            all[key].ids = all[key].ids.filter(x => x !== id);
            changed = true;
        }
    }
    if (changed) saveMindBinds(all);
}

// ── 主题校验（编辑器用）：返回空串表示通过 ──

export function validateMindTheme(t: MindTheme): string {
    if (!t.name.trim()) return "先给这份心声起个名字";
    if (!t.fields.length) return "至少要有一个字段";
    const seen = new Set<string>();
    for (let i = 0; i < t.fields.length; i++) {
        const f = t.fields[i];
        if (!f.key.trim()) return `第 ${i + 1} 个字段还没写名字`;
        if (MIND_KEY_BAD.test(f.key)) return `字段名「${f.key}」里有空格或标点，去掉再存`;
        if (seen.has(f.key)) return `字段名「${f.key}」重复了`;
        seen.add(f.key);
        if (f.type === "list") {
            const items = f.items || [];
            if (!items.length) return `列表「${f.key}」至少要有一个子字段`;
            const subSeen = new Set<string>();
            for (let j = 0; j < items.length; j++) {
                const sub = items[j];
                if (!sub.key.trim()) return `列表「${f.key}」第 ${j + 1} 个子字段还没写名字`;
                if (MIND_KEY_BAD.test(sub.key)) return `子字段名「${sub.key}」里有空格或标点，去掉再存`;
                if (subSeen.has(sub.key)) return `列表「${f.key}」里子字段「${sub.key}」重复了`;
                subSeen.add(sub.key);
            }
        }
    }
    return validateMindHtml(t.html, t.fields);
}

function isBuiltinKey(name: string): boolean {
    return MIND_BUILTIN_KEYS.includes(name);
}

function validateMindHtml(html: string, fields: MindField[]): string {
    const re = /\{\{\s*([#^/]?)\s*([^{}]{1,40}?)\s*\}\}/g;
    const open: Array<{ key: string; list: MindField | null }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
        const mark = m[1];
        const name = m[2];
        if (mark === "/") {
            const top = open.length ? open[open.length - 1] : null;
            if (!top) return `HTML 里的 {{/${name}}} 前面没有对应的 {{#${name}}}`;
            if (top.key !== name) return `{{#${top.key}}} 还没用 {{/${top.key}}} 关上，就出现了 {{/${name}}}`;
            open.pop();
            continue;
        }
        const own = lookupFieldOwn(name, fields, open);
        if (mark) {
            if (!own) return `HTML 里的 {{${mark}${name}}} 没有对应的字段`;
            if (open.some(o => o.key === name)) return `{{#${name}}} 块里不能再套一个同名的块`;
            open.push({ key: name, list: mark === "#" && isListField(own) ? own : null });
            continue;
        }
        if (isBuiltinKey(name)) continue;
        if (!own) return `HTML 里的 {{${name}}} 没有对应的字段`;
        if (isListField(own)) return `「${name}」是列表字段，要写成 {{#${name}}}…{{/${name}}}`;
    }
    if (open.length) {
        const last = open[open.length - 1].key;
        return `{{#${last}}} 没有用 {{/${last}}} 关上`;
    }
    return "";
}

function lookupFieldOwn(name: string, fields: MindField[], open: Array<{ key: string; list: MindField | null }>): MindField | null {
    for (let i = open.length - 1; i >= 0; i--) {
        const list = open[i].list;
        if (!list) continue;
        const hit = (list.items || []).find(s => s.key === name);
        if (hit) return hit;
    }
    return fields.find(f => f.key === name) || null;
}

// ── 每条会话的绑定 ──

let _binds: Record<string, MindBindEntry> | null = null;

function loadMindBinds(): Record<string, MindBindEntry> {
    if (_binds === null) {
        const raw = readJson<Record<string, unknown> | null>(BIND_KEY, null);
        const out: Record<string, MindBindEntry> = {};
        if (raw && typeof raw === "object") {
            for (const k of Object.keys(raw)) out[k] = normalizeMindBind(raw[k]);
        }
        _binds = out;
    }
    return _binds;
}

function normalizeMindBind(raw: unknown): MindBindEntry {
    const s: MindBindEntry = { on: true, ids: [SEED_ID], last: "", pend: "" };
    if (!raw || typeof raw !== "object") return s;
    const r = raw as Record<string, unknown>;
    if (typeof r.on === "boolean") s.on = r.on;
    s.last = typeof r.last === "string" ? r.last : "";
    s.pend = typeof r.pend === "string" ? r.pend : "";
    if (Array.isArray(r.ids)) {
        const ids: string[] = [];
        const seen = new Set<string>();
        for (const id of r.ids) {
            if (typeof id !== "string" || !id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
        s.ids = ids;
    }
    return s;
}

function saveMindBinds(all: Record<string, MindBindEntry>): void {
    _binds = all;
    writeJson(BIND_KEY, all);
}

function mindBind(sessionId: string): MindBindEntry {
    const all = loadMindBinds();
    if (!all[sessionId]) all[sessionId] = normalizeMindBind(null);
    return all[sessionId];
}

export function getMindSessionBinding(sessionId: string): MindBindEntry {
    return { ...mindBind(sessionId) };
}

export function setMindSessionEnabled(sessionId: string, on: boolean): void {
    const b = mindBind(sessionId);
    b.on = !!on;
    saveMindBinds(loadMindBinds());
}

export function toggleMindThemeBinding(sessionId: string, id: string): void {
    const b = mindBind(sessionId);
    const at = b.ids.indexOf(id);
    if (at >= 0) b.ids.splice(at, 1);
    else b.ids.push(id);
    saveMindBinds(loadMindBinds());
}

export function isMindThemeBound(sessionId: string, id: string): boolean {
    return mindBind(sessionId).ids.includes(id);
}

// 这条会话这一轮能用的主题（删掉的主题在这里落地）
export function usableMindThemes(sessionId: string): MindTheme[] {
    const b = mindBind(sessionId);
    if (!b.on) return [];
    const out: MindTheme[] = [];
    for (const id of b.ids) {
        const t = findMindTheme(id);
        if (t) out.push(t);
    }
    return out;
}

// 抽一份：勾了 3 个及以上时排除上一轮那份（两个以内不排除，排除就成严格轮换了）
export function pickMindTheme(sessionId: string): MindTheme | null {
    const list = usableMindThemes(sessionId);
    if (!list.length) return null;
    const b = mindBind(sessionId);
    let pool = list;
    if (list.length >= 3 && b.last) {
        const filtered = list.filter(t => t.id !== b.last);
        if (filtered.length) pool = filtered;
    }
    const hit = pool[Math.floor(Math.random() * pool.length)];
    b.last = hit.id;
    b.pend = hit.id;
    saveMindBinds(loadMindBinds());
    return hit;
}

function pendingMindTheme(sessionId: string): MindTheme | null {
    const id = mindBind(sessionId).pend;
    return id ? findMindTheme(id) : null;
}

function clearPendingMindTheme(sessionId: string): void {
    const all = loadMindBinds();
    const b = all[sessionId];
    if (!b || !b.pend) return;
    b.pend = "";
    saveMindBinds(all);
}

// ── 发给模型的那一段 ──

// 注入长度上限：主题提示词是用户手写的，不加限会无限膨胀（任务书：限制注入长度）
export const MIND_PROMPT_INJECT_MAX = 1200;

function clampMindPrompt(prompt: string): string {
    const s = (prompt || "").trim();
    if (s.length <= MIND_PROMPT_INJECT_MAX) return s;
    return s.slice(0, MIND_PROMPT_INJECT_MAX).replace(/[\s,，。；;、：:！？!?…—-]+$/, "") + "…";
}

export function buildInnerVoicePromptFragment(sessionId: string): string {
    let theme: MindTheme | null = null;
    try {
        theme = pickMindTheme(sessionId);
    } catch {
        return "";
    }
    if (!theme || !theme.fields.length) return "";

    const body = theme.prompt ? `${clampMindPrompt(theme.prompt)}\n\n` : "";
    const listNotes = buildMindListNotes(theme);
    const hasList = theme.fields.some(isListField);
    const rule = hasList
        ? "文字字段的值是一个普通字符串；列表字段的值是一个数组，每一项是一个对象，只含示例里那几个子字段，子字段的值也是普通字符串。不要用 Markdown，不要加代码块。\n实在写不出的文字字段填空字符串，列表一项都没有就给空数组，但字段本身仍然要在。\n"
        : "每个值都是一个普通字符串：不要写成数组或对象，不要用 Markdown，不要加代码块。\n实在写不出的那一个填空字符串，但字段本身仍然要在。\n";

    return [
        "",
        "### 心声（点开 AI 头像看到的卡片）",
        "",
        body +
        "除了上面那份回复，这一轮还要多交一份心声。在回复的末尾单独输出，用方括号标签包住一份 JSON：" +
        "",
        "[心声]",
        buildMindShapeText(theme.fields),
        "[/心声]",
        "",
        listNotes +
        `心声 JSON 里只能有上面列出的这 ${theme.fields.length} 个字段，一个都不能少、一个都不能多，字段名原样照抄。\n` +
        rule +
        "心声是角色没说出口的东西，不要把它复述进聊天回复里。\n" +
        "聊天回复里禁用的写法，在心声里同样禁用；心声不是放开写文艺的地方。",
    ].join("\n");
}

function isListField(f: MindField): boolean {
    return f.type === "list";
}

function buildMindListNotes(theme: MindTheme): string {
    let out = "";
    for (const f of theme.fields) {
        if (!isListField(f)) continue;
        out += `- ${f.key} 是列表${f.desc ? `：${f.desc}` : "，条数按需要来"}（最多 ${MIND_LIST_MAX} 项）\n`;
    }
    return out;
}

// 字段长什么样，写成一段示意 JSON
function buildMindShapeText(fields: MindField[]): string {
    const rows: string[] = [];
    for (const f of fields) {
        const key = f.key || "字段名";
        if (!isListField(f)) {
            rows.push(`  "${key}": "${f.desc || "按字段名理解"}"`);
            continue;
        }
        const subs = (f.items || []).map(s => `"${s.key || "子字段"}": "${s.desc || "按字段名理解"}"`);
        rows.push(`  "${key}": [\n    { ${subs.join(", ")} },\n    …\n  ]`);
    }
    return `{\n${rows.join(",\n")}\n}`;
}

// ── 收回来那一份 ──

function takeMindText(v: unknown): string {
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
    return "";
}

function takeMindList(f: MindField, v: unknown): Array<Record<string, string>> {
    if (typeof v === "string" && /^\s*\[/.test(v)) {
        try { v = JSON.parse(v); } catch { v = null; }
    }
    const src = Array.isArray(v) ? v : [];
    const out: Array<Record<string, string>> = [];
    for (const raw of src) {
        if (out.length >= MIND_LIST_MAX) break;
        const item: Record<string, string> = {};
        let any = false;
        for (const sub of f.items || []) {
            const val = takeMindText(raw && typeof raw === "object" ? (raw as Record<string, unknown>)[sub.key] : null);
            item[sub.key] = val;
            if (val) any = true;
        }
        if (any) out.push(item);
    }
    return out;
}

// wanwan 心声协议键名 → float 主题字段别名：模型按 {thought,status,reply} 直出时也能落库。
// reply 是正文，不在此映射（正文由聊天主流程处理，永远不进入心声卡片）。
const MIND_KEY_ALIASES: Record<string, string[]> = {
    "心声": ["thought", "inner_voice", "innerVoice"],
    "心情": ["status", "mood", "状态"],
};

// 只保留主题声明过的字段，多的忽略、缺的补空；全空返回 null（那一轮当没心声）
export function normalizeMindFieldsInput(theme: MindTheme, raw: unknown): Record<string, MindFieldValue> | null {
    if (!theme.fields.length) return null;
    const src = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const out: Record<string, MindFieldValue> = {};
    let any = false;
    for (const f of theme.fields) {
        if (isListField(f)) {
            const list = takeMindList(f, src[f.key]);
            if (list.length) any = true;
            out[f.key] = list;
        } else {
            let text = takeMindText(src[f.key]);
            if (!text) {
                for (const alias of MIND_KEY_ALIASES[f.key] || []) {
                    text = takeMindText(src[alias]);
                    if (text) break;
                }
            }
            // wanwan 协议约束：thought 去首尾装饰引号；status（心情）≤15 字
            if (text && f.key === "心声") text = cleanThoughtDecor(text);
            if (text && f.key === "心情") text = normalizeInnerVoiceStatus(text) || text;
            if (text) any = true;
            out[f.key] = text;
        }
    }
    return any ? out : null;
}

// ── 历史 ──

export function loadMindRecords(sessionId: string): MindRecord[] {
    const raw = readJson<MindRecord[] | null>(LOG_PREFIX + sessionId, null);
    const out: MindRecord[] = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const rec = normalizeMindRecord(item);
        if (rec) out.push(rec);
    }
    return out.length > MIND_LOG_MAX ? out.slice(out.length - MIND_LOG_MAX) : out;
}

function normalizeMindRecord(raw: unknown): MindRecord | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    if (!id) return null;
    const fields: Record<string, MindFieldValue> = {};
    let any = false;
    if (r.fields && typeof r.fields === "object") {
        for (const k of Object.keys(r.fields as Record<string, unknown>)) {
            const v = normalizeMindVal((r.fields as Record<string, unknown>)[k]);
            fields[k] = v;
            if (mindValAny(v)) any = true;
        }
    }
    if (!any) return null;
    return {
        id,
        at: typeof r.at === "number" ? r.at : 0,
        tid: typeof r.tid === "string" ? r.tid : "",
        tname: typeof r.tname === "string" ? r.tname : "",
        fields,
        html: typeof r.html === "string" ? r.html : "",
        fav: r.fav === true ? true : undefined,
    };
}

function normalizeMindVal(v: unknown): MindFieldValue {
    if (typeof v === "string") return v;
    if (!Array.isArray(v)) return "";
    const out: Array<Record<string, string>> = [];
    for (const raw of v) {
        if (out.length >= MIND_LIST_MAX) break;
        if (!raw || typeof raw !== "object") continue;
        const item: Record<string, string> = {};
        for (const k of Object.keys(raw as Record<string, unknown>)) {
            item[k] = typeof (raw as Record<string, unknown>)[k] === "string" ? (raw as Record<string, unknown>)[k] as string : "";
        }
        out.push(item);
    }
    return out;
}

function mindValAny(v: MindFieldValue): boolean {
    if (typeof v === "string") return !!v;
    for (const item of v || []) {
        for (const k of Object.keys(item)) {
            if (item[k]) return true;
        }
    }
    return false;
}

/** 摘要用的一行字：列表按项拼起来 */
export function mindValueText(v: MindFieldValue): string {
    if (typeof v === "string") return v;
    const rows: string[] = [];
    for (const item of v || []) {
        const parts = Object.keys(item).map(k => item[k]).filter(Boolean);
        if (parts.length) rows.push(parts.join(" "));
    }
    return rows.join("；");
}

let _recSeq = 0;

/** 模型 [心声] JSON 落库。主题认这一轮飞出去时抽中的那份（pend），认不到退回第一份可用主题或内置。 */
export function saveMindRecordFromDispatch(sessionId: string, rawFields: unknown): MindRecord | null {
    if (!sessionId) return null;
    let theme = pendingMindTheme(sessionId) || usableMindThemes(sessionId)[0] || null;
    if (!theme) theme = seedMindTheme();
    const fields = normalizeMindFieldsInput(theme, rawFields);
    if (!fields) return null;

    _recSeq++;
    const rec: MindRecord = {
        id: `v${Date.now()}-${_recSeq}`,
        at: Date.now(),
        tid: theme.id,
        tname: theme.name,
        fields,
        html: theme.html,
    };
    const list = loadMindRecords(sessionId).concat([rec]);
    writeJson(LOG_PREFIX + sessionId, list.length > MIND_LOG_MAX ? list.slice(list.length - MIND_LOG_MAX) : list);

    const all = loadMindBinds();
    const b = all[sessionId];
    if (b) b.last = theme.id;
    saveMindBinds(all);
    clearPendingMindTheme(sessionId);
    return rec;
}

export function deleteMindRecord(sessionId: string, recId: string): MindRecord[] {
    const next = loadMindRecords(sessionId).filter(r => r.id !== recId);
    writeJson(LOG_PREFIX + sessionId, next);
    return next;
}

export function setMindRecordFav(sessionId: string, recId: string, fav: boolean): void {
    const list = loadMindRecords(sessionId);
    const next = list.map(r => (r.id === recId ? { ...r, fav: fav || undefined } : r));
    writeJson(LOG_PREFIX + sessionId, next);
}

// ── 进阶沙箱开关 ──

export function getMindSandbox(): boolean {
    return kvGet(SANDBOX_KEY) === "1";
}

export function setMindSandbox(on: boolean): void {
    kvSet(SANDBOX_KEY, on ? "1" : "0");
}

// ── 渲染 ──

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function safeMindUrl(url: string): string {
    const s = typeof url === "string" ? url : "";
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(s)) return s;
    if (/^[\w./-]+$/.test(s)) return s;
    return "";
}

/** 清洗 + 作用域 + {{字段}} 填充，返回可直接注入弹窗卡片的 HTML */
export function renderMindCard(rec: Pick<MindRecord, "html" | "fields">, ctx: MindRenderCtx): string {
    const safe = sanitizeMindHtml(rec.html || "", "." + MIND_SCOPE_CLASS);
    return fillMindTemplate(safe, rec.fields, ctx);
}

/** 只填充不清洗：进阶沙箱模式专用（HTML 原样进 sandbox iframe，字段值仍然转义） */
export function renderMindCardRaw(rec: Pick<MindRecord, "html" | "fields">, ctx: MindRenderCtx): string {
    return fillMindTemplate(rec.html || "", rec.fields, ctx);
}

function lookupValue(key: string, fields: Record<string, MindFieldValue>, item: Record<string, string> | null): MindFieldValue | undefined {
    if (item && Object.prototype.hasOwnProperty.call(item, key)) return item[key];
    if (Object.prototype.hasOwnProperty.call(fields, key)) return fields[key];
    return undefined;
}

function fillMindTemplate(html: string, fields: Record<string, MindFieldValue>, ctx: MindRenderCtx): string {
    return fillMindIn(String(html), fields, null, ctx);
}

// {{字段}} 替换：所有代入的字段值一律转义。支持 {{#列表}} 重复与 {{^字段}} 空块
function fillMindIn(html: string, fields: Record<string, MindFieldValue>, item: Record<string, string> | null, ctx: MindRenderCtx): string {
    const block = /\{\{\s*([#^])\s*([^{}]{1,40}?)\s*\}\}([\s\S]*?)\{\{\s*\/\s*\2\s*\}\}/g;
    html = html.replace(block, (_all, mark: string, key: string, inner: string) => {
        const v = lookupValue(key, fields, item);
        if (v === undefined) return "";
        const on = mindValAny(v);
        if (mark === "^") return on ? "" : fillMindIn(inner, fields, item, ctx);
        if (!on) return "";
        if (typeof v === "string") return fillMindIn(inner, fields, item, ctx);
        let out = "";
        for (const it of v) out += fillMindIn(inner, fields, it, ctx);
        return out;
    });

    return html.replace(/\{\{\s*([^{}]{1,40}?)\s*\}\}/g, (all, key: string) => {
        if (key === "char") return escapeHtml(ctx.char || "");
        if (key === "user") return escapeHtml(ctx.user || "");
        if (key === "time") return escapeHtml(ctx.time || "");
        if (key === "date") return escapeHtml(ctx.date || "");
        if (key === "stamp") return escapeHtml(ctx.stamp || "");
        if (key === "charAvatar") return escapeHtml(safeMindUrl(ctx.charAvatar || ""));
        if (key === "userAvatar") return escapeHtml(safeMindUrl(ctx.userAvatar || ""));
        const v = lookupValue(key, fields, item);
        if (v === undefined) return all;
        const text = mindValueText(v);
        return text ? escapeHtml(text) : MIND_EMPTY;
    });
}

// 预览用的一份假值：每个格子显示自己的占位符原文；列表给两项，看得出重复
export function sampleMindFields(fields: MindField[]): Record<string, MindFieldValue> {
    const out: Record<string, MindFieldValue> = {};
    for (const f of fields) {
        const key = f.key.trim();
        if (!key) continue;
        if (!isListField(f)) {
            out[key] = `{{${key}}}`;
            continue;
        }
        const item: Record<string, string> = {};
        for (const sub of f.items || []) {
            const subKey = sub.key.trim();
            if (subKey) item[subKey] = `{{${subKey}}}`;
        }
        out[key] = [item, item];
    }
    return out;
}

// {{date}} / {{stamp}}：按这条心声自己的时间算，历史卡翻回去还是当天那个时刻
export function mindDateText(ts: number): string {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function mindStampText(ts: number): string {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${mindDateText(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
