// components/music/lock-music-card.tsx — 锁屏音乐卡片
// 有歌在放时，锁屏时钟下方露出封面、歌名与上一首/播放/下一首。
// 数据来自全局 MusicProvider（锁屏层已挂在 Provider 内），与桌面播放器同一状态源。
"use client";

import { useMusicControlsOptional } from "@/lib/music-context";

export function LockMusicCard() {
    const player = useMusicControlsOptional();
    const track = player?.currentTrack;
    if (!player || !track) return null;

    return (
        <div className="lock-music-card" {...(player.isPlaying ? { "data-playing": "" } : {})}>
            <div className="lock-music-cover">
                {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" draggable={false} />
                ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                )}
                {player.isPlaying ? (
                    <span className="lock-music-wave" aria-hidden>
                        {[0, 1, 2].map(i => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}
                    </span>
                ) : null}
            </div>
            <div className="lock-music-info">
                <div className="lock-music-title">{track.title}</div>
                <div className="lock-music-artist">{track.artist || "未知歌手"}</div>
            </div>
            <div className="lock-music-controls">
                <button type="button" aria-label="上一首" onClick={() => player.prev()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                </button>
                <button type="button" aria-label={player.isPlaying ? "暂停" : "播放"} onClick={() => player.togglePlay()}>
                    {player.isPlaying ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                    ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    )}
                </button>
                <button type="button" aria-label="下一首" onClick={() => player.next()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm8.5 0h2V6h-2v12z" /></svg>
                </button>
            </div>
        </div>
    );
}
