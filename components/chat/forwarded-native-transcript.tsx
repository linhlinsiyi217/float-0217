"use client";
// 转发详情：把快照还原成只读消息，用聊天室同一套 iMessage 结构与原气泡组件重绘。
import type { CSSProperties } from "react";
import type { ForwardedChat } from "@/lib/chat-forward-types";
import { forwardedEntryLayout, forwardedShowTimestamp, nativeMessageFromForward } from "@/lib/chat-forward-native";
import { forwardedStyle } from "@/lib/chat-forward-appearance";
import { formatChatUiTime } from "@/lib/chat-time";
import { resolveBubbleColors } from "@/lib/chat-bubble-colors";
import { voiceDisplayText } from "@/lib/voice-expression";
import { loadCharacters } from "@/lib/character-storage";
import { SnapshotMessageBubble, BilingualTextBlock } from "./message-bubble";
import { GroupSenderName } from "./group-sender-name";

export function ForwardedNativeTranscript({ record, dark, onImage }: { record: ForwardedChat; dark: boolean; onImage: (url: string) => void }) {
    // 转发时的明暗与当前一致才沿用采样到的外观；不一致时退回当前主题默认配色，避免白底白字
    const preserveAppearance = record.theme?.dark === undefined || record.theme.dark === dark;
    const preset = record.theme?.preset
        || (record.entries.some(entry => entry.appearance?.surface?.backdropFilter && entry.appearance.surface.backdropFilter !== "none") ? "glass" : "classic");
    const knownCharacters = new Set(loadCharacters().map(c => c.id));
    const tails = new Set<number>();
    let lastText = -1;
    record.entries.forEach((entry, index) => {
        if (!forwardedEntryLayout(record, index).consecutive) {
            if (lastText >= 0) tails.add(lastText);
            lastText = -1;
        }
        if (!entry.kind || entry.kind === "quote" || entry.kind === "audio") lastText = index;
    });
    if (lastText >= 0) tails.add(lastText);
    const isGroupLike = record.sourceKind === "group" || record.origin === "character_composed";

    return (
        <div className="chat-room-wrapper chat-forward-transcript" tabIndex={0} aria-label="聊天记录内容"
            data-imessage-private=""
            data-imessage-group={isGroupLike || undefined}
            data-glass-bubbles={preset === "glass" || undefined}
            data-beauty-preset={preset}
            data-chat-dark={dark || undefined}
            style={{
                "--im26-page": preserveAppearance ? record.theme?.background : undefined,
                "--im26-ink": preserveAppearance ? record.theme?.ink : undefined,
            } as CSSProperties}>
            <div className="page-body">
                {record.entries.map((entry, index) => {
                    const layout = forwardedEntryLayout(record, index);
                    const msg = nativeMessageFromForward(entry, index);
                    const kind = msg.mediaType;
                    const colors = resolveBubbleColors({}, dark, entry.isUser);
                    const tint = {
                        [entry.isUser ? "--im26-base-blue" : "--im26-base-incoming"]: colors.background,
                        "--bubble-text-ink": colors.text,
                        "--voice-ink": colors.voice,
                        "--bubble-surface-color": colors.surface,
                        "--bubble-surface-opacity": colors.opacity,
                    } as CSSProperties;
                    const media = !!kind && kind !== "audio" && kind !== "quote";
                    // 表情包按原发送者解析；角色已删除时只用快照里的图片
                    const stickerId = entry.isUser ? undefined : entry.speakerId;
                    const stickerCharacterId = stickerId && knownCharacters.has(stickerId) ? stickerId : undefined;
                    const transcript = kind === "audio" && entry.appearance?.voiceTextVisible ? voiceDisplayText(entry.voice?.transcript || "") : "";
                    return (
                        <div key={index} className="chat-forward-row-wrap">
                            {forwardedShowTimestamp(entry.createdAt, record.entries[index - 1]?.createdAt) && (
                                <div className="flex justify-center w-full">
                                    <time className="chat-sys-msg" dateTime={entry.createdAt}>{formatChatUiTime(entry.createdAt)}</time>
                                </div>
                            )}
                            <div className="chat-msg-wrapper" style={tint}
                                data-role={entry.isUser ? "user" : "assistant"}
                                data-consecutive={layout.consecutive || undefined}
                                data-imessage-tail={tails.has(index) || undefined}
                                data-group-last={(isGroupLike && layout.showAvatar) || undefined}>
                                {isGroupLike && !entry.isUser && layout.showAvatar && (
                                    <div className="chat-msg-avatar">
                                        <div className="chat-forward-transcript-avatar">{entry.avatar ? <img src={entry.avatar} alt="" /> : entry.speaker.slice(0, 1)}</div>
                                    </div>
                                )}
                                <div className="chat-msg-content-wrap" data-voice-content={kind === "audio" || undefined}>
                                    {isGroupLike && layout.showName && <GroupSenderName avatar={entry.avatar}>{entry.speaker}</GroupSenderName>}
                                    <div data-media-type={kind || "text"}
                                        className={`chat-bubble-role-${entry.isUser ? "user" : "assistant"}${media ? " chat-bubble-media" : ""}`}
                                        style={media || !preserveAppearance ? undefined : forwardedStyle(entry.appearance?.bubble)}>
                                        {(!kind || kind === "audio") && (
                                            <span className="imessage-bubble-surface" aria-hidden="true" style={preserveAppearance ? forwardedStyle(entry.appearance?.surface) : undefined} />
                                        )}
                                        <SnapshotMessageBubble msg={msg} charName={entry.speaker} userName={record.sourceNames?.user} stickerCharacterId={stickerCharacterId} onImage={onImage} />
                                    </div>
                                    {transcript && <div className="voice-msg-text-bubble"><BilingualTextBlock text={transcript} mode="markdown" /></div>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
