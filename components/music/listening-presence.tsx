"use client";
// 一起听的人：头像 / 成员面板 / 悬浮播放器旁的环形频谱。全部只读 listen-together 的同一个房间。
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { X } from "lucide-react";
import { getListeningRoom, subscribeListeningRoom, exitListeningRoom, joinGroupListeningAsUser } from "@/lib/listen-together";
import { loadCharacters } from "@/lib/character-storage";
import { findChatSessionById, resolveChatCharacterAvatar } from "@/lib/chat-storage";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { getChatImageFromIndexedDB } from "@/lib/chat-asset-storage";
import { useMusicControlsOptional } from "@/lib/music-context";
import { extractListeningColor, LISTENING_COLOR_FALLBACK } from "@/lib/listening-cover-color";

const serverSnapshot = () => null;
export function useListeningRoom() { return useSyncExternalStore(subscribeListeningRoom, getListeningRoom, serverSnapshot); }

export function useListeningPresence() {
    const room = useListeningRoom();
    const characters = loadCharacters();
    const session = room ? findChatSessionById(room.sessionId) : null;
    const character = room ? characters.find(c => c.id === room.characterId) ?? null : null;
    const user = resolveUserIdentity(session?.isGroup ? undefined : session?.contactId, session?.isGroup ? "group_chat" : "chat");
    const members = room?.isGroup ? (room.members || []).map(m => {
        const c = characters.find(item => item.id === m.characterId) ?? null;
        return { ...m, name: c?.name || "群成员", avatar: resolveChatCharacterAvatar(c) || undefined };
    }) : [];
    return {
        room: room?.status === "declined" ? null : room,
        members,
        name: room?.isGroup ? session?.groupName || "群聊" : session?.alias || character?.name || "对方",
        avatar: room?.isGroup ? members.find(m => m.status === "joined")?.avatar : resolveChatCharacterAvatar(character) || undefined,
        userName: user?.name || "你",
        userAvatar: user?.avatarUrl,
    };
}

/** 头像：普通地址直接显示，聊天图片库里的 asset 引用异步取出；没有就显示名字首字。 */
export function ListeningAvatar({ src, name }: { src?: string | null; name: string }) {
    const [resolved, setResolved] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        setResolved(null);
        if (src) {
            if (/^(https?:|data:|blob:|\/)/.test(src)) setResolved(src);
            else getChatImageFromIndexedDB(src.replace(/^asset:\/\//, "")).then(value => { if (alive) setResolved(value); }).catch(() => {});
        }
        return () => { alive = false; };
    }, [src]);
    return resolved ? <img src={resolved} alt="" draggable={false} onError={() => setResolved(null)} /> : <span>{name.slice(0, 1)}</span>;
}

