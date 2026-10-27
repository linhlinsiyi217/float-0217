// components/island/dynamic-island.tsx — FLOT 全局灵动岛
//
// 挂在 desktop-shell 状态栏的 .status-island 黑胶囊里，只有这一份。
// 显示内容全部来自全局状态：
//   通话 → call-session-store；一起听 → listen-together；音乐 → music-context；
//   后台任务 / AI 回复 / Claude 工具 / 通知事件 → lib/island-center。
// 优先级：来电 > 临时事件 > 通话 > 持续活动 > 一起听 > 音乐 > 空闲黑胶囊。
// 事件显示完自动回到之前的状态；展开面板只给持续状态（通话 / 活动 / 音乐 / 一起听）。
"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
} from "react";
import {
    AlertCircle,
    Bell,
    Headphones,
    LoaderCircle,
    MessageCircle,
    Music2,
    Pause,
    Phone,
    PhoneOff,
    Play,
    RefreshCw,
    SkipBack,
    SkipForward,
    Sparkles,
    Wrench,
} from "lucide-react";
import { useMusicPlayerOptional } from "@/lib/music-context";
import { exitListeningRoom, getListeningRoom, subscribeListeningRoom } from "@/lib/listen-together";
import { endCall, getActiveCall, getActiveCallServerSnapshot, restoreCall, subscribeActiveCall } from "@/lib/call-session-store";
import {
    clearIslandActivity,
    dismissIslandEvent,
    getIslandCenterServerSnapshot,
    getIslandCenterSnapshot,
    openIslandTarget,
    subscribeIslandCenter,
    type IslandActivity,
    type IslandEvent,
} from "@/lib/island-center";
import { loadCharacters } from "@/lib/character-storage";
import { findChatSessionById, resolveChatCharacterAvatar } from "@/lib/chat-storage";

const WAVE_BARS = 5;
const PANEL_EXIT_MS = 200;
const SWIPE_CLOSE_PX = 30;

type View =
    | { kind: "incoming" }
    | { kind: "event"; event: IslandEvent; queued: number }
    | { kind: "call" }
    | { kind: "activity"; activity: IslandActivity; more: number }
    | { kind: "listen" }
    | { kind: "music" }
    | { kind: "idle" };

function formatClock(totalSeconds: number) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(h ? 2 : 1, "0");
    const ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 每秒刷新一次（只在需要显示计时时开） */
function useTicker(active: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [active]);
    return now;
}

function eventIcon(event: IslandEvent) {
    if (event.tone === "error") return <AlertCircle size={13} strokeWidth={1.8} />;
    if (event.kind === "message") return <MessageCircle size={13} strokeWidth={1.8} />;
    if (event.kind === "update") return <RefreshCw size={13} strokeWidth={1.8} />;
    if (event.kind === "tool") return <Wrench size={13} strokeWidth={1.8} />;
    return <Bell size={13} strokeWidth={1.8} />;
}

function activityIcon(activity: IslandActivity) {
    if (activity.status === "error") return <AlertCircle size={13} strokeWidth={1.8} />;
    if (activity.kind === "tool") return <Wrench size={13} strokeWidth={1.8} />;
    if (activity.kind === "ai") return <Sparkles size={13} strokeWidth={1.8} />;
    return <LoaderCircle size={13} strokeWidth={1.8} className="fdi-spin" />;
}

