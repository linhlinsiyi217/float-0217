"use client";
// 加入一起听的一次性动效：屏幕边缘泛起封面色的柔光，中间短暂出现两人头像，约 2.4 秒后淡出。
// 每次加入只播一次（recordListeningGlow 记下时间），换页面回来不重播；减少动态时不播。
import { useEffect, useState, type CSSProperties } from "react";
import { useListeningPresence, ListeningDuet } from "./listening-presence";
import { getListeningRoom, recordListeningGlow } from "@/lib/listen-together";
import { useMusicControlsOptional } from "@/lib/music-context";
import { extractListeningColor, LISTENING_COLOR_FALLBACK } from "@/lib/listening-cover-color";
import { LISTENING_GLOW_MS } from "@/lib/listening-motion";

export function ListeningGlow() {
    const presence = useListeningPresence();
    const { room } = presence;
    const player = useMusicControlsOptional();
    const [pulse, setPulse] = useState(0);
    const [color, setColor] = useState(LISTENING_COLOR_FALLBACK);
    const cover = player?.currentTrack?.coverUrl || room?.song?.coverUrl;
    useEffect(() => { let alive = true; extractListeningColor(cover).then(value => { if (alive) setColor(value); }); return () => { alive = false; }; }, [cover]);
    useEffect(() => {
        if (!room || room.status !== "joined" || room.userJoined === false) { setPulse(0); return; }
        const current = getListeningRoom();
        if (current?.id !== room.id || current.lastGlowAt) return;
        recordListeningGlow(current.id);
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        setPulse(n => n + 1);
    }, [room?.id, room?.status, room?.glowEpoch, room?.userJoined]);
    useEffect(() => {
        if (!pulse) return;
        const timer = window.setTimeout(() => setPulse(0), LISTENING_GLOW_MS + 200);
        return () => window.clearTimeout(timer);
    }, [pulse]);
    if (!pulse || !room || room.status !== "joined") return null;
    return <div key={pulse} className="listening-global-glow" aria-hidden="true" style={{ "--listening-cover-color": color, "--listening-glow-ms": `${LISTENING_GLOW_MS}ms` } as CSSProperties}>
        <div className="listening-glow-badge">
            <ListeningDuet userAvatar={presence.userAvatar} userName={presence.userName} avatar={presence.avatar} name={presence.name} joined playing={false} />
            <span>和{presence.name}一起听</span>
        </div>
    </div>;
}
