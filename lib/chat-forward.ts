// lib/chat-forward.ts
// 聊天记录合并转发：选中消息 → 固化成快照（含媒体）→ 作为 forwarded_chat 消息发到目标会话。
// 行为参考 Y2K 1.2.0；身份/会话可见性按 FLOT 的聊天范围（chat-scope-storage）判断。
import { loadChatMessages, loadChatSessions, pushChatMessage, resolveChatCharacterAvatar, resolveChatUserAvatar, type ChatMessage, type ChatSession } from "./chat-storage";
import { loadCharacters } from "./character-storage";
import { characterMatchesChatScope, groupMatchesChatScope, resolveChatAccountUserIdentity } from "./chat-scope-storage";
import { getCurrentIdentityId } from "./identity-runtime";
import { formatRichMediaForHistory } from "./llm-prompt-assembler";
import { getChatImageFromIndexedDB } from "./chat-asset-storage";
import { isMediaStoreRef, loadMediaBlob } from "./media-cache-storage";
import { blobToDataUrl } from "./chat-record-transfer";
import { captureNativeMessage } from "./chat-forward-native";
import { captureForwardedAppearance, captureForwardedDisplayText, captureForwardedStickerUrl, captureForwardedTheme } from "./chat-forward-appearance";
import type { ForwardedChat } from "./chat-forward-types";

const FORWARD_LIMIT = 24 * 1024 * 1024;
const SINGLE_MEDIA_LIMIT = 12 * 1024 * 1024;
export { FORWARD_MAX_MESSAGES } from "./chat-forward-protocol";
import { FORWARD_MAX_MESSAGES } from "./chat-forward-protocol";
export const HIDDEN_FORWARD_TYPES = new Set(["tool_call", "tool_result", "tool_notice", "system_instruction", "memory_write_request", "reading_discuss", "avatar_action", "tapback_action"]);

/** 在克隆/序列化之前先估算体积与嵌套深度，防止超大快照卡死页面。 */
export function forwardedValueSize(value: unknown, limit = FORWARD_LIMIT, depth = 0): number {
    if (depth > 16) throw new Error("嵌套转发层数过多，请选择原始记录。");
    let size = 2;
    if (typeof value === "string") {
        for (let i = 0; i < value.length; i++) {
            const c = value.charCodeAt(i);
            size += c < 32 ? 6 : c === 34 || c === 92 ? 2 : c < 128 ? 1 : c < 2048 ? 2 : 3;
            if (size > limit) throw new Error("所选媒体过大，请分批转发。");
        }
    } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            size += key.length * 3 + 4 + forwardedValueSize(item, limit - size, depth + 1);
            if (size > limit) throw new Error("所选媒体过大，请分批转发。");
        }
    } else size += 16;
    if (size > limit) throw new Error("所选媒体过大，请分批转发。");
    return size;
}

export function isForwardableMessage(message: ChatMessage): boolean {
    return !message.isRetracted
        && (message.role === "user" || message.role === "assistant")
        && !message.isTyping
        && !HIDDEN_FORWARD_TYPES.has(message.mediaType || "");
}

/** 当前聊天范围内、未拉黑、未禁言、可发言的会话；actorId 给角色动作用（须是该会话成员）。 */
export function canForwardTo(session: ChatSession, actorId?: string): boolean {
    if (session.isBlacklisted || session.isSpectator) return false;
    const muteUntil = new Date(session.groupMutes?.[actorId || "self"] || "").getTime();
    if (Number.isFinite(muteUntil) && muteUntil > Date.now()) return false;
    const ids = session.isGroup ? session.participantIds || [] : [session.contactId];
    if (!ids.length || (actorId && !ids.includes(actorId))) return false;
    const known = new Set(loadCharacters().map(c => c.id));
    if (!ids.every(id => known.has(id))) return false;
    return session.isGroup ? groupMatchesChatScope(ids) : characterMatchesChatScope(session.contactId);
}

