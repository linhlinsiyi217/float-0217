import { loadChatSessions } from "./chat-storage";
import { formatChatTimestamp } from "./llm-prompt-assembler";
import { kvGet, kvRemove, kvSet, registerDynamicPrefix } from "./kv-db";

const CHAT_OFFLINE_TURNS_PREFIX = "ai_phone_chat_offline_turns:";
const CHAT_OFFLINE_MIGRATED_SUMMARIES_PREFIX = "ai_phone_chat_offline_migrated_summaries:";
registerDynamicPrefix(CHAT_OFFLINE_TURNS_PREFIX);
registerDynamicPrefix(CHAT_OFFLINE_MIGRATED_SUMMARIES_PREFIX);

export type ChatOfflineTurn = {
    id: string;
    sessionId: string;
    userContent: string;
    assistantContent: string;
    summary: string;
    summaryTag: string;
    rawText?: string;
    reasoningText?: string; // 模型思维链（reasoning/CoT）内容
    thinkingText?: string; // 预设格式 <thinking> 标签解析出的思维链（展示优先于 reasoningText）
    thinkingTag?: string; // 实际用于提取思维链的标签名（preset.thinking_tag 或默认 thinking）
    /** 段落收藏位：书页式线下页按段收藏，一段 turn 拆成我写的 / 对方写的两段，各有一个标记 */
    faved?: { user?: boolean; assistant?: boolean };
    createdAt: string;
};

export type ChatOfflineArchive = {
    id: string;
    sessionId: string;
    endedAt: string;
    /** 结束这一场时正文里有多少段（一轮 = 两段） */
    turnCount: number;
    /** 第一段的时间，列表里当「开始时间」用 */
    startedAt: string;
    turns: ChatOfflineTurn[];
};

export type ChatOfflineOpener = {
    id: string;
    text: string;
};

export type ChatOfflineProjectionEntry = {
    id: string;
    sessionId: string;
    groupSessionId?: string;
    timestamp: string;
    content: string;
};

export type ParsedOfflineResponse = {
    rawText: string;
    content: string;
    summary: string;
    summaryTag: string;
    thinking?: string; // 预设格式 <thinking> 标签内容（与模型 API 原生 reasoning 无关）
    thinkingTag?: string; // 实际用于提取思维链的标签名
};

function storageKey(sessionId: string): string {
    return `${CHAT_OFFLINE_TURNS_PREFIX}${sessionId}`;
}

function migratedSummaryKey(sessionId: string): string {
    return `${CHAT_OFFLINE_MIGRATED_SUMMARIES_PREFIX}${sessionId}`;
}

function loadMigratedSummaryEntries(sessionId: string): ChatOfflineProjectionEntry[] {
    try {
        const parsed = JSON.parse(kvGet(migratedSummaryKey(sessionId)) || "[]") as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is ChatOfflineProjectionEntry => Boolean(
            item && typeof item === "object"
            && typeof (item as ChatOfflineProjectionEntry).id === "string"
            && typeof (item as ChatOfflineProjectionEntry).timestamp === "string"
            && typeof (item as ChatOfflineProjectionEntry).content === "string",
        ));
    } catch {
        return [];
    }
}

/** 清空旧线下正文前，把已有摘要转成独立的短期事件投影。 */
export function preserveChatOfflineSummaries(sessionId: string): number {
    const existing = loadMigratedSummaryEntries(sessionId);
    const known = new Set(existing.map((item) => item.id));
    const additions = loadChatOfflineTurns(sessionId).flatMap((turn): ChatOfflineProjectionEntry[] => {
        const summaryText = compactProjectionText(turn.summary, 500);
        const id = `chat_offline_migrated_${turn.id}`;
        if (!summaryText || known.has(id)) return [];
        return [{
            id,
            sessionId,
            timestamp: turn.createdAt,
            content: `[事件 ${formatChatTimestamp(turn.createdAt)}] ${summaryText}`,
        }];
    });
    if (additions.length) kvSet(migratedSummaryKey(sessionId), JSON.stringify([...existing, ...additions]));
    return additions.length;
}

