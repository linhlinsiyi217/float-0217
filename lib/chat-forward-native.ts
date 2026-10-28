// lib/chat-forward-native.ts
// 快照 ↔ 原消息：转发时只复制可见字段；查看详情时还原成只读 ChatMessage，交给原气泡组件重绘。
import type { ChatMessage } from "./chat-storage";
import type { ForwardedChat, ForwardedEntry } from "./chat-forward-types";

// 只保留可见字段。钱包流水 / 来源消息 ID / 可变句柄一律不复制。
const visibleKeys = [
    "label", "amount", "currency", "status", "count", "claimedBy", "claimedAmounts", "recipientName",
    "voiceDuration", "fileType", "fileName", "fileSize", "musicTitle", "musicArtist", "musicCoverUrl",
    "diceFace", "giftName", "giftDescription", "giftImageUrl", "giftImage", "quotePreview", "quoteRole",
    "xiaohongshuAuthor", "xiaohongshuTitle", "xiaohongshuBody", "xiaohongshuDescription", "xiaohongshuNoteType",
    "xiaohongshuTags", "xiaohongshuCoverIcon", "xiaohongshuTone", "pokeSender", "pokeTarget",
    "contactCardName", "senderName",
] as const;

export function captureNativeMessage(message: ChatMessage): NonNullable<ForwardedEntry["nativeMessage"]> {
    const data: Record<string, unknown> = {};
    const source = message.mediaData as Record<string, unknown> | undefined;
    for (const key of visibleKeys) {
        const value = source?.[key];
        if (value !== undefined) data[key] = structuredClone(value);
    }
    if (message.mediaData?.listeningInvite) {
        // 一起听邀请只留展示信息；房间号换成占位，快照里点了也加入不了真实房间
        data.listeningInvite = { ...message.mediaData.listeningInvite, roomId: "snapshot" };
    }
    return { content: message.content, mediaType: message.mediaType, mediaData: data };
}

export function nativeMessageFromForward(entry: ForwardedEntry, index: number): ChatMessage {
    const raw = entry.nativeMessage;
    const label = entry.voice?.transcript || entry.text.replace(/^\[(?:表情包|表情|语音条)[:：]([\s\S]*?)\](?:\n[\s\S]*)?$/, "$1");
    const status = entry.paymentState === "已退回" ? "declined"
        : entry.paymentState === "已领取" ? (entry.kind === "red_packet" ? "opened" : "received")
        : "pending";
    const mediaData = {
        label,
        amount: entry.amount,
        currency: entry.currency,
        status,
        claimedBy: entry.claims,
        voiceDuration: entry.voice?.duration,
        ...raw?.mediaData,
        ...(entry.kind === "sticker" && entry.mediaUrl ? { stickerUrl: entry.mediaUrl } : {}),
        ...(entry.nested ? { forwardedChat: entry.nested } : {}),
        ...(entry.music ? { musicTitle: entry.music.title, musicArtist: entry.music.artist, musicCoverUrl: entry.music.coverUrl } : {}),
    } as ChatMessage["mediaData"];
    const mediaType = (raw?.mediaType || (entry.kind === "music" ? "music_share" : entry.kind)) as ChatMessage["mediaType"];
    return {
        id: "forwarded-readonly-" + index,
        sessionId: "forwarded-readonly",
        role: entry.isUser ? "user" : "assistant",
        senderName: entry.speaker,
        senderCharacterId: entry.isUser ? undefined : entry.speakerId,
        createdAt: entry.createdAt,
        status: "read",
        content: raw?.content ?? (entry.kind ? "" : entry.displayText ?? entry.text),
        mediaType,
        mediaUrl: entry.mediaUrl,
        mediaData,
    };
}

const TIME_GAP = 60 * 1000;
/** 与聊天室（chat-room.tsx TIME_GAP）一致：相隔 1 分钟以上显示时间条。 */
export function forwardedShowTimestamp(current: string, previous: string | null | undefined): boolean {
    if (!previous) return true;
    return new Date(current).getTime() - new Date(previous).getTime() > TIME_GAP;
}

/** 与原 iMessage 聊天室同样的连续发言 / 时间边界。 */
export function forwardedEntryLayout(record: ForwardedChat, index: number) {
    const entry = record.entries[index];
    const sameRun = (left: ForwardedEntry | undefined, right: ForwardedEntry | undefined) => !!left && !!right
        && left.isUser === right.isUser
        && (left.speakerId || left.speaker) === (right.speakerId || right.speaker)
        && !forwardedShowTimestamp(right.createdAt, left.createdAt);
    const consecutive = sameRun(record.entries[index - 1], entry);
    const groupSpeaker = (record.sourceKind === "group" || record.origin === "character_composed") && !entry.isUser;
    return {
        consecutive,
        groupSpeaker,
        showName: groupSpeaker && !consecutive,
        showAvatar: !sameRun(entry, record.entries[index + 1]),
    };
}
