"use client";

// components/kuaichuan/kuaichuan-app.tsx — 快穿局 App 主壳。
// 四个页签：文游（LLM 快穿文字冒险）/ 转盘（金币抽奖 + 命运重抽券兑换）/
// 表情包（联动聊天表情数据）/ 网易云歌单（联动全局音乐播放）。
// 样式见 styles/kuaichuan.css。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronLeft,
    Coins,
    Gamepad2,
    Image as ImageIcon,
    Loader2,
    ListMusic,
    MessageSquareText,
    RefreshCw,
    RotateCcw,
    Send,
    Sparkles,
    Ticket,
} from "lucide-react";

import { resolveForumApiConfig } from "@/lib/study-room/forum";
import { simpleLLMCall } from "@/lib/api-helpers";
import {
    FREE_SPINS_PER_DAY,
    KUAICHUAN_WORLDS,
    clearGameSave,
    loadGameSave,
    loadWallet,
    saveGameSave,
    saveWallet,
    type KuaichuanGameSave,
    type KuaichuanWallet,
} from "@/lib/kuaichuan-storage";
import { loadStickerPacks, type StickerPack } from "@/lib/custom-sticker-storage";
import { getThemeAssetMap } from "@/lib/theme-storage";
import {
    getNeteaseLyrics,
    getNeteasePlayInfo,
    getNeteaseSongDetail,
    getPersonalizedPlaylists,
    getPlaylistTracks,
    isNeteaseConfigured,
    type NeteasePlaylist,
    type NeteaseSearchResult,
} from "@/lib/music-service";
import { useMusicControlsOptional } from "@/lib/music-context";
import type { MusicTrack } from "@/lib/music-storage";

type KuaichuanTab = "game" | "wheel" | "stickers" | "music";

const TABS: Array<{ id: KuaichuanTab; label: string; icon: typeof Gamepad2 }> = [
    { id: "game", label: "文游", icon: Gamepad2 },
    { id: "wheel", label: "转盘", icon: Coins },
    { id: "stickers", label: "表情包", icon: ImageIcon },
    { id: "music", label: "歌单", icon: ListMusic },
];

