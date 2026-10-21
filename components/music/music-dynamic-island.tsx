// components/music/music-dynamic-island.tsx — 基于现有 status-island 黑条的音乐实时活动
"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Pause, Play, SkipBack, SkipForward, Headphones, MessageCircle } from "lucide-react";
import { useMusicPlayerOptional } from "@/lib/music-context";
import { getListeningRoom, exitListeningRoom, subscribeListeningRoom } from "@/lib/listen-together";
import { dismissIslandNotification, getIslandNotification, subscribeIslandNotification } from "@/lib/island-notify";
import { loadCharacters } from "@/lib/character-storage";
import { resolveChatCharacterAvatar } from "@/lib/chat-storage";
import { FLOAT_PRESENCE_EVENT, type FloatPresenceDetail } from "@/lib/float-presence";

const WAVE_BARS = 12;
const LONG_PRESS_MS = 480;

export default function MusicDynamicIsland() {
    const player = useMusicPlayerOptional();
    const room = useSyncExternalStore(subscribeListeningRoom, getListeningRoom, () => null);
    const [expanded, setExpanded] = useState(false);
    const [presence, setPresence] = useState<FloatPresenceDetail>(() => ({
        state: "idle",
        label: "刚刚活跃",
        updatedAt: Date.now(),
    }));
    const rootRef = useRef<HTMLDivElement>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressedRef = useRef(false);

    // 展开后：点灵动岛以外的区域收起（不做全屏遮罩，只监听点击）。
    useEffect(() => {
        if (!expanded) return;
        const onDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setExpanded(false);
            }
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [expanded]);

    useEffect(() => {
        const onPresence = (event: Event) => {
            const detail = (event as CustomEvent<FloatPresenceDetail>).detail;
            if (detail) setPresence(detail);
        };
        window.addEventListener(FLOAT_PRESENCE_EVENT, onPresence);
        return () => window.removeEventListener(FLOAT_PRESENCE_EVENT, onPresence);
    }, []);

    const listeningTogether = room?.status === "joined";
    const track = player?.currentTrack ?? null;

    // 通知状态：优先于音乐 / 一起听；点击进入对应会话，超时由 store 自动收回
    const notification = useSyncExternalStore(subscribeIslandNotification, getIslandNotification, () => null);

    const handleNotifyClick = notification
        ? () => {
            dismissIslandNotification(notification.id);
            window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "chat", sessionId: notification.sessionId } }));
        }
        : null;

    // 一起听状态下，用对方头像兜底；有共同歌曲封面时优先用封面。
    const partnerAvatar = useMemo(() => {
        if (!listeningTogether || !room) return "";
        const character = loadCharacters().find((item) => item.id === room.characterId);
        return resolveChatCharacterAvatar(character);
    }, [listeningTogether, room]);

    // 通知优先：岛短暂展开为「头像 + 标题 + 一句话」，结束后回到音乐 / 一起听
    if (notification && handleNotifyClick) {
        return (
            <div className="music-dynamic-island" data-state="notify">
                <button type="button" className="mdi-notify" onClick={handleNotifyClick}>
                    {notification.avatar ? (
                        <img src={notification.avatar} alt="" draggable={false} />
                    ) : (
                        <span className="mdi-notify-fallback"><MessageCircle size={12} strokeWidth={1.8} /></span>
                    )}
                    <span className="mdi-text">
                        <b>{notification.title}</b>
                        <small>{notification.text}</small>
                    </span>
                </button>
            </div>
        );
    }

    const hasPresence = presence.state !== "idle" || Date.now() - presence.updatedAt < 15_000;
    if (!listeningTogether && !track && !hasPresence) return null;

    const coverUrl = listeningTogether ? (room?.song?.coverUrl || partnerAvatar) : track?.coverUrl;
    const title = listeningTogether ? (room?.song?.title || "一起听") : track?.title || (presence.state === "thinking" ? "正在思考" : "Float 在线");
    const subtitle = listeningTogether ? "一起听" : track?.artist || presence.label;
    const isPlaying = player?.isPlaying ?? false;
    const duration = player?.duration ?? 0;
    const currentTime = player?.currentTime ?? 0;
    const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

    const clearLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const startLongPress = () => {
        clearLongPress();
        longPressedRef.current = false;
        if (listeningTogether) {
            longPressTimer.current = setTimeout(() => {
                longPressedRef.current = true;
                setExpanded(true);
            }, LONG_PRESS_MS);
        }
    };

    const handleToggle = () => {
        clearLongPress();
        // 长按已经打开详情后，松开触发的 click 不再把它关掉。
        if (longPressedRef.current) {
            longPressedRef.current = false;
            return;
        }
        setExpanded((value) => !value);
    };

    const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
        if (player) player.seek(ratio * duration);
    };

    const handleLeave = () => {
        if (!room) return;
        exitListeningRoom(room.sessionId);
        setExpanded(false);
    };

    return (
        <div
            ref={rootRef}
            className="music-dynamic-island"
            data-state={listeningTogether ? "listeningTogether" : track ? "music" : "presence"}
            data-expanded={expanded ? "true" : undefined}
        >
            <div className="mdi-row" role="group" aria-label="Float 全局实时活动">
                <button
                    type="button"
                    className="mdi-cover"
                    aria-label={listeningTogether ? "一起听" : "音乐控制"}
                    onPointerDown={startLongPress}
                    onPointerUp={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onPointerCancel={clearLongPress}
                    onClick={handleToggle}
                >
                    {coverUrl ? (
                        <img src={coverUrl} alt="" draggable={false} />
                    ) : (
                        <span className="mdi-cover-fallback" data-presence={presence.state}><Headphones size={16} strokeWidth={1.8} /></span>
                    )}
                </button>

                <button
                    type="button"
                    className="mdi-capsule"
                    aria-expanded={expanded}
                    aria-label={`${title}${subtitle ? " · " + subtitle : ""}`}
                    onPointerDown={startLongPress}
                    onPointerUp={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onPointerCancel={clearLongPress}
                    onClick={handleToggle}
                >
                    <span className="mdi-waveform" data-playing={isPlaying ? "true" : undefined} aria-hidden>
                        {Array.from({ length: WAVE_BARS }).map((_, index) => (
                            <i key={index} style={{ "--mdi-delay": `${index * 0.07}s` } as CSSProperties} />
                        ))}
                    </span>
                    <span className="mdi-text">
                        <b>{title}</b>
                        {subtitle ? <small>{subtitle}</small> : null}
                    </span>
                </button>
            </div>

            {expanded && (
                <div className="mdi-expanded" role="dialog" aria-label="Float 全局实时活动">
                    <div className="mdi-expanded-head">
                        <strong>{title}</strong>
                        {subtitle ? <span>{subtitle}</span> : null}
                    </div>
                    {track || listeningTogether ? (
                        <>
                            <div
                                className="mdi-progress"
                                role="slider"
                                aria-label="播放进度"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(progress * 100)}
                                onClick={handleSeek}
                            >
                                <span style={{ width: `${progress * 100}%` }} />
                            </div>
                            <div className="mdi-controls">
                                <button type="button" onClick={() => player?.prev()} aria-label="上一首"><SkipBack size={18} strokeWidth={2} /></button>
                                <button type="button" className="mdi-play" onClick={() => player?.togglePlay()} aria-label={isPlaying ? "暂停" : "播放"}>
                                    {isPlaying ? <Pause size={20} strokeWidth={2.2} /> : <Play size={20} strokeWidth={2.2} />}
                                </button>
                                <button type="button" onClick={() => player?.next()} aria-label="下一首"><SkipForward size={18} strokeWidth={2} /></button>
                            </div>
                        </>
                    ) : (
                        <p className="mdi-presence-copy">
                            {presence.characterName ? `${presence.characterName} · ` : ""}{presence.label}
                        </p>
                    )}
                    {listeningTogether && (
                        <button type="button" className="mdi-leave" onClick={handleLeave}>
                            退出一起听
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