function createTurnId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeTurn(value: unknown): ChatOfflineTurn | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<ChatOfflineTurn>;
    if (typeof item.id !== "string" || typeof item.sessionId !== "string") return null;
    if (typeof item.userContent !== "string" || typeof item.assistantContent !== "string") return null;
    if (typeof item.createdAt !== "string") return null;
    return {
        id: item.id,
        sessionId: item.sessionId,
        userContent: item.userContent,
        assistantContent: item.assistantContent,
        summary: typeof item.summary === "string" ? item.summary : "",
        summaryTag: typeof item.summaryTag === "string" && item.summaryTag.trim() ? item.summaryTag.trim() : "summary",
        rawText: typeof item.rawText === "string" ? item.rawText : undefined,
        reasoningText: typeof item.reasoningText === "string" ? item.reasoningText : undefined,
        thinkingText: typeof item.thinkingText === "string" ? item.thinkingText : undefined,
        thinkingTag: typeof item.thinkingTag === "string" ? item.thinkingTag : undefined,
        faved: normalizeFaved(item.faved),
        createdAt: item.createdAt,
    };
}

function normalizeFaved(value: unknown): { user?: boolean; assistant?: boolean } | undefined {
    if (!value || typeof value !== "object") return undefined;
    const src = value as { user?: unknown; assistant?: unknown };
    const faved: { user?: boolean; assistant?: boolean } = {};
    if (src.user === true) faved.user = true;
    if (src.assistant === true) faved.assistant = true;
    return Object.keys(faved).length ? faved : undefined;
}

export function loadChatOfflineTurns(sessionId: string): ChatOfflineTurn[] {
    try {
        const raw = kvGet(storageKey(sessionId));
        const parsed = raw ? JSON.parse(raw) as unknown : [];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(normalizeTurn)
            .filter((turn): turn is ChatOfflineTurn => Boolean(turn))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
        return [];
    }
}

export function saveChatOfflineTurns(sessionId: string, turns: ChatOfflineTurn[]): void {
    const normalized = turns
        .map(normalizeTurn)
        .filter((turn): turn is ChatOfflineTurn => Boolean(turn))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    kvSet(storageKey(sessionId), JSON.stringify(normalized));
}

export function clearChatOfflineTurns(sessionId: string): void {
    kvRemove(storageKey(sessionId));
}

export function appendChatOfflineTurn(input: {
    sessionId: string;
    userContent: string;
    assistantContent: string;
    summary: string;
    summaryTag: string;
    rawText?: string;
    reasoningText?: string;
    thinkingText?: string;
    thinkingTag?: string;
}): ChatOfflineTurn {
    const turn: ChatOfflineTurn = {
        id: createTurnId(),
        sessionId: input.sessionId,
        userContent: input.userContent,
        assistantContent: input.assistantContent,
        summary: input.summary,
        summaryTag: input.summaryTag.trim() || "summary",
        rawText: input.rawText,
        reasoningText: input.reasoningText,
        thinkingText: input.thinkingText,
        thinkingTag: input.thinkingTag,
        createdAt: new Date().toISOString(),
    };
    saveChatOfflineTurns(input.sessionId, [...loadChatOfflineTurns(input.sessionId), turn]);
    return turn;
}

export function updateChatOfflineTurn(
    sessionId: string,
    turnId: string,
    patch: Partial<Pick<ChatOfflineTurn, "userContent" | "assistantContent" | "summary" | "summaryTag" | "rawText" | "reasoningText" | "thinkingText" | "thinkingTag" | "faved">>,
): ChatOfflineTurn | null {
    let updated: ChatOfflineTurn | null = null;
    const turns = loadChatOfflineTurns(sessionId).map((turn) => {
        if (turn.id !== turnId) return turn;
        updated = {
            ...turn,
            ...patch,
            summaryTag: patch.summaryTag?.trim() || turn.summaryTag || "summary",
        };
        return updated;
    });
    if (updated) saveChatOfflineTurns(sessionId, turns);
    return updated;
}

export function deleteChatOfflineTurnsFrom(sessionId: string, turnId: string): ChatOfflineTurn[] {
    const turns = loadChatOfflineTurns(sessionId);
    const idx = turns.findIndex((turn) => turn.id === turnId);
    if (idx < 0) return turns;
    const next = turns.slice(0, idx);
    saveChatOfflineTurns(sessionId, next);
    return next;
}

