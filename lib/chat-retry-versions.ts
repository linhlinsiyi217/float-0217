// 聊天「重试版本」：每次重试前先把原回复（及其后的内容）存成一个版本，
// 重试产生的新回复再存成下一个版本；在重试窗口里可以左右切换比较、保留所选版本，
// 也可以从任意旧版本继续重试。切换版本只替换本地记录，不会再次调用模型。
//
// 移植自 Y2K 1.2.0（AGPL-3.0，同源上游 fork），按本项目的 chat-storage / kv-db 改写。
// 存储：kv 键 `ai_phone_chat_retry_versions:<sessionId>`，缺省为空 = 旧行为（没有版本）。
// 中断恢复：重试开始前写入 pending 记录；页面被关掉或刷新后，重新进入聊天室时
// recoverPendingRetryVersions 只整理本地记录（补存新版本或还原原回复），不会调用模型。
import { kvGet, kvSetAsync } from "./kv-db";
import { CHAT_RETRY_VERSIONS_PREFIX as PREFIX } from "./chat-retry-version-store";
import { loadChatMessages, restoreChatRetryMessages, type ChatMessage } from "./chat-storage";
import { loadChatOfflineTurns, restoreChatRetryOfflineTurns, type ChatOfflineTurn } from "./chat-offline-storage";

type Row = ChatMessage | ChatOfflineTurn;
export type RetryVersion = { rows: Row[]; memberIds: string[]; createdAt: string; parent?: number };
export type RetrySeries = {
    id: string;
    sessionId: string;
    /** tail = 线上回复（替换所选回复及之后的内容）；offline = 线下段落 */
    kind: "tail" | "offline";
    /** 版本区间前一条记录的 id；没有表示从头开始 */
    anchorBeforeId?: string;
    active: number;
    versions: RetryVersion[];
    /** 重试进行中：开始前全部记录的 id，用于判断哪些是新生成的 */
    pending?: { beforeIds: string[] };
};

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const isUserRow = (row: Row) => "role" in row && row.role === "user";
const isAssistantRow = (row: Row) => !("role" in row) || row.role === "assistant";

