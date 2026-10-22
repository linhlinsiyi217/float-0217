// components/music/music-dynamic-island.tsx — 基于现有 status-island 黑条的音乐实时活动
"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play, SkipBack, SkipForward, Headphones, MessageCircle } from "lucide-react";
import { useMusicPlayerOptional } from "@/lib/music-context";
import { getListeningRoom, exitListeningRoom, subscribeListeningRoom } from "@/lib/listen-together";
import { dismissIslandNotification, getIslandNotification, subscribeIslandNotification } from "@/lib/island-notify";
import { loadCharacters } from "@/lib/character-storage";
import { resolveChatCharacterAvatar } from "@/lib/chat-storage";
import { FLOAT_PRESENCE_EVENT, type FloatPresenceDetail } from "@/lib/float-presence";

const WAVE_BARS = 12;
const LONG_PRESS_MS = 480;
const COLLAPSE_MS = 220; // 与 .mdi-expanded 的退场动画时长保持一致
const NOTIFY_SWIPE_CLOSE = 34; // 上滑超过这个距离算“关掉通知”

export default function MusicDynamicIsland() {
    const player = useMusicPlayerOptional();
    const room = useSyncExternalStore(subscribeListeningRoom, getListeningRoom, () => null);
    const [expanded, setExpanded] = useState(false);
    const [closing, setClosing] = useState(false);
    const [presence, setPresence] = useState<FloatPresenceDetail>(() => ({
        state: "idle",
        label: "刚刚活跃",
        updatedAt: Date.now(),
    }));
    const rootRef = useRef<HTMLDivElement>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressedRef = useRef(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const notifyRef = useRef<HTMLButtonElement>(null);
    const notifyDragRef = useRef({ startY: 0, dy: 0, active: false, swiped: false });

    const islandOpen = expanded || closing;

    // 展开后：点灵动岛以外的区域收起（不做全屏遮罩，只监听点击）。
    useEffect(() => {
        if (!expanded) return;
        const onDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                beginCollapse();
            }
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [expanded]);

    // 卸载时清掉收起计时器，避免对已卸载组件 setState
    useEffect(() => {
        return () => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
        };
    }, []);

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
            // 刚上滑关掉的那一下 click 不算点击进会话
            if (notifyDragRef.current.swiped) {
                notifyDragRef.current.swiped = false;
                return;
            }
            dismissIslandNotification(notification.id);
            window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "chat", sessionId: notification.sessionId } }));
        }
        : null;

    // 通知态上滑关闭：跟随手指上移，松手过阈值就关，否则弹回
    const onNotifyPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!notification) return;
        const el = notifyRef.current;
        if (!el) return;
        notifyDragRef.current = { startY: event.clientY, dy: 0, active: true, swiped: false };
        el.style.transition = "none";
    };
    const onNotifyPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = notifyDragRef.current;
        const el = notifyRef.current;
        if (!drag.active || !el) return;
        drag.dy = Math.min(0, event.clientY - drag.startY);
        el.style.transform = `translateY(${drag.dy}px)`;
    };
    const endNotifyDrag = () => {
        const drag = notifyDragRef.current;
        const el = notifyRef.current;
        if (!drag.active || !el) return;
        drag.active = false;
        if (drag.dy < -NOTIFY_SWIPE_CLOSE) {
            drag.swiped = true;
            el.style.transition = "transform 240ms cubic-bezier(.34,1.3,.4,1), opacity 240ms ease";
            el.style.transform = "translateY(-52px)";
            el.style.opacity = "0";
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try { navigator.vibrate(8); } catch { /* 部分设备不支持 */ }
            }
            if (notification) dismissIslandNotification(notification.id);
        } else {
            el.style.transition = "transform 280ms cubic-bezier(.34,1.56,.4,1)";
            el.style.transform = "translateY(0)";
        }
    };

    // 一起听状态下，用对方头像兜底；有共同歌曲封面时优先用封面。
    const partnerInfo = useMemo(() => {
        if (!listeningTogether || !room) return { name: "", avatar: "" };
        const character = loadCharacters().find((item) => item.id === room.characterId);
        return { name: character?.name || "对方", avatar: resolveChatCharacterAvatar(character) };
    }, [listeningTogether, room]);

    const listenMinutes = listeningTogether && room ? Math.floor((Date.now() - room.startedAt) / 60000) : 0;

    // 通知优先：岛短暂展开为「头像 + 角色名 + 一行消息」（上滑可关），结束后回到音乐 / 一起听。
    // 空闲时不把“在线/刚刚活跃”塞进灵动岛；系统胶囊本身保持安静。
    if (notification && handleNotifyClick) {
        return (
            <div className="music-dynamic-island" data-state="notify">
                <button
                    ref={notifyRef}
                    type="button"
                    className="mdi-notify"
                    onClick={handleNotifyClick}
                    onPointerDown={onNotifyPointerDown}
                    onPointerMove={onNotifyPointerMove}
                    onPointerUp={endNotifyDrag}
                    onPointerLeave={endNotifyDrag}
                    onPointerCancel={endNotifyDrag}
                >
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

    const presenceAge = Date.now() - presence.updatedAt;
    const hasTransientPresence = presence.state !== "idle" && presenceAge < 12_000;
    if (!listeningTogether && !track && !hasTransientPresence) return null;

    const coverUrl = listeningTogether ? (room?.song?.coverUrl || partnerInfo.avatar) : track?.coverUrl;
    const title = listeningTogether ? (room?.song?.title || "一起听") : track?.title || (presence.state === "thinking" ? "正在思考" : "正在处理");
    const subtitle = listeningTogether
        ? (listenMinutes >= 1 ? `和 ${partnerInfo.name} 一起听 · ${listenMinutes} 分钟` : `和 ${partnerInfo.name} 一起听`)
        : track?.artist || "";
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

    // 收起：先淡出内容（closing 期），形状由 .status-island 的弹簧过渡收回
    const beginCollapse = () => {
        if (closeTimer.current) return;
        setClosing(true);
        closeTimer.current = setTimeout(() => {
            closeTimer.current = null;
            setClosing(false);
            setExpanded(false);
        }, COLLAPSE_MS);
    };

    const handleToggle = () => {
        clearLongPress();
        // 长按已经打开详情后，松开触发的 click 不再把它关掉。
        if (longPressedRef.current) {
            longPressedRef.current = false;
            return;
        }
        if (closing) {
            // 收起途中再点一下：直接重新展开
            if (closeTimer.current) {
                clearTimeout(closeTimer.current);
                closeTimer.current = null;
            }
            setClosing(false);
            setExpanded(true);
            return;
        }
        if (expanded) {
            beginCollapse();
            return;
        }
        setExpanded(true);
    };

    const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
        if (player) player.seek(ratio * duration);
    };

    const handleLeave = () => {
        if (!room) return;
        exitListeningRoom(room.sessionId);
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
        setClosing(false);
        setExpanded(false);
    };

    return (
        <div
            ref={rootRef}
            className={`music-dynamic-island${islandOpen ? " is-open" : ""}`}
            data-state={listeningTogether ? "listeningTogether" : track ? "music" : "presence"}
            data-expanded={islandOpen ? "true" : undefined}
            data-closing={closing ? "true" : undefined}
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

            {/* 一起听：岛旁边分出的一颗小圆（对方头像），展开时“合并”回岛里 */}
            {listeningTogether && partnerInfo.avatar ? (
                <span className="mdi-bub" data-merged={islandOpen ? "true" : undefined} aria-hidden>
                    <img src={partnerInfo.avatar} alt="" draggable={false} />
                </span>
            ) : null}

            {islandOpen && (
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
                                <button type="button" onClick={() => player?.prev()} aria-label="上一首"><SkipBack size={16} strokeWidth={1.8} /></button>
                                <button type="button" className="mdi-play" onClick={() => player?.togglePlay()} aria-label={isPlaying ? "暂停" : "播放"}>
                                    {isPlaying ? <Pause size={18} strokeWidth={1.8} /> : <Play size={18} strokeWidth={1.8} />}
                                </button>
                                <button type="button" onClick={() => player?.next()} aria-label="下一首"><SkipForward size={16} strokeWidth={1.8} /></button>
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