export default function DynamicIsland() {
    const player = useMusicPlayerOptional();
    const room = useSyncExternalStore(subscribeListeningRoom, getListeningRoom, () => null);
    const call = useSyncExternalStore(subscribeActiveCall, getActiveCall, getActiveCallServerSnapshot);
    const center = useSyncExternalStore(subscribeIslandCenter, getIslandCenterSnapshot, getIslandCenterServerSnapshot);

    const [expanded, setExpanded] = useState(false);
    const [panelLeaving, setPanelLeaving] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const eventRef = useRef<HTMLButtonElement>(null);
    const dragRef = useRef({ startY: 0, dy: 0, active: false, swiped: false });

    const track = player?.currentTrack ?? null;
    const listening = room?.status === "joined";

    const view: View = useMemo(() => {
        if (center.incomingCall) return { kind: "incoming" };
        if (center.event) return { kind: "event", event: center.event, queued: center.queued };
        if (call) return { kind: "call" };
        if (center.activities[0]) return { kind: "activity", activity: center.activities[0], more: center.activities.length - 1 };
        if (listening) return { kind: "listen" };
        if (track) return { kind: "music" };
        return { kind: "idle" };
    }, [center, call, listening, track]);

    const canExpand = view.kind === "call" || view.kind === "activity" || view.kind === "listen" || view.kind === "music";
    const panelOpen = (expanded || panelLeaving) && canExpand;

    const collapse = useCallback(() => {
        if (!expanded || leaveTimer.current) return;
        setPanelLeaving(true);
        setExpanded(false);
        leaveTimer.current = setTimeout(() => {
            leaveTimer.current = null;
            setPanelLeaving(false);
        }, PANEL_EXIT_MS);
    }, [expanded]);

    // 状态切走（音乐停了、通话挂了、来了临时事件）时收起展开面板
    useEffect(() => {
        if (!canExpand && expanded) {
            setExpanded(false);
            setPanelLeaving(false);
        }
    }, [canExpand, expanded]);

    useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

    // 展开后：点岛外收起；返回键 / Esc 先收起岛（捕获阶段，优先于页面自己的返回）
    useEffect(() => {
        if (!expanded) return;
        const onDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) collapse();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            collapse();
        };
        document.addEventListener("pointerdown", onDown);
        window.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("pointerdown", onDown);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [expanded, collapse]);

    // 一起听对方头像 / 通话对象
    const listenPartner = useMemo(() => {
        if (!listening || !room) return null;
        const character = loadCharacters().find(item => item.id === room.characterId) ?? null;
        return { name: character?.name || "对方", avatar: resolveChatCharacterAvatar(character) };
    }, [listening, room]);

    const callPeer = useMemo(() => {
        if (!call) return null;
        const session = findChatSessionById(call.sessionId);
        if (session?.isGroup) return { name: session.groupName || "群通话", avatar: "" };
        const character = loadCharacters().find(item => item.id === call.characterId) ?? null;
        return {
            name: session?.alias || character?.name || "通话",
            avatar: session?.characterAvatarOverride || resolveChatCharacterAvatar(character),
        };
    }, [call]);

    const now = useTicker(view.kind === "call" || (panelOpen && view.kind === "listen"));

    const toggle = () => {
        if (expanded) collapse();
        else {
            if (leaveTimer.current) {
                clearTimeout(leaveTimer.current);
                leaveTimer.current = null;
            }
            setPanelLeaving(false);
            setExpanded(true);
        }
    };

    // ── 事件：点按进入、上滑关闭 ──
    const onEventDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
        dragRef.current = { startY: e.clientY, dy: 0, active: true, swiped: false };
        if (eventRef.current) eventRef.current.style.transition = "none";
    };
    const onEventMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag.active || !eventRef.current) return;
        drag.dy = Math.min(0, e.clientY - drag.startY);
        eventRef.current.style.transform = `translateY(${drag.dy}px)`;
    };
    const onEventUp = () => {
        const drag = dragRef.current;
        const el = eventRef.current;
        if (!drag.active || !el) return;
        drag.active = false;
        el.style.transition = "";
        el.style.transform = "";
        if (drag.dy < -SWIPE_CLOSE_PX && view.kind === "event") {
            drag.swiped = true;
            dismissIslandEvent(view.event.id);
        }
    };
    const onEventClick = () => {
        if (view.kind !== "event") return;
        if (dragRef.current.swiped) {
            dragRef.current.swiped = false;
            return;
        }
        dismissIslandEvent(view.event.id);
        openIslandTarget(view.event.target);
    };

    const openMusic = () => {
        collapse();
        openIslandTarget({ appId: "music" });
    };

    // ── 紧凑态内容 ──
    let compact: React.ReactNode = null;
    let label = "灵动岛";
    if (view.kind === "incoming" && center.incomingCall) {
        const incoming = center.incomingCall;
        const kindLabel = `${incoming.isGroup ? "群" : ""}${incoming.kind === "video" ? "视频通话" : "语音通话"}`;
        label = `${incoming.name} ${kindLabel}来电`;
        compact = (
            <div className="fdi-compact fdi-incoming" role="group" aria-label={label}>
                <span className="fdi-incoming-ring" aria-hidden><Phone size={12} strokeWidth={2} /></span>
                <span className="fdi-title">{incoming.name}</span>
                <span className="fdi-incoming-kind">{kindLabel}</span>
            </div>
        );
    } else if (view.kind === "event") {
        const { event } = view;
        label = `${event.source}：${event.text}`;
        compact = (
            <button
                ref={eventRef}
                type="button"
                className="fdi-compact fdi-event"
                data-tone={event.tone === "error" ? "error" : undefined}
                onClick={onEventClick}
                onPointerDown={onEventDown}
                onPointerMove={onEventMove}
                onPointerUp={onEventUp}
                onPointerCancel={onEventUp}
                onPointerLeave={onEventUp}
                aria-label={label}
            >
                {event.avatar ? (
                    <img className="fdi-avatar" src={event.avatar} alt="" draggable={false} />
                ) : (
                    <span className="fdi-glyph">{eventIcon(event)}</span>
                )}
                <span className="fdi-lines">
                    <b>{event.source}</b>
                    <small>{event.text}</small>
                </span>
                {event.count > 1 ? <span className="fdi-count">{event.count > 99 ? "99+" : event.count}</span> : null}
                {view.queued > 0 && event.count <= 1 ? <span className="fdi-queue" aria-label={`还有 ${view.queued} 条`}>+{view.queued}</span> : null}
            </button>
        );
    } else if (view.kind === "call" && call) {
        const secs = (now - call.startedAt) / 1000;
        label = `${callPeer?.name ?? "通话"} 通话中 ${formatClock(secs)}`;
        compact = (
            <button type="button" className="fdi-compact fdi-call" onClick={toggle} aria-expanded={expanded} aria-label={label}>
                <span className="fdi-glyph fdi-glyph-call"><Phone size={13} strokeWidth={2} /></span>
                <span className="fdi-title">{callPeer?.name ?? "通话中"}</span>
                <span className="fdi-timer">{formatClock(secs)}</span>
            </button>
        );
    } else if (view.kind === "activity") {
        const { activity } = view;
        label = activity.title;
        compact = (
            <button
                type="button"
                className="fdi-compact fdi-activity"
                data-status={activity.status}
                onClick={toggle}
                aria-expanded={expanded}
                aria-label={label}
            >
                <span className="fdi-glyph">{activityIcon(activity)}</span>
                <span className="fdi-title">{activity.title}</span>
                {activity.status === "running" ? <span className="fdi-dots" aria-hidden><i /><i /><i /></span> : null}
                {view.more > 0 ? <span className="fdi-queue">+{view.more}</span> : null}
            </button>
        );
    } else if (view.kind === "music" || view.kind === "listen") {
        const isPlaying = player?.isPlaying ?? false;
        const cover = view.kind === "listen" ? (room?.song?.coverUrl || track?.coverUrl || listenPartner?.avatar) : track?.coverUrl;
        const title = view.kind === "listen" ? (room?.song?.title || track?.title || "一起听") : track?.title || "音乐";
        label = `${title}${isPlaying ? " 正在播放" : " 已暂停"}`;
        compact = (
            <button type="button" className="fdi-compact fdi-music" onClick={toggle} aria-expanded={expanded} aria-label={label}>
                <span className="fdi-cover">
                    {cover ? <img src={cover} alt="" draggable={false} /> : <Music2 size={12} strokeWidth={1.8} />}
                </span>
                <span className="fdi-title">{title}</span>
                <span className="fdi-wave" data-playing={isPlaying ? "true" : undefined} aria-hidden>
                    {Array.from({ length: WAVE_BARS }).map((_, i) => (
                        <i key={i} style={{ "--fdi-d": `${i * 0.11}s` } as CSSProperties} />
                    ))}
                </span>
            </button>
        );
    }

    // ── 展开面板 ──
    let panel: React.ReactNode = null;
    if (panelOpen) {
        if (view.kind === "call" && call) {
            panel = (
                <>
                    <div className="fdi-panel-head">
                        {callPeer?.avatar ? <img className="fdi-panel-avatar" src={callPeer.avatar} alt="" /> : <span className="fdi-panel-avatar fdi-glyph-call"><Phone size={18} /></span>}
                        <div className="fdi-panel-text">
                            <strong>{callPeer?.name}</strong>
                            <span>{call.kind === "video" ? "视频通话" : "语音通话"} · {formatClock((now - call.startedAt) / 1000)}</span>
                        </div>
                    </div>
                    <div className="fdi-panel-actions">
                        <button type="button" className="fdi-btn" onClick={() => { collapse(); restoreCall(); }}>回到通话</button>
                        <button type="button" className="fdi-btn fdi-btn-danger" onClick={() => { collapse(); endCall(); }}>
                            <PhoneOff size={14} strokeWidth={1.9} />挂断
                        </button>
                    </div>
                </>
            );
        } else if (view.kind === "activity") {
            const { activity } = view;
            panel = (
                <>
                    <div className="fdi-panel-head">
                        <span className="fdi-panel-avatar fdi-panel-icon" data-status={activity.status}>{activityIcon(activity)}</span>
                        <div className="fdi-panel-text">
                            <strong>{activity.title}</strong>
                            <span>{activity.status === "error" ? "出错了" : "进行中"}{view.more > 0 ? ` · 另有 ${view.more} 项` : ""}</span>
                        </div>
                    </div>
                    {activity.detail ? <p className="fdi-panel-copy">{activity.detail}</p> : null}
                    <div className="fdi-panel-actions">
                        {activity.target ? (
                            <button type="button" className="fdi-btn" onClick={() => { collapse(); openIslandTarget(activity.target); }}>打开</button>
                        ) : null}
                        {activity.actions?.map(action => (
                            <button
                                key={action.label}
                                type="button"
                                className={action.tone === "danger" ? "fdi-btn fdi-btn-danger" : "fdi-btn"}
                                onClick={() => { collapse(); action.run(); }}
                            >
                                {action.label}
                            </button>
                        ))}
                        {activity.status === "error" ? (
                            <button type="button" className="fdi-btn" onClick={() => { collapse(); clearIslandActivity(activity.key); }}>关闭</button>
                        ) : (
                            <button type="button" className="fdi-btn fdi-btn-quiet" onClick={collapse}>收起</button>
                        )}
                    </div>
                </>
            );
        } else if (view.kind === "music" || view.kind === "listen") {
            const isPlaying = player?.isPlaying ?? false;
            const duration = player?.duration ?? 0;
            const current = player?.currentTime ?? 0;
            const progress = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;
            const cover = view.kind === "listen" ? (room?.song?.coverUrl || track?.coverUrl || listenPartner?.avatar) : track?.coverUrl;
            const title = view.kind === "listen" ? (room?.song?.title || track?.title || "一起听") : track?.title || "音乐";
            const artist = view.kind === "listen" ? (room?.song?.artist || track?.artist || "") : track?.artist || "";
            const listenMinutes = listening && room ? Math.floor((now - room.startedAt) / 60000) : 0;
            panel = (
                <>
                    <div className="fdi-panel-head">
                        <button type="button" className="fdi-panel-cover" onClick={openMusic} aria-label="打开音乐">
                            {cover ? <img src={cover} alt="" /> : <Music2 size={20} strokeWidth={1.7} />}
                        </button>
                        <div className="fdi-panel-text">
                            <strong>{title}</strong>
                            <span>
                                {view.kind === "listen" && listenPartner
                                    ? `和 ${listenPartner.name} 一起听${listenMinutes >= 1 ? ` · ${listenMinutes} 分钟` : ""}`
                                    : artist || (isPlaying ? "正在播放" : "已暂停")}
                            </span>
                        </div>
                    </div>
                    {track ? (
                        <div
                            className="fdi-progress"
                            role="slider"
                            aria-label="播放进度"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(progress * 100)}
                            onClick={event => {
                                if (!player || duration <= 0) return;
                                const rect = event.currentTarget.getBoundingClientRect();
                                player.seek(((event.clientX - rect.left) / Math.max(1, rect.width)) * duration);
                            }}
                        >
                            <span style={{ transform: `scaleX(${progress})` }} />
                        </div>
                    ) : null}
                    {track && player ? (
                        <div className="fdi-controls">
                            <button type="button" onClick={() => player.prev()} aria-label="上一首"><SkipBack size={17} strokeWidth={1.8} /></button>
                            <button type="button" className="fdi-play" onClick={() => player.togglePlay()} aria-label={isPlaying ? "暂停" : "继续播放"}>
                                {isPlaying ? <Pause size={19} strokeWidth={1.8} /> : <Play size={19} strokeWidth={1.8} />}
                            </button>
                            <button type="button" onClick={() => player.next()} aria-label="下一首"><SkipForward size={17} strokeWidth={1.8} /></button>
                        </div>
                    ) : null}
                    <div className="fdi-panel-actions">
                        <button type="button" className="fdi-btn" onClick={openMusic}>打开音乐</button>
                        {view.kind === "listen" && room ? (
                            <>
                                <button type="button" className="fdi-btn" onClick={() => { collapse(); openIslandTarget({ appId: "chat", sessionId: room.sessionId }); }}>进入一起听</button>
                                <button type="button" className="fdi-btn fdi-btn-danger" onClick={() => { collapse(); exitListeningRoom(room.sessionId); }}>退出</button>
                            </>
                        ) : null}
                    </div>
                </>
            );
        }
    }

    return (
        <div
            ref={rootRef}
            className="flot-island"
            data-view={view.kind}
            data-expanded={expanded ? "true" : undefined}
            data-leaving={panelLeaving ? "true" : undefined}
        >
            <div className="fdi-surface" key={view.kind === "event" ? view.event.id : view.kind}>
                {compact}
            </div>

            {/* 一起听：岛旁边分出的小圆（对方头像），点按进入一起听会话 */}
            {view.kind === "listen" && listenPartner && room ? (
                <button
                    type="button"
                    className="fdi-bub"
                    data-merged={expanded ? "true" : undefined}
                    aria-label={`进入和 ${listenPartner.name} 的一起听`}
                    onClick={() => openIslandTarget({ appId: "chat", sessionId: room.sessionId })}
                >
                    {listenPartner.avatar ? <img src={listenPartner.avatar} alt="" draggable={false} /> : <Headphones size={11} strokeWidth={1.9} />}
                </button>
            ) : null}

            {/* 来电：岛下方直接给出接听 / 拒接，不用先展开 */}
            {view.kind === "incoming" && center.incomingCall ? (
                <div className="fdi-panel fdi-incoming-panel" role="dialog" aria-label={label}>
                    <div className="fdi-panel-head">
                        {center.incomingCall.avatar ? (
                            <img className="fdi-panel-avatar" src={center.incomingCall.avatar} alt="" />
                        ) : (
                            <span className="fdi-panel-avatar">{center.incomingCall.name.slice(0, 1) || "?"}</span>
                        )}
                        <div className="fdi-panel-text">
                            <strong>{center.incomingCall.name}</strong>
                            <span>{center.incomingCall.kind === "video" ? "邀请你视频通话" : "邀请你语音通话"}</span>
                        </div>
                        <button type="button" className="fdi-round fdi-round-decline" onClick={center.incomingCall.decline} aria-label="拒接">
                            <PhoneOff size={18} strokeWidth={2} />
                        </button>
                        <button type="button" className="fdi-round fdi-round-accept" onClick={center.incomingCall.accept} aria-label="接听">
                            <Phone size={18} strokeWidth={2} />
                        </button>
                    </div>
                </div>
            ) : null}

            {panel ? (
                <div className="fdi-panel" role="dialog" aria-label={label}>
                    {panel}
                </div>
            ) : null}
        </div>
    );
}
