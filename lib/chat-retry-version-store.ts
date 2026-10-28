// 聊天「重试版本」的存储键与清理入口。
// 单独成文件，是为了让 chat-storage / chat-offline-storage 在清空、删除会话时
// 能顺手清掉版本草稿，又不必反向依赖 chat-retry-versions（它依赖这两个存储模块）。
import { kvGet, kvRemove, kvSet, registerDynamicPrefix } from "./kv-db";

export const CHAT_RETRY_VERSIONS_PREFIX = "ai_phone_chat_retry_versions:";
registerDynamicPrefix(CHAT_RETRY_VERSIONS_PREFIX);

/** 清空 / 删除会话时一并清掉隐藏的重试版本；kind 只清线上或线下那一份。 */
export function clearChatRetryVersions(sessionId: string, kind?: "online" | "offline"): void {
    const key = CHAT_RETRY_VERSIONS_PREFIX + sessionId;
    if (!kind) { kvRemove(key); return; }
    const raw = kvGet(key);
    if (!raw) return;
    try {
        const all: unknown = JSON.parse(raw);
        if (!Array.isArray(all)) { kvRemove(key); return; }
        const retained = all.filter(series => kind === "offline" ? series?.kind !== "offline" : series?.kind === "offline");
        if (retained.length) kvSet(key, JSON.stringify(retained)); else kvRemove(key);
    } catch { kvRemove(key); }
}