// 收藏是按侧标记的，清掉一侧时把它那一侧的收藏也摘掉；全空就整个去掉
function clearFavedSide(faved: ChatOfflineTurn["faved"], role: "user" | "assistant") {
    if (!faved || !faved[role]) return faved;
    const next = { ...faved };
    delete next[role];
    return Object.keys(next).length ? next : undefined;
}

// 清空 turn 里一侧的正文（assistant 侧的摘要/思维链跟着回复走，一并清掉）。
// 两侧都空了就把这一轮整条移除。旧数据零迁移：老轮次照常读，只是被删的那侧变空。
export function clearChatOfflineTurnSide(
    sessionId: string,
    turnId: string,
    role: "user" | "assistant",
): ChatOfflineTurn[] {
    const turns = loadChatOfflineTurns(sessionId);
    const next: ChatOfflineTurn[] = [];
    for (const turn of turns) {
        if (turn.id !== turnId) {
            next.push(turn);
            continue;
        }
        if (role === "user") {
            const cleared: ChatOfflineTurn = { ...turn, userContent: "", faved: clearFavedSide(turn.faved, "user") };
            if (cleared.assistantContent.trim()) next.push(cleared);
        } else {
            const cleared: ChatOfflineTurn = {
                ...turn,
                assistantContent: "",
                summary: "",
                rawText: undefined,
                reasoningText: undefined,
                thinkingText: undefined,
                thinkingTag: undefined,
                faved: clearFavedSide(turn.faved, "assistant"),
            };
            if (cleared.userContent.trim()) next.push(cleared);
        }
    }
    saveChatOfflineTurns(sessionId, next);
    return next;
}

// 时光回溯（方案一·轻）：回到某一段之前——两段式确认放在界面层，这里只管截断。
// 长按你写的段：回到你落笔之前，这一轮（连同回复）和后面全部丢弃；
// 长按 TA 写的段：回到 TA 落笔之前，保留你写的（留下半轮），TA 的回复和后面全部丢弃。
// 数据上就是 turn 数组截断 + 一次半轮清空，AI 上下文随数组自然变短。
export function rewindChatOfflineTurnBefore(
    sessionId: string,
    turnId: string,
    role: "user" | "assistant",
): ChatOfflineTurn[] {
    const turns = loadChatOfflineTurns(sessionId);
    const idx = turns.findIndex((turn) => turn.id === turnId);
    if (idx < 0) return turns;
    let next: ChatOfflineTurn[];
    if (role === "user") {
        next = turns.slice(0, idx);
    } else if (turns[idx].userContent.trim()) {
        next = [
            ...turns.slice(0, idx),
            {
                ...turns[idx],
                assistantContent: "",
                summary: "",
                rawText: undefined,
                reasoningText: undefined,
                thinkingText: undefined,
                thinkingTag: undefined,
                faved: clearFavedSide(turns[idx].faved, "assistant"),
            },
        ];
    } else {
        // 你这侧本来就没字：等价于从这一轮起整轮丢弃
        next = turns.slice(0, idx);
    }
    saveChatOfflineTurns(sessionId, next);
    return next;
}