function load(sessionId: string): RetrySeries[] {
    const raw = kvGet(PREFIX + sessionId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const valid = Array.isArray(parsed) && parsed.every((series: RetrySeries) => series?.sessionId === sessionId
        && (series.kind === "tail" || series.kind === "offline")
        && Array.isArray(series.versions) && series.versions.length > 0
        && Number.isInteger(series.active) && series.active >= 0 && series.active < series.versions.length
        && series.versions.every(version => Array.isArray(version.rows) && Array.isArray(version.memberIds)
            && version.rows.every(row => row?.sessionId === sessionId)));
    if (!valid) throw new Error("重试版本数据异常，未改动聊天记录");
    return parsed as RetrySeries[];
}

async function save(series: RetrySeries): Promise<void> {
    const all = load(series.sessionId);
    const index = all.findIndex(item => item.id === series.id);
    if (index < 0) all.push(series); else all[index] = series;
    await kvSetAsync(PREFIX + series.sessionId, JSON.stringify(all));
}

const currentRows = (series: RetrySeries): Row[] =>
    series.kind === "offline" ? loadChatOfflineTurns(series.sessionId) : loadChatMessages(series.sessionId);

function tailStart(series: RetrySeries, rows: Row[]): number {
    if (!series.anchorBeforeId) return 0;
    const index = rows.findIndex(row => row.id === series.anchorBeforeId);
    if (index < 0) throw new Error("这段聊天的前文已变动，不能安全切换版本");
    return index + 1;
}

/** 同一轮回复的所有气泡（拆分发送 / 群聊整轮）。 */
function sameReply(rows: ChatMessage[], target: ChatMessage): ChatMessage[] {
    return rows.filter(row => row.id === target.id
        || Boolean(target.responseRoundId && row.responseRoundId === target.responseRoundId)
        || Boolean(target.responseBatchId && row.responseBatchId === target.responseBatchId));
}

/** 重试起点：把拆分回复 / 群聊整轮和它们的工具调用记录放在一起，不留半截。 */
export function retryMessageStart(rows: ChatMessage[], targetId: string, series?: RetrySeries): number {
    if (series?.kind === "tail") return tailStart(series, rows);
    let index = rows.findIndex(row => row.id === targetId);
    if (index < 0) return index;
    const target = rows[index];
    if (target.role !== "assistant") return index;
    const first = rows.findIndex(row => target.responseRoundId
        ? row.responseRoundId === target.responseRoundId
        : target.responseBatchId ? row.responseBatchId === target.responseBatchId : row.id === target.id);
    if (first >= 0 && first < index) index = first;
    while (true) {
        const executions = new Set(rows.slice(index).map(row => row.toolExecutionId).filter(Boolean));
        const linked = rows.findIndex(row => Boolean(row.toolExecutionId && executions.has(row.toolExecutionId)));
        if (linked < 0 || linked >= index) break;
        index = linked;
    }
    return index;
}

function capture(series: RetrySeries, rows: Row[]): Row[] {
    return copy(rows.slice(tailStart(series, rows)));
}

/** 找到包含这条回复的版本组；没有返回 undefined（第一次重试）。 */
export function findRetrySeries(sessionId: string, targetId: string, offline = false): RetrySeries | undefined {
    for (const series of load(sessionId).reverse()) {
        if ((series.kind === "offline") !== offline) continue;
        if (series.pending) {
            // 上一次重试被中断但新回复已经写入：把它补成一个版本再返回
            const rows = currentRows(series), old = new Set(series.pending.beforeIds);
            const generated = rows.filter(row => !old.has(row.id));
            if (generated.some(row => row.id === targetId && !isUserRow(row))) {
                const recovered = copy(series);
                recovered.versions.push({
                    rows: copy(rows.slice(tailStart(recovered, rows))),
                    memberIds: generated.filter(row => !isUserRow(row)).map(row => row.id),
                    parent: recovered.active,
                    createdAt: new Date().toISOString(),
                });
                recovered.active = recovered.versions.length - 1;
                delete recovered.pending;
                return recovered;
            }
        }
        const active = series.versions.findIndex(version => version.memberIds.includes(targetId));
        if (active >= 0) return copy({ ...series, active });
    }
    return undefined;
}

/** 重新打开聊天室时，整理被中断的重试记录；只改本地数据，不调用模型。 */
export async function recoverPendingRetryVersions(sessionId: string): Promise<boolean> {
    let changed = false;
    for (const series of load(sessionId)) {
        if (!series.pending) continue;
        const rows = currentRows(series), sourceIds = new Set(series.versions[series.active].memberIds);
        if (rows.some(row => sourceIds.has(row.id))) {
            // 还没来得及删除原回复就中断了：保留当前记录（含用户之后的编辑）
            series.versions[series.active].rows = capture(series, rows);
            delete series.pending;
            await save(series);
        } else {
            const recovered = await finishRetryVersion(series, series.pending.beforeIds);
            delete recovered.pending;
            await save(recovered);
        }
        changed = true;
    }
    return changed;
}

/** 重试前先把原内容存成版本，再交给原有重试流程删除和重新生成。 */
export async function beginRetryVersion(sessionId: string, targetId: string, kind: RetrySeries["kind"], existing?: RetrySeries): Promise<RetrySeries> {
    const rows: Row[] = kind === "offline" ? loadChatOfflineTurns(sessionId) : loadChatMessages(sessionId);
    const index = kind === "tail" ? retryMessageStart(rows as ChatMessage[], targetId, existing) : rows.findIndex(row => row.id === targetId);
    if (index < 0) throw new Error("所选回复已不存在");
    const target = rows.find(row => row.id === targetId) as ChatMessage | undefined;
    const members = kind === "tail" && target?.role === "assistant"
        ? sameReply((rows as ChatMessage[]).slice(index), target).map(row => row.id)
        : [targetId];
    const series: RetrySeries = copy(existing ?? {
        id: `retry_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        sessionId,
        kind,
        anchorBeforeId: rows[index - 1]?.id,
        active: 0,
        versions: [{ rows: [], memberIds: members, createdAt: new Date().toISOString() }],
    });
    if (series.sessionId !== sessionId || series.kind !== kind) throw new Error("重试版本与当前回复不一致");
    series.versions[series.active].rows = capture(series, rows);
    series.pending = { beforeIds: rows.map(row => row.id) };
    await save(series);
    return series;
}

/** 重试结束：有新回复就存成新版本并选中；失败 / 中断没有新回复就还原原内容。 */
export async function finishRetryVersion(series: RetrySeries, beforeIds: string[]): Promise<RetrySeries> {
    if (!load(series.sessionId).some(item => item.id === series.id)) return series;
    const rows = currentRows(series), before = new Set(beforeIds);
    const generated = rows.filter(row => !before.has(row.id));
    const memberIds = generated.filter(row => !isUserRow(row)).map(row => row.id);
    if (!generated.some(isAssistantRow) || !memberIds.length) {
        // 没有生成新回复：放回原内容，失败提示等新增记录接在后面
        const original = series.versions[series.active].rows;
        const originalIds = new Set(original.map(row => row.id));
        const extra = generated.filter(row => !originalIds.has(row.id));
        if (series.kind === "offline") {
            await restoreChatRetryOfflineTurns(series.sessionId, [...rows.slice(0, tailStart(series, rows)), ...original, ...extra] as ChatOfflineTurn[]);
        } else {
            await restoreChatRetryMessages(series.sessionId, rows.slice(tailStart(series, rows)).map(row => row.id), [...original, ...extra] as ChatMessage[]);
        }
        const settled = copy(series);
        delete settled.pending;
        await save(settled);
        return settled;
    }
    const next = copy(series), parent = next.active;
    delete next.pending;
    next.versions.push({ rows: copy(rows.slice(tailStart(next, rows))), memberIds, createdAt: new Date().toISOString(), parent });
    next.active = next.versions.length - 1;
    await save(next);
    return next;
}

/** 切换到某个版本：先把当前内容（含之后的聊天）存回当前版本，再换上所选版本。不调用模型。 */
export async function selectRetryVersion(series: RetrySeries, index: number): Promise<RetrySeries> {
    if (!load(series.sessionId).some(item => item.id === series.id)) throw new Error("重试版本已清除，请重新打开窗口");
    if (!Number.isInteger(index) || index < 0 || index >= series.versions.length) throw new Error("没有这个重试版本");
    if (index === series.active) return series;
    const rows = currentRows(series), fingerprint = JSON.stringify(rows), next = copy(series);
    next.versions[next.active].rows = capture(next, rows);
    next.active = index;
    // 所有版本先落盘，再替换可见记录
    await save(next);
    const restored = copy(next.versions[index].rows);
    try {
        if (JSON.stringify(currentRows(series)) !== fingerprint) throw new Error("聊天记录刚刚发生变化，请重新打开重试窗口");
        if (next.kind === "offline") {
            await restoreChatRetryOfflineTurns(next.sessionId, [...rows.slice(0, tailStart(next, rows)), ...restored] as ChatOfflineTurn[]);
        } else {
            await restoreChatRetryMessages(next.sessionId, rows.slice(tailStart(next, rows)).map(row => row.id), restored as ChatMessage[]);
        }
    } catch (error) {
        next.active = series.active;
        await save(next);
        throw error;
    }
    return next;
}

/** 当前选中版本里这条回复的正文，用于窗口预览和「以所选回复为基准重写」。 */
export function retrySourceText(series: RetrySeries | undefined, targetId: string): string {
    if (!series) return "";
    const rows = series.versions[series.active].rows;
    if (series.kind === "offline") {
        const turn = (rows.find(row => row.id === targetId) ?? rows[0]) as ChatOfflineTurn | undefined;
        return turn?.assistantContent ?? "";
    }
    const memberIds = new Set(series.versions[series.active].memberIds);
    const target = (rows.find(row => row.id === targetId) ?? rows.find(row => memberIds.has(row.id))) as ChatMessage | undefined;
    if (!target || target.role !== "assistant") return "";
    return sameReply(rows as ChatMessage[], target).map(row => row.content).filter(Boolean).join("\n");
}