export function ListeningDuration({ startedAt }: { startedAt: number }) {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 15000);
        return () => window.clearInterval(timer);
    }, [startedAt]);
    const minutes = Math.max(0, Math.floor((now - startedAt) / 60000));
    return <span>{minutes < 1 ? "此刻开始" : `一起听了 ${minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ` : ""}${minutes % 60} 分钟`}</span>;
}

/** 两个头像并排；加入时从两侧靠拢（data-joined），播放时轻微呼吸。 */
export function ListeningDuet({ userAvatar, userName, avatar, name, joined, playing }: {
    userAvatar?: string | null; userName: string; avatar?: string | null; name: string; joined: boolean; playing: boolean;
}) {
    return <span className="listening-duet" data-joined={joined} data-playing={playing} aria-hidden="true">
        <span className="listening-duet-person"><span className="listening-duet-photo"><ListeningAvatar src={userAvatar} name={userName} /></span></span>
        <span className="listening-duet-person"><span className="listening-duet-photo"><ListeningAvatar src={avatar} name={name} /></span></span>
    </span>;
}

// 装饰频谱：固定角度的短线只改长度，环和颜色都不转。
const spectrumBars = Array.from({ length: 48 }, (_, index) => {
    const angle = index * Math.PI * 2 / 48;
    return {
        rotation: index * 360 / 48,
        length: 2 + 4 * (.5 + .5 * Math.sin(angle * 3 + .8)) ** 2,
        delay: -.7 * (.5 + .5 * Math.sin(angle * 2)) - .21 * Math.cos(angle * 5),
        duration: 1.1 + .25 * (.5 + .5 * Math.cos(angle * 3)),
    };
});

/** 悬浮播放器封面外的一圈：两颗头像小星球绕封面转，相遇时频谱亮一下。 */
export function ListeningPlanets({ presence, playing }: { presence: ReturnType<typeof useListeningPresence>; playing: boolean }) {
    const player = useMusicControlsOptional();
    const [color, setColor] = useState(LISTENING_COLOR_FALLBACK);
    const cover = player?.currentTrack?.coverUrl;
    useEffect(() => { let alive = true; extractListeningColor(cover).then(value => { if (alive) setColor(value); }); return () => { alive = false; }; }, [cover]);
    if (!presence.room) return null;
    const joined = presence.members.filter(m => m.status === "joined");
    return <div className="listening-planets" style={{ "--listening-cover-color": color } as CSSProperties} aria-hidden="true"
        data-orbiting={presence.room.status === "joined" && playing ? "true" : "false"}>
        <svg className="listening-ring" viewBox="0 0 88 88" fill="none">
            <circle className="listening-ring-base" cx="44" cy="44" r="34" />
            <g className="listening-wave-window">
                {spectrumBars.map((bar, index) => <g key={index} transform={`translate(44 44) rotate(${bar.rotation}) translate(0 -32)`}>
                    <line className="listening-spectrum-bar" x1="0" y1="0" x2="0" y2={-bar.length}
                        style={{ "--spectrum-delay": bar.delay + "s", "--spectrum-duration": bar.duration + "s" } as CSSProperties} />
                </g>)}
            </g>
        </svg>
        {presence.room.userJoined !== false && <span className="listening-orbit listening-orbit-user"><span className="listening-planet"><ListeningAvatar src={presence.userAvatar} name={presence.userName} /></span></span>}
        {presence.room.isGroup ? <>
            {joined.slice(0, 2).map((m, index) => <span key={m.characterId} className={"listening-orbit " + (index ? "listening-orbit-third" : "listening-orbit-char")}><span className="listening-planet"><ListeningAvatar src={m.avatar} name={m.name} /></span></span>)}
            {joined.length > 2 && <span className="listening-planet-more">+{joined.length - 2}</span>}
        </> : <span className="listening-orbit listening-orbit-char"><span className="listening-planet"><ListeningAvatar src={presence.avatar} name={presence.name} /></span></span>}
    </div>;
}
/** 全屏播放器顶部的「和 TA 一起听」胶囊；点开是成员底部面板（群聊里每位成员单独显示状态）。 */
export function ListeningPlayerPresence() {
    const presence = useListeningPresence();
    const player = useMusicControlsOptional();
    const [open, setOpen] = useState(false);
    const room = presence.room;
    useEffect(() => setOpen(false), [room?.id]);
    if (!room) return null;
    const userOut = room.isGroup && room.userJoined === false;
    const label = userOut ? `${presence.name}的一起听` : room.status === "invited" ? `等待${presence.name}加入` : `和${presence.name}一起听`;
    const memberState = (status: string) => status === "joined" ? "一起听中" : status === "invited" ? "等待加入" : "暂未加入";
    return <>
        <button type="button" className="listening-player-presence" onClick={() => setOpen(true)} aria-label={label + "，查看成员"}>
            <ListeningDuet userAvatar={presence.userAvatar} userName={presence.userName} avatar={presence.avatar} name={presence.name} joined={room.status === "joined"} playing={!!player?.isPlaying} />
            <span className="listening-presence-copy"><strong>{label}</strong><small>{room.status === "joined" ? <ListeningDuration startedAt={room.startedAt} /> : "等待回应"}</small></span>
        </button>
        {open && <div className="listening-members-overlay" onClick={() => setOpen(false)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
            <div className="listening-members" role="dialog" aria-modal="true" aria-label="一起听成员" onClick={e => e.stopPropagation()}>
                <header><strong>一起听</strong><button type="button" autoFocus aria-label="关闭成员面板" onClick={() => setOpen(false)}><X size={20} strokeWidth={1.8} /></button></header>
                <div className="listening-member"><span className="listening-member-avatar"><ListeningAvatar src={presence.userAvatar} name={presence.userName} /></span><span>{presence.userName}<small>{userOut ? "尚未加入" : "你"}</small></span></div>
                {room.isGroup
                    ? presence.members.map(m => <div className="listening-member" key={m.characterId}><span className="listening-member-avatar"><ListeningAvatar src={m.avatar} name={m.name} /></span><span>{m.name}<small>{memberState(m.status)}</small></span></div>)
                    : <div className="listening-member"><span className="listening-member-avatar"><ListeningAvatar src={presence.avatar} name={presence.name} /></span><span>{presence.name}<small>{room.status === "invited" ? "邀请中" : player?.isPlaying ? "一起听中" : "音乐已暂停"}</small></span></div>}
                <button type="button" className="listening-end" data-tone={userOut ? "join" : "leave"} onClick={() => {
                    if (getListeningRoom()?.id !== room.id) return;
                    if (userOut) joinGroupListeningAsUser(room.sessionId);
                    else exitListeningRoom(room.sessionId);
                    setOpen(false);
                }}>{userOut ? "加入一起听" : room.status === "invited" ? "取消邀请" : room.isGroup ? "退出一起听" : "结束一起听"}</button>
            </div>
        </div>}
    </>;
}