function compactProjectionText(text: string, maxLen: number): string {
    const plain = text
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/[#>*_`-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!plain) return "";
    return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
}

export function loadChatOfflineProjectionEntries(
    characterId: string,
    options?: { afterTimestamp?: string; excludeSessionId?: string },
): ChatOfflineProjectionEntry[] {
    const sessions = loadChatSessions().filter((session) => {
        if (session.id === options?.excludeSessionId) return false;
        if (session.isGroup) return session.participantIds?.includes(characterId);
        return session.contactId === characterId;
    });

    const entries: ChatOfflineProjectionEntry[] = [];
    for (const session of sessions) {
        entries.push(...loadMigratedSummaryEntries(session.id));
        for (const turn of loadChatOfflineTurns(session.id)) {
            if (options?.afterTimestamp && turn.createdAt <= options.afterTimestamp) continue;
            const summaryText = compactProjectionText(turn.summary, 500);
            if (!summaryText) continue;
            const ts = formatChatTimestamp(turn.createdAt);
            entries.push({
                id: `chat_offline_projection_${turn.id}`,
                sessionId: session.id,
                ...(session.isGroup ? { groupSessionId: session.id } : {}),
                timestamp: turn.createdAt,
                content: `[事件 ${ts}] ${summaryText}`,
            });
        }
    }

    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function escapeTagName(tag: string): string {
    return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractXmlField(rawText: string, tags: string[]): string {
    const candidates = tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter((tag, index, list) => list.indexOf(tag) === index);
    for (const tag of candidates) {
        const escaped = escapeTagName(tag);
        const match = rawText.match(new RegExp(`<${escaped}>([\\s\\S]*?)</${escaped}>`, "i"));
        const content = match?.[1]?.trim();
        if (content) return content;
    }
    return "";
}

function stripXmlField(rawText: string, tag: string): string {
    if (!tag.trim()) return rawText;
    const escaped = escapeTagName(tag.trim());
    return rawText.replace(new RegExp(`<${escaped}>[\\s\\S]*?</${escaped}>`, "gi"), "").trim();
}

/** 从原始输出中提取指定标签包裹的思维链（仅当预设开启标签解析时调用）。
 *  默认标签 thinking 时兼容 thought / think（DeepSeek R1 系模型输出 <think>）。 */
export function extractThinkingTag(rawText: string, tag?: string): string {
    const effective = (tag || "thinking").trim() || "thinking";
    const tags = effective === "thinking" ? ["thinking", "thought", "think"] : [effective];
    return extractXmlField(rawText.trim(), tags).trim();
}

export function parseOfflineResponse(rawText: string, summaryTag: string): ParsedOfflineResponse {
    const trimmed = rawText.trim();
    const effectiveSummaryTag = summaryTag.trim() || "summary";
    const summary = extractXmlField(trimmed, [effectiveSummaryTag, "summary"]);
    let content = extractXmlField(trimmed, ["content"]);
    if (!content) {
        // 无 <content> 标签时回退到剥掉摘要标签后的全文
        content = stripXmlField(stripXmlField(trimmed, effectiveSummaryTag), "summary");
    }
    return {
        rawText: trimmed,
        content: content.trim(),
        summary: summary.trim(),
        summaryTag: effectiveSummaryTag,
    };
}

// ── 聊天列表用：最后一条线下记录 ─────────────────────────────
// 聊天列表在每次渲染时都会逐会话读取，这里按原始 JSON 串缓存解析结果，
// 避免把整段线下记录反复 parse。
const lastTurnCache = new Map<string, { raw: string; turn: ChatOfflineTurn | null }>();

export function getLastChatOfflineTurn(sessionId: string): ChatOfflineTurn | null {
    let raw = "";
    try {
        raw = kvGet(storageKey(sessionId)) || "";
    } catch {
        return null;
    }
    const cached = lastTurnCache.get(sessionId);
    if (cached && cached.raw === raw) return cached.turn;
    const turns = raw ? loadChatOfflineTurns(sessionId) : [];
    const turn = turns.length ? turns[turns.length - 1] : null;
    lastTurnCache.set(sessionId, { raw, turn });
    return turn;
}

// 线下记录没有普通消息那样的 preview 字段，这里从摘要/正文里压一条出来，
// 并带上「线下」标记，方便在列表里跟线上消息区分。
export function getChatOfflineTurnPreview(turn: ChatOfflineTurn | null): string {
    if (!turn) return "";
    const source = turn.summary.trim() || turn.assistantContent.trim() || turn.userContent.trim();
    const text = compactProjectionText(source, 60);
    return text ? `[线下] ${text}` : "";
}

// ── 结束这一场：正文归档 ─────────────────────────────
// 结束约会不是删除：这一场的正文整份搬进归档键，空出来的正文从头开始写下一场。
// 归档按场次一条一条排，记录列表（书页空态下方）从这份读。
const CHAT_OFFLINE_ARCHIVE_PREFIX = "ai_phone_chat_offline_archive:";
registerDynamicPrefix(CHAT_OFFLINE_ARCHIVE_PREFIX);

function archiveKey(sessionId: string): string {
    return `${CHAT_OFFLINE_ARCHIVE_PREFIX}${sessionId}`;
}

function normalizeArchive(value: unknown): ChatOfflineArchive | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<ChatOfflineArchive>;
    if (typeof item.id !== "string" || typeof item.sessionId !== "string") return null;
    if (typeof item.endedAt !== "string" || !Array.isArray(item.turns)) return null;
    const turns = item.turns.map(normalizeTurn).filter((turn): turn is ChatOfflineTurn => Boolean(turn));
    if (!turns.length) return null;
    return {
        id: item.id,
        sessionId: item.sessionId,
        endedAt: item.endedAt,
        turnCount: typeof item.turnCount === "number" ? item.turnCount : turns.length,
        startedAt: typeof item.startedAt === "string" ? item.startedAt : turns[0].createdAt,
        turns,
    };
}

export function loadChatOfflineArchives(sessionId: string): ChatOfflineArchive[] {
    try {
        const parsed = JSON.parse(kvGet(archiveKey(sessionId)) || "[]") as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(normalizeArchive)
            .filter((item): item is ChatOfflineArchive => Boolean(item))
            .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    } catch {
        return [];
    }
}

/** 把当前正文整场归档（不 clear，调用方决定正文何时清）。返回这条归档。 */
export function archiveChatOfflineTurns(sessionId: string): ChatOfflineArchive | null {
    const turns = loadChatOfflineTurns(sessionId);
    if (!turns.length) return null;
    const archive: ChatOfflineArchive = {
        id: `offline_archive_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sessionId,
        endedAt: new Date().toISOString(),
        turnCount: turns.length,
        startedAt: turns[0].createdAt,
        turns,
    };
    const existing = loadChatOfflineArchives(sessionId);
    try {
        kvSet(archiveKey(sessionId), JSON.stringify([archive, ...existing]));
    } catch {
        // 单场太大存不下时退化为只留最近几场
        const trimmed = [archive, ...existing].slice(0, 10);
        try {
            kvSet(archiveKey(sessionId), JSON.stringify(trimmed));
        } catch {
            return null;
        }
    }
    return archive;
}

export function deleteChatOfflineArchive(sessionId: string, archiveId: string): ChatOfflineArchive[] {
    const next = loadChatOfflineArchives(sessionId).filter((item) => item.id !== archiveId);
    kvSet(archiveKey(sessionId), JSON.stringify(next));
    return next;
}

// ── 开场白：一位角色一份，按 characterId 绑 ─────────────
// 来源就一个：线下设置里手动增删改（Float 角色卡导入时 first_mes / alternate_greetings
// 被剥离不支持，见 character-storage.ts 的 UNSUPPORTED_CHARACTER_IMPORT_FIELDS）。
// 空态「选择开场白」读这份；选定的一条成为第一段（turn 的 assistantContent），
// 之后还能左右划着在候选里换，跟「重写」共用同一套候选切换。
const CHAT_OFFLINE_OPENERS_KEY = "ai_phone_chat_offline_openers";

function normalizeOpener(value: unknown): ChatOfflineOpener | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<ChatOfflineOpener>;
    if (typeof item.id !== "string" || !item.id) return null;
    if (typeof item.text !== "string" || !item.text.trim()) return null;
    return { id: item.id, text: item.text };
}

export function loadOfflineOpeners(characterId: string): ChatOfflineOpener[] {
    if (!characterId) return [];
    try {
        const parsed = JSON.parse(kvGet(CHAT_OFFLINE_OPENERS_KEY) || "{}") as unknown;
        if (!parsed || typeof parsed !== "object") return [];
        const list = (parsed as Record<string, unknown>)[characterId];
        if (!Array.isArray(list)) return [];
        return list.map(normalizeOpener).filter((item): item is ChatOfflineOpener => Boolean(item));
    } catch {
        return [];
    }
}

export function saveOfflineOpeners(characterId: string, list: ChatOfflineOpener[]): void {
    if (!characterId) return;
    let all: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(kvGet(CHAT_OFFLINE_OPENERS_KEY) || "{}") as unknown;
        if (parsed && typeof parsed === "object") all = parsed as Record<string, unknown>;
    } catch {
        all = {};
    }
    const clean = list.map(normalizeOpener).filter((item): item is ChatOfflineOpener => Boolean(item));
    if (clean.length) all[characterId] = clean;
    else delete all[characterId];
    kvSet(CHAT_OFFLINE_OPENERS_KEY, JSON.stringify(all));
}