export function KuaichuanApp({ onClose }: { onClose: () => void }) {
    const [tab, setTab] = useState<KuaichuanTab>("game");

    return (
        <div className="kc-app">
            <header className="kc-header">
                <button type="button" className="kc-icon-btn" onClick={onClose} aria-label="关闭">
                    <ChevronLeft size={20} strokeWidth={1.8} />
                </button>
                <div className="kc-header-title">
                    快穿<em>局</em>
                </div>
                <span className="kc-header-sub">世界线管理局 · 娱乐分局</span>
            </header>

            {tab === "game" && <KuaichuanGamePane />}
            {tab === "wheel" && <KuaichuanWheelPane />}
            {tab === "stickers" && <KuaichuanStickerPane />}
            {tab === "music" && <KuaichuanMusicPane />}

            <nav className="kc-tabbar">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        className="kc-tab"
                        data-active={tab === id ? "true" : undefined}
                        onClick={() => setTab(id)}
                    >
                        <Icon size={20} strokeWidth={1.7} />
                        <span>{label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}

// ══════════════════════ 文游 ══════════════════════

function KuaichuanGamePane() {
    const [save, setSave] = useState<KuaichuanGameSave | null>(null);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const world = useMemo(() => KUAICHUAN_WORLDS.find((w) => w.id === save?.worldId) ?? null, [save?.worldId]);

    // 进入某世界：有存档恢复存档，没有就用开场白开新档
    const enterWorld = useCallback((worldId: string) => {
        const meta = KUAICHUAN_WORLDS.find((w) => w.id === worldId);
        if (!meta) return;
        const existing = loadGameSave(worldId);
        if (existing) {
            setSave(existing);
        } else {
            const fresh: KuaichuanGameSave = {
                worldId,
                rounds: 0,
                history: [{ role: "assistant", content: meta.opener }],
                updatedAt: new Date().toISOString(),
            };
            saveGameSave(fresh);
            setSave(fresh);
        }
        setInput("");
        setError(null);
    }, []);

    useEffect(() => {
        const body = bodyRef.current;
        if (body) body.scrollTop = body.scrollHeight;
    }, [save?.rounds, save?.history.length, busy]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || !save || !world || busy) return;
        const apiConfig = resolveForumApiConfig();
        if (!apiConfig) {
            setError("还没有配置 API：到「设置 → API 配置」添加一个并设为默认");
            return;
        }
        if (!apiConfig.apiKey || !apiConfig.baseUrl) {
            setError(`API「${apiConfig.name || "默认"}」缺地址或密钥，到「设置 → API 配置」补上`);
            return;
        }
        const userMsg = { role: "user" as const, content: text };
        const nextHistory = [...save.history, userMsg];
        setSave({ ...save, rounds: save.rounds + 1, history: nextHistory });
        setInput("");
        setError(null);
        setBusy(true);
        try {
            const systemPrompt = [
                `你是「快穿局」的文字冒险主持人。玩家是快穿者，当前世界「${world.title}」（${world.subtitle}）。`,
                `本局任务：${world.goal}。`,
                "",
                "规则：",
                "- 每轮用 2-4 段推进剧情：环境变化、NPC 反应、新事件，结尾留出玩家可行动的空间。",
                "- 不替玩家做决定、不替玩家说话。",
                `- 文风：快穿网文的干脆节奏，画面感强，可偶尔插入【系统】提示音调侃玩家。`,
                "- 玩家达成任务目标时，给出收束结局并祝贺通关；通关后若玩家继续输入，就开启番外闲聊。",
                "- 全程使用中文，单次回复 300 字以内。",
            ].join("\n");
            const result = await simpleLLMCall(
                apiConfig,
                [
                    { role: "system", content: systemPrompt },
                    ...nextHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
                ],
                { temperature: 0.9, max_tokens: 600, label: "kuaichuan-game" },
            );
            if (result.error || !result.content) throw new Error(result.error || "没有返回内容");
            const done: KuaichuanGameSave = {
                ...save,
                rounds: save.rounds + 1,
                history: [...nextHistory, { role: "assistant", content: result.content.trim() }],
                updatedAt: new Date().toISOString(),
            };
            saveGameSave(done);
            setSave(done);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            setError(`推进失败：${reason.slice(0, 80)}`);
            // 玩家那句话留在历史里，可以直接重试（发送时重新带上）
        } finally {
            setBusy(false);
        }
    };

    const handleRestart = () => {
        if (!save) return;
        clearGameSave(save.worldId);
        enterWorld(save.worldId);
    };

    if (!save) {
        // 世界选择页
        return (
            <div className="kc-pane kc-world-list">
                <p className="kc-world-intro">
                    局里备着六条世界线，各派一个任务。选一条投放自己——进度自动保存，随时回来接着穿。
                </p>
                <div className="kc-world-grid">
                    {KUAICHUAN_WORLDS.map((w) => {
                        const existing = loadGameSave(w.id);
                        return (
                            <button key={w.id} type="button" className="kc-world-card" onClick={() => enterWorld(w.id)}>
                                <span className="kc-world-title">{w.title}</span>
                                <span className="kc-world-sub">{w.subtitle}</span>
                                <span className="kc-world-goal">任务：{w.goal}</span>
                                <span className="kc-world-meta">
                                    {existing ? `已推进 ${existing.rounds} 轮 · 继续穿越` : "新世界线"}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="kc-pane kc-game">
            <div className="kc-game-head">
                <button type="button" className="kc-icon-btn" onClick={() => setSave(null)} aria-label="回到世界列表">
                    <ChevronLeft size={18} strokeWidth={1.8} />
                </button>
                <div className="kc-game-title">
                    {world?.title ?? "世界线"}
                    <small>{world?.subtitle}</small>
                </div>
                <button type="button" className="kc-icon-btn" onClick={handleRestart} aria-label="重开本世界">
                    <RotateCcw size={18} strokeWidth={1.8} />
                </button>
            </div>
            <div className="kc-game-goal">【系统】本局任务：{world?.goal}</div>
            <div ref={bodyRef} className="kc-game-body">
                {save.history.map((msg, i) => (
                    <div key={i} className="kc-game-msg" data-role={msg.role}>
                        {msg.content}
                    </div>
                ))}
                {busy && (
                    <div className="kc-game-msg" data-role="assistant" data-typing="true">
                        <Loader2 size={14} className="kc-spin" /> 系统推演中…
                    </div>
                )}
                {error && (
                    <div className="kc-game-error">
                        {error}
                        <button type="button" onClick={() => void handleSend()}>
                            重试
                        </button>
                    </div>
                )}
            </div>
            <div className="kc-game-input-row">
                <textarea
                    className="kc-game-input"
                    rows={1}
                    placeholder="写下你的下一步行动…"
                    value={input}
                    disabled={busy}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleSend();
                        }
                    }}
                />
                <button
                    type="button"
                    className="kc-game-send"
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || busy}
                    aria-label="发送"
                >
                    {busy ? <Loader2 size={18} className="kc-spin" /> : <Send size={18} strokeWidth={1.8} />}
                </button>
            </div>
        </div>
    );
}

// ══════════════════════ 提现转盘 ══════════════════════

const WHEEL_SEGMENTS = [
    { label: "金币 +8", coins: 8 },
    { label: "金币 +15", coins: 15 },
    { label: "金币 +28", coins: 28 },
    { label: "谢谢参与", coins: 0 },
    { label: "金币 +8", coins: 8 },
    { label: "金币 +50", coins: 50 },
    { label: "金币 +88", coins: 88 },
    { label: "再来一次", coins: -1 }, // -1：返还一次机会
];
const SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

function KuaichuanWheelPane() {
    const [wallet, setWallet] = useState<KuaichuanWallet>(() => loadWallet());
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        };
    }, []);

    const spin = () => {
        if (spinning) return;
        if (wallet.freeSpinsLeft <= 0) {
            setResult("今天的免费次数用完了，明天再来。");
            return;
        }
        // 命运重抽券：强制落在 88 金币大奖格
        const useCharm = wallet.luckyCharm > 0;
        const targetIndex = useCharm
            ? WHEEL_SEGMENTS.findIndex((s) => s.coins === 88)
            : Math.floor(Math.random() * WHEEL_SEGMENTS.length);
        const base = rotation - (rotation % 360);
        // 让第 targetIndex 格的中心对准正上方的指针
        const target = base + 360 * 5 - targetIndex * SEGMENT_ANGLE - SEGMENT_ANGLE / 2;
        const nextWallet: KuaichuanWallet = {
            ...wallet,
            freeSpinsLeft: wallet.freeSpinsLeft - 1,
            luckyCharm: useCharm ? wallet.luckyCharm - 1 : wallet.luckyCharm,
            totalSpins: wallet.totalSpins + 1,
        };
        setWallet(nextWallet);
        saveWallet(nextWallet);
        setResult(null);
        setSpinning(true);
        setRotation(target);
        timerRef.current = window.setTimeout(() => {
            setSpinning(false);
            const seg = WHEEL_SEGMENTS[targetIndex];
            let settled: KuaichuanWallet;
            if (seg.coins === -1) {
                // 再来一次：次数原路返还
                settled = { ...nextWallet, freeSpinsLeft: nextWallet.freeSpinsLeft + 1 };
                setResult("再来一次！次数已返还，接着转。");
            } else {
                settled = { ...nextWallet, coins: nextWallet.coins + seg.coins };
                setResult(seg.coins === 0 ? "谢谢参与——局里说：穿越也有空窗期。" : `中了 ${seg.label}！金币已入账。`);
            }
            saveWallet(settled);
            setWallet(settled);
        }, 4200);
    };

    const exchangeCharm = () => {
        if (wallet.coins < 100) return;
        const next: KuaichuanWallet = {
            ...wallet,
            coins: wallet.coins - 100,
            luckyCharm: wallet.luckyCharm + 1,
            withdrawLog: [{ at: new Date().toISOString(), coins: 100, note: "兑换命运重抽券" }, ...wallet.withdrawLog].slice(0, 20),
        };
        saveWallet(next);
        setWallet(next);
        setResult("提现成功：100 金币兑换 1 张命运重抽券，下一抽必中 88 大奖。");
    };

    return (
        <div className="kc-pane kc-wheel-pane">
            <div className="kc-wallet-row">
                <span className="kc-wallet-chip">
                    <Coins size={14} strokeWidth={1.8} /> {wallet.coins}
                </span>
                <span className="kc-wallet-chip">
                    <Ticket size={14} strokeWidth={1.8} /> 重抽券 ×{wallet.luckyCharm}
                </span>
                <span className="kc-wallet-chip">今日免费 {wallet.freeSpinsLeft}/{FREE_SPINS_PER_DAY}</span>
            </div>

            <div className="kc-wheel-stage">
                <div className="kc-wheel-pointer" />
                <div
                    className="kc-wheel"
                    style={{ transform: `rotate(${rotation}deg)` }}
                    data-spinning={spinning ? "true" : undefined}
                >
                    {WHEEL_SEGMENTS.map((seg, i) => {
                        const angle = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
                        return (
                            <span
                                key={i}
                                className="kc-wheel-label"
                                style={{ transform: `rotate(${angle}deg) translateY(-74px)` }}
                            >
                                <span
                                    className="kc-wheel-label-text"
                                    style={{ transform: `translate(-50%, -50%) rotate(${-angle}deg)` }}
                                >
                                    {seg.label}
                                </span>
                            </span>
                        );
                    })}
                </div>
            </div>

            <button type="button" className="kc-spin-btn" onClick={spin} disabled={spinning}>
                {spinning ? <Loader2 size={18} className="kc-spin" /> : <Sparkles size={18} strokeWidth={1.8} />}
                {spinning ? "转盘中…" : "开转"}
            </button>
            {result && <p className="kc-wheel-result">{result}</p>}

            <div className="kc-exchange">
                <div className="kc-exchange-title">提现柜台</div>
                <p className="kc-exchange-note">
                    金币攒到 100，可提现兑换 1 张「命运重抽券」——下一抽必中 88 金币大奖格。累计已转 {wallet.totalSpins} 次。
                </p>
                <button
                    type="button"
                    className="kc-exchange-btn"
                    onClick={exchangeCharm}
                    disabled={wallet.coins < 100}
                >
                    100 金币 → 1 张重抽券
                </button>
                {wallet.withdrawLog.length > 0 && (
                    <ul className="kc-exchange-log">
                        {wallet.withdrawLog.map((item, i) => (
                            <li key={i}>
                                {new Date(item.at).toLocaleString("zh-CN")} · {item.note}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ══════════════════════ 表情包 ══════════════════════

function KuaichuanStickerPane() {
    const [packs, setPacks] = useState<StickerPack[] | null>(null);
    const [assetMap, setAssetMap] = useState<Record<string, string>>({});

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const list = loadStickerPacks();
            const ids = list.flatMap((p) => p.stickers.map((s) => s.assetId)).filter(Boolean);
            const map = ids.length > 0 ? await getThemeAssetMap(ids).catch(() => ({})) : {};
            if (cancelled) return;
            setPacks(list);
            setAssetMap(map);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const total = packs?.reduce((sum, p) => sum + p.stickers.length, 0) ?? 0;

    return (
        <div className="kc-pane kc-sticker-pane">
            {packs === null ? (
                <div className="kc-empty">
                    <Loader2 size={18} className="kc-spin" /> 正在读取表情包…
                </div>
            ) : packs.length === 0 ? (
                <div className="kc-empty">
                    还没有表情包。
                    <br />
                    到聊天的「我的 → 表情管理」创建一个，局里会同步展示。
                </div>
            ) : (
                <>
                    <p className="kc-sticker-summary">
                        共 {packs.length} 个表情包、{total} 张贴纸，来自 FLOT 聊天。聊天里用「表情包:名字」即可发送。
                    </p>
                    <div className="kc-sticker-list">
                        {packs.map((pack) => (
                            <div key={pack.id} className="kc-sticker-pack">
                                <div className="kc-sticker-pack-head">
                                    {pack.name}
                                    <small>{pack.stickers.length} 张</small>
                                </div>
                                {pack.stickers.length === 0 ? (
                                    <div className="kc-empty" style={{ padding: "12px 0" }}>这个包还是空的。</div>
                                ) : (
                                    <div className="kc-sticker-grid">
                                        {pack.stickers.map((sticker) => {
                                            const src = sticker.externalUrl || assetMap[sticker.assetId] || "";
                                            return (
                                                <div key={sticker.id} className="kc-sticker-item" title={sticker.name}>
                                                    {src ? <img src={src} alt={sticker.name} /> : <ImageIcon size={20} />}
                                                    <span>{sticker.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
            <button
                type="button"
                className="kc-link-btn"
                onClick={() => window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "chat" } }))}
            >
                <MessageSquareText size={16} strokeWidth={1.8} /> 去聊天里创建和管理表情包
            </button>
        </div>
    );
}

// ══════════════════════ 网易云歌单 ══════════════════════

function KuaichuanMusicPane() {
    const player = useMusicControlsOptional();
    const [playlists, setPlaylists] = useState<NeteasePlaylist[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [active, setActive] = useState<NeteasePlaylist | null>(null);
    const [tracks, setTracks] = useState<NeteaseSearchResult[] | null>(null);
    const [loadingTracks, setLoadingTracks] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast((prev) => (prev === message ? null : prev)), 2400);
    }, []);

    const load = useCallback(() => {
        if (!isNeteaseConfigured()) {
            setPlaylists([]);
            setFailed(false);
            return;
        }
        setPlaylists(null);
        setFailed(false);
        getPersonalizedPlaylists(12)
            .then((list) => setPlaylists(list))
            .catch(() => setFailed(true));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openPlaylist = async (playlist: NeteasePlaylist) => {
        setActive(playlist);
        setLoadingTracks(true);
        setTracks(null);
        const list = await getPlaylistTracks(playlist.id).catch(() => []);
        setTracks(list);
        setLoadingTracks(false);
    };

    const playSong = async (song: NeteaseSearchResult) => {
        if (!player) return;
        const info = await getNeteasePlayInfo(song.id);
        if (!info.url) {
            showToast(info.reason || "这首暂时放不了");
            return;
        }
        const detail = await getNeteaseSongDetail(song.id);
        const lyrics = await getNeteaseLyrics(song.id).catch(() => "");
        const track: MusicTrack = {
            id: `netease_${song.id}`,
            title: detail?.name || song.name,
            artist: detail?.artists || song.artists,
            duration: song.duration / 1000,
            coverUrl: detail?.coverUrl || song.coverUrl,
            lyrics,
            liked: false,
            addedAt: new Date().toISOString(),
        };
        if (!player.queue.some((t) => t.id === track.id)) {
            player.setQueue([track, ...player.queue]);
        }
        player.playUrl(info.url, track);
        showToast(info.trial ? "VIP 歌曲，试听 30 秒" : `正在播放：${track.title}`);
    };

    if (!isNeteaseConfigured()) {
        return (
            <div className="kc-pane kc-music-pane">
                <div className="kc-empty">
                    还没有配置音乐 API。
                    <br />
                    到音乐 App 的网易云登录页配置后，这里会同步推荐歌单。
                </div>
                <button
                    type="button"
                    className="kc-link-btn"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "music" } }))}
                >
                    <ListMusic size={16} strokeWidth={1.8} /> 去音乐 App 配置
                </button>
            </div>
        );
    }

    return (
        <div className="kc-pane kc-music-pane">
            {active ? (
                <>
                    <div className="kc-game-head">
                        <button type="button" className="kc-icon-btn" onClick={() => setActive(null)} aria-label="返回歌单列表">
                            <ChevronLeft size={18} strokeWidth={1.8} />
                        </button>
                        <div className="kc-game-title">
                            {active.name}
                            <small>{active.creator} · {active.trackCount} 首</small>
                        </div>
                        <span />
                    </div>
                    {loadingTracks ? (
                        <div className="kc-empty"><Loader2 size={18} className="kc-spin" /> 正在拉取歌单歌曲…</div>
                    ) : (tracks ?? []).length === 0 ? (
                        <div className="kc-empty">这个歌单拉不到歌曲，换一个试试。</div>
                    ) : (
                        <div className="kc-track-list">
                            {(tracks ?? []).map((song) => (
                                <button key={song.id} type="button" className="kc-track" onClick={() => void playSong(song)}>
                                    <span className="kc-track-name">{song.name}</span>
                                    <span className="kc-track-artist">{song.artists}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <>
                    {playlists === null ? (
                        <div className="kc-empty"><Loader2 size={18} className="kc-spin" /> 正在加载推荐歌单…</div>
                    ) : failed ? (
                        <div className="kc-empty">
                            歌单加载失败。
                            <button type="button" className="kc-retry" onClick={load}>
                                <RefreshCw size={14} strokeWidth={1.8} /> 重试
                            </button>
                        </div>
                    ) : playlists.length === 0 ? (
                        <div className="kc-empty">暂时没有拿到推荐歌单，稍后再来。</div>
                    ) : (
                        <div className="kc-playlist-grid">
                            {playlists.map((pl) => (
                                <button key={pl.id} type="button" className="kc-playlist-card" onClick={() => void openPlaylist(pl)}>
                                    <span
                                        className="kc-playlist-cover"
                                        style={pl.coverUrl ? { backgroundImage: `url("${pl.coverUrl}")` } : undefined}
                                    >
                                        {!pl.coverUrl && <ListMusic size={22} strokeWidth={1.6} />}
                                    </span>
                                    <span className="kc-playlist-name">{pl.name}</span>
                                    <span className="kc-playlist-meta">{pl.trackCount} 首</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        type="button"
                        className="kc-link-btn"
                        onClick={() => window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "music" } }))}
                    >
                        <ListMusic size={16} strokeWidth={1.8} /> 在音乐 App 里打开
                    </button>
                </>
            )}
            {toast && <div className="kc-music-toast">{toast}</div>}
        </div>
    );
}
