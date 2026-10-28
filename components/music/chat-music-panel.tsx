"use client";
// 聊天加号菜单「一起听」：在聊天上盖一层音乐 App（同一个全局播放器），顶部是这个聊天的邀请 / 结束按钮。
// 普通音乐分享仍走原来的分享卡；这里只负责一起听邀请，两者分开。
import { useEffect, useRef, useState } from "react";
import MusicApp from "./music-app";
import { ListeningDuet, ListeningDuration, ListeningPlayerPresence, useListeningPresence, useListeningRoom } from "./listening-presence";
import { useMusicControlsOptional } from "@/lib/music-context";
import { joinGroupListeningAsUser } from "@/lib/listen-together";
import styles from "./chat-music-panel.module.css";

type Props = {
    sessionId: string;
    isGroup: boolean;
    name: string;
    avatar?: string;
    busy: boolean;
    onClose: () => void;
    /** 发出邀请；失败时抛错，面板显示原因 */
    onInvite: () => void;
    onLeave: () => void;
    /** 邀请后 TA 还没回：手动请 TA 回复 */
    onRetry: () => void;
};

export default function ChatMusicPanel({ sessionId, isGroup, name, avatar, busy, onClose, onInvite, onLeave, onRetry }: Props) {
    const presence = useListeningPresence();
    const room = useListeningRoom();
    const mine = room?.sessionId === sessionId && room.status !== "declined" ? room : null;
    const player = useMusicControlsOptional();
    const [notice, setNotice] = useState("");
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);

    const userOut = !!mine?.isGroup && mine.userJoined === false;
    const joined = mine?.status === "joined";
    const title = userOut ? `${name}正在一起听` : joined ? `和${name}一起听` : mine ? `等待${name}加入` : `邀请${name}一起听`;
    const sub = joined ? <ListeningDuration startedAt={mine!.startedAt} /> : mine ? "等待回应" : room && room.status !== "declined" ? "已有另一个聊天在一起听，请先回去结束" : isGroup ? "群成员会各自决定是否加入" : "先选一首想一起听的歌";
    const run = (fn: () => void) => { setNotice(""); try { fn(); } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败，请重试"); } };

    const controls = <div className={styles.card}>
        <div className={styles.cardRow}>
            <ListeningDuet userAvatar={presence.userAvatar} userName={presence.userName} avatar={mine ? presence.avatar : avatar} name={name} joined={joined} playing={!!player?.isPlaying} />
            <span className={styles.copy}><strong>{title}</strong><small>{sub}</small></span>
        </div>
        <div className={styles.actions}>
            {userOut
                ? <button type="button" className={styles.primary} onClick={() => run(() => joinGroupListeningAsUser(sessionId))}>加入</button>
                : mine ? <>
                    {mine.status === "invited" && !busy && mine.initiator !== "character" && <button type="button" className={styles.secondary} onClick={onRetry}>请 TA 回复</button>}
                    <button type="button" className={styles.secondary} onClick={() => run(onLeave)}>{joined ? (mine.isGroup ? "退出一起听" : "结束一起听") : "取消邀请"}</button>
                </>
                : <button type="button" className={styles.primary} disabled={busy || !!(room && room.status !== "declined")} aria-busy={busy || undefined} onClick={() => run(onInvite)}>{busy ? "正在回复" : "发出邀请"}</button>}
        </div>
        {mine?.isGroup && <ListeningPlayerPresence />}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
    </div>;

    return <div ref={root} className={styles.panel} onPointerDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="一起听" tabIndex={-1}
        onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
        <MusicApp onClose={onClose} initialTogether listeningSessionId={sessionId} headerAccessory={controls} />
    </div>;
}