async function durableUrl(url: string | null | undefined, budget: number): Promise<string | undefined> {
    const limit = Math.min(SINGLE_MEDIA_LIMIT, budget);
    if (!url) return undefined;
    let blob: Blob | undefined;
    if (isMediaStoreRef(url)) blob = (await loadMediaBlob(url))?.blob;
    else if (/^blob:/.test(url)) blob = await (await fetch(url)).blob();
    else if (url.startsWith("asset://") || !/^(https?:|data:|\/)/.test(url)) {
        const data = await getChatImageFromIndexedDB(url.replace(/^asset:\/\//, ""));
        if (!data) throw new Error("记录中的媒体已无法读取，请重新选择。");
        forwardedValueSize(data, limit);
        return data;
    } else {
        forwardedValueSize(url, limit);
        return url;
    }
    if (!blob) throw new Error("记录中的媒体已无法读取，请重新选择。");
    if (blob.size > SINGLE_MEDIA_LIMIT) throw new Error("单个媒体超过12MB，请减少或调整所选内容。");
    if (Math.ceil(blob.size / 3) * 4 + 128 > limit) throw new Error("所选媒体过大，请分批转发。");
    return blobToDataUrl(blob);
}

const PAYMENT_STATE: Record<string, string> = { pending: "待领取", opened: "已领取", received: "已领取", declined: "已退回", paid: "已支付", canceled: "已取消" };

export async function captureForwardedChat(
    source: ChatSession,
    ids: Set<string>,
    options?: { actorId?: string; signal?: AbortSignal },
): Promise<ForwardedChat> {
    if (!ids.size || ids.size > FORWARD_MAX_MESSAGES) throw new Error(`请选择1至${FORWARD_MAX_MESSAGES}条聊天消息。`);
    const identity = getCurrentIdentityId();
    const cancelled = () => getCurrentIdentityId() !== identity || options?.signal?.aborted;
    if (cancelled()) throw new Error("转发已取消。");
    const currentSource = loadChatSessions().find(s => s.id === source.id);
    if (!currentSource || !canForwardTo(currentSource, options?.actorId)) throw new Error("来源会话已变化或不可访问。");
    const chars = loadCharacters();
    const self = resolveChatAccountUserIdentity(currentSource.chatAccountId, currentSource.contactId, "chat");
    const userName = self?.name || "用户";
    const candidates = loadChatMessages(source.id).filter(m => ids.has(m.id) && isForwardableMessage(m));
    if (!candidates.length) throw new Error("所选内容没有可转发的消息。");
    forwardedValueSize(candidates);
    const selected = structuredClone(candidates);
    const sourceName = currentSource.isGroup
        ? currentSource.groupName || "群聊"
        : currentSource.alias || chars.find(c => c.id === currentSource.contactId)?.name || "已删除角色";
    const record: ForwardedChat = {
        version: 1,
        title: currentSource.isGroup ? `${sourceName}的聊天记录` : `${userName}和${sourceName}的聊天记录`,
        sourceKind: currentSource.isGroup ? "group" : "private",
        capturedAt: new Date().toISOString(),
        origin: "history",
        sourceNames: { user: userName, character: sourceName, characterId: currentSource.contactId, ...(currentSource.isGroup ? { group: currentSource.groupName || "群聊" } : {}) },
        theme: captureForwardedTheme(selected[0].id),
        entries: [],
    };
    const userAvatar = resolveChatUserAvatar(currentSource, self?.avatarUrl) || undefined;
    let remaining = FORWARD_LIMIT - forwardedValueSize(record);
    for (const m of selected) {
        if (cancelled()) throw new Error("身份已切换或转发已取消。");
        let mediaBudget = remaining;
        const copyUrl = async (url?: string | null) => {
            const value = await durableUrl(url, mediaBudget);
            if (cancelled()) throw new Error("身份已切换或转发已取消。");
            if (value) mediaBudget -= forwardedValueSize(value, mediaBudget);
            return value;
        };
        const char = chars.find(c => c.id === (m.senderCharacterId || currentSource.contactId));
        const d = m.mediaData;
        const payment = m.mediaType === "transfer" || m.mediaType === "red_packet";
        const isUser = m.role === "user";
        const speaker = isUser ? userName : (currentSource.isGroup ? char?.name || m.senderName : sourceName) || "已删除角色";
        const avatarSource = isUser ? userAvatar : resolveChatCharacterAvatar(char) || undefined;
        record.entries.push({
            speakerId: isUser ? "user" : m.senderCharacterId || currentSource.contactId,
            speaker,
            isUser,
            createdAt: m.createdAt,
            avatar: await copyUrl(avatarSource).catch(() => undefined),
            text: payment
                ? d?.label || m.content || (m.mediaType === "red_packet" ? "恭喜发财" : "转账")
                : m.mediaType === "forwarded_chat" ? "[合并聊天记录]"
                : m.mediaType ? formatRichMediaForHistory(m, userName, char?.name || "角色", currentSource.isGroup) + (m.content.trim() ? `\n${m.content}` : "")
                : m.content,
            nativeMessage: captureNativeMessage(m),
            appearance: captureForwardedAppearance(m.id),
            displayText: m.mediaType ? undefined : captureForwardedDisplayText(m.id) ?? m.content,
            ...(m.mediaType === "audio" ? { voice: { transcript: d?.label || m.content, duration: d?.voiceDuration } } : {}),
            kind: m.mediaType === "media_file" ? d?.fileType || "file" : m.mediaType,
            mediaUrl: ["image", "audio", "video", "sticker", "media_file"].includes(m.mediaType || "")
                ? await copyUrl(m.mediaUrl || d?.stickerUrl || (m.mediaType === "sticker" ? captureForwardedStickerUrl(m.id) : undefined)).catch(error => {
                    // 语音没存音频、表情找不到图都不该挡住整次转发：降级成只留文字
                    if (m.mediaType === "audio" || m.mediaType === "sticker") return undefined;
                    throw error;
                })
                : undefined,
            ...(m.mediaType === "forwarded_chat" && d?.forwardedChat ? { nested: structuredClone(d.forwardedChat) } : {}),
            ...(m.mediaType === "music_share" || m.mediaType === "music" ? { music: { title: d?.musicTitle || "音乐", artist: d?.musicArtist || "" } } : {}),
            ...(payment ? { amount: d?.amount, currency: d?.currency || "CNY", paymentState: d?.status ? PAYMENT_STATE[d.status] : "待领取", claims: [...(d?.claimedBy || [])] } : {}),
        });
        remaining -= forwardedValueSize(record.entries[record.entries.length - 1], remaining);
    }
    const latestSource = loadChatSessions().find(item => item.id === source.id);
    if (cancelled() || !latestSource || !canForwardTo(latestSource, options?.actorId)) throw new Error("来源会话、身份或权限已变化，请重新选择。");
    const currentMessages = new Set(loadChatMessages(source.id).filter(message => !message.isRetracted).map(message => message.id));
    if (selected.some(message => !currentMessages.has(message.id))) throw new Error("来源消息已删除或撤回，请重新选择。");
    if (!record.entries.length) throw new Error("所选内容没有可转发的消息。");
    return record;
}

export function sendForwardedChat(record: ForwardedChat, targetId: string, identity: string | null, actorId?: string): ChatMessage {
    forwardedValueSize(record);
    if (getCurrentIdentityId() !== identity) throw new Error("身份已切换，请重新选择。");
    const target = loadChatSessions().find(s => s.id === targetId);
    if (!target || !canForwardTo(target, actorId)) throw new Error("当前无法向该会话发送。");
    const sent = pushChatMessage({
        sessionId: target.id,
        role: actorId ? "assistant" : "user",
        ...(actorId ? { senderCharacterId: actorId, senderName: loadCharacters().find(c => c.id === actorId)?.name } : {}),
        content: "",
        mediaType: "forwarded_chat",
        mediaData: { forwardedChat: structuredClone(record) },
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: target.id } }));
    return sent;
}
