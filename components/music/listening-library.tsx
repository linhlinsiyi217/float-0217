"use client";
// 音乐 App「一起听」页：当前一起听 / 发起邀请、每个聊天的共同歌单、有效播放时长榜单。
// 播放全部走全局播放器（listening-playback → music-control-bridge），这里不另起播放器。
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ChevronDown, Music2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useMusicControlsOptional } from "@/lib/music-context";
import { loadChatSessions, pushChatMessage, resolveChatCharacterAvatar, CHAT_REQUEST_REPLY_EVENT, type ChatSession } from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import { activateListeningSong } from "@/lib/listening-playback";
import { resolveListeningSongCover } from "@/lib/listening-song-cover";
import { listeningEntryTiming } from "@/lib/listening-motion";
import { getListeningRoom, inviteListeningRoom, inviteGroupListeningRoom } from "@/lib/listen-together";
import { createListeningPlaylist, editListeningPlaylist, deleteListeningPlaylist, listeningRanking, loadListeningLibrary, LISTENING_LIBRARY_EVENT, type SharedListeningSong } from "@/lib/listening-library";
import { ListeningAvatar, ListeningDuet, ListeningDuration, useListeningPresence } from "./listening-presence";
import ListeningAlbumShelf from "./listening-album-shelf";
import styles from "./listening-library.module.css";

function SongCover({ song, override }: { song?: SharedListeningSong; override?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [resolved, setResolved] = useState<string>();
    const [failed, setFailed] = useState(false);
    const supplied = override || song?.coverUrl;
    useEffect(() => {
        let alive = true;
        setResolved(undefined);
        if (supplied || !song) return;
        const load = () => { void resolveListeningSongCover(song).then(url => { if (alive) setResolved(url); }); };
        const node = ref.current;
        if (!node || typeof IntersectionObserver === "undefined") { load(); return () => { alive = false; }; }
        const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: "80px" });
        observer.observe(node);
        return () => { alive = false; observer.disconnect(); };
    }, [song?.id, supplied]);
    const cover = supplied || resolved;
    useEffect(() => setFailed(false), [cover]);
    return <span ref={ref} className={styles.cover}>{cover && !failed ? <img src={cover} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Music2 size={20} strokeWidth={1.6} />}</span>;
}

function latestSong(songs: SharedListeningSong[]) {
    return songs.reduce<SharedListeningSong | undefined>((a, b) => !a || b.addedAt >= a.addedAt ? b : a, undefined);
}

type Props = {
    /** 聊天里打开时固定在这个聊天：顶部换成 heroActions（邀请 / 结束按钮由聊天面板提供） */
    heroSessionId?: string;
    heroActions?: ReactNode;
};

export default function ListeningLibrary({ heroSessionId, heroActions }: Props) {
    const rootRef = useRef<HTMLElement>(null);
    const player = useMusicControlsOptional();
    const presence = useListeningPresence();
    const [, refresh] = useState(0);
    useEffect(() => {
        const update = () => refresh(n => n + 1);
        const events = [LISTENING_LIBRARY_EVENT, "chat-sessions-updated", "characters-updated"];
        events.forEach(e => window.addEventListener(e, update));
        return () => events.forEach(e => window.removeEventListener(e, update));
    }, []);

    const chars = loadCharacters();
    const sessions = loadChatSessions().filter(s => !s.isSpectator);
    const sessionName = (s?: ChatSession) => !s ? "选择聊天" : s.isGroup ? s.groupName || "群聊" : s.alias || chars.find(c => c.id === s.contactId)?.name || "聊天";
    const sessionAvatar = (s: ChatSession) => resolveChatCharacterAvatar(chars.find(c => c.id === (s.isGroup ? s.participantIds?.[0] : s.contactId))) || undefined;
    const actorName = (id: string) => id === "self" ? "你" : chars.find(c => c.id === id)?.name || "成员";

    const [scope, setScope] = useState(heroSessionId || getListeningRoom()?.sessionId || sessions[0]?.id || "");
    const session = sessions.find(s => s.id === scope);
    const playlists = session ? loadListeningLibrary().playlists.filter(p => p.sessionId === scope) : [];
    const ranking = listeningRanking().filter(r => chars.some(c => c.id === r.characterId));

    const [scopePicker, setScopePicker] = useState(false);
    const [invitePicker, setInvitePicker] = useState(false);
    const [creating, setCreating] = useState(false);
    const [album, setAlbum] = useState<string | null>(null);
    const [renaming, setRenaming] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [name, setName] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const heroRoom = !heroSessionId || presence.room?.sessionId === heroSessionId ? presence.room : null;
    const joined = !!heroRoom && heroRoom.status === "joined";
    const entry = useMemo(() => listeningEntryTiming(joined, heroRoom?.lastGlowAt), [joined, heroRoom?.id, heroRoom?.lastGlowAt, heroRoom?.glowEpoch]);

    const act = (fn: () => void) => { try { fn(); setNotice(""); } catch (e) { setNotice(e instanceof Error ? e.message : "操作失败"); } };
    const invite = (target: ChatSession) => act(() => {
        const invitation = target.isGroup ? inviteGroupListeningRoom(target.id) : inviteListeningRoom(target.id, target.contactId);
        const track = player?.currentTrack;
        pushChatMessage({ sessionId: target.id, role: "user", content: "邀请你一起听歌。", mediaType: "listening_invite", mediaData: { listeningInvite: { roomId: invitation.id, initiator: "user", title: track?.title, artist: track?.artist, coverUrl: track?.coverUrl?.startsWith("blob:") ? undefined : track?.coverUrl } } });
        setInvitePicker(false);
        window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: target.id } }));
        window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId: target.id } }));
        setNotice(`已邀请${sessionName(target)}，等 TA 回复`);
    });
    const play = async (song: SharedListeningSong, action: "toggle" | "open" = "toggle") => {
        if (busy) return;
        setBusy(true); setNotice("");
        try { await activateListeningSong(song, action, () => player?.openFullPlayer()); }
        catch (e) { setNotice(e instanceof Error ? e.message : "暂时无法播放"); }
        finally { setBusy(false); }
    };
    const saveNew = () => {
        if (!creating) return;
        act(() => { if (name.trim()) createListeningPlaylist(scope, name.trim(), "self"); setCreating(false); setName(""); });
    };
    useEffect(() => { setAlbum(null); setCreating(false); }, [scope]);
    useEffect(() => { setRenaming(false); setConfirmDelete(false); }, [album]);

    const openAlbum = playlists.find(p => p.id === album);
    const portalHost = rootRef.current?.closest(".music-app") as HTMLElement | null;
    return <section ref={rootRef} className={styles.page} aria-label="一起听">
        {/* 当前一起听 / 发起邀请 */}
        <div className={styles.hero} data-entry-animate={entry.animate || undefined} style={{ "--listening-page-delay": `${Math.max(0, entry.delayMs)}ms` } as CSSProperties}>
            {heroActions ? null : heroRoom
                ? <div className={styles.heroNow}>
                    <ListeningDuet userAvatar={presence.userAvatar} userName={presence.userName} avatar={presence.avatar} name={presence.name} joined={joined} playing={!!player?.isPlaying} />
                    <span className={styles.heroCopy}>
                        <strong>{heroRoom.isGroup && heroRoom.userJoined === false ? `${presence.name}正在一起听` : heroRoom.status === "invited" ? `等待${presence.name}加入` : `和${presence.name}一起听`}</strong>
                        <small>{joined ? <ListeningDuration startedAt={heroRoom.startedAt} /> : "等待回应"}</small>
                    </span>
                </div>
                : <div className={styles.heroIdle}>
                    <strong>一起听</strong>
                    <small>邀请一个聊天，同一首歌一起听。</small>
                </div>}
            {heroActions
                ? <div className={styles.heroActions}>{heroActions}</div>
                : !heroRoom && <button type="button" className={styles.primary} onClick={() => setInvitePicker(v => !v)} aria-expanded={invitePicker}>邀请一起听</button>}
            {invitePicker && !heroActions && <div className={styles.sheetList} role="group" aria-label="邀请一起听的聊天">
                {sessions.map(s => <button type="button" key={s.id} className={styles.row} onClick={() => invite(s)}>
                    <span className={styles.avatar}><ListeningAvatar src={sessionAvatar(s)} name={sessionName(s)} /></span>
                    <span className={styles.rowText}><strong>{sessionName(s)}</strong><small>{s.isGroup ? "群聊 · 成员各自决定是否加入" : "一起听同一首歌"}</small></span>
                    <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
                </button>)}
                {!sessions.length && <p className={styles.hint}>先建立一个聊天</p>}
            </div>}
        </div>

        {/* 共同歌单 */}
        <div className={styles.sectionHead}>
            <h3>共同歌单</h3>
            {!heroSessionId && <div className={styles.scope}>
                <button type="button" aria-expanded={scopePicker} onClick={() => setScopePicker(v => !v)}>{sessionName(session)}<ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" /></button>
                {scopePicker && <div className={styles.picker} role="group" aria-label="选择聊天" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setScopePicker(false); } }}>
                    {sessions.map(s => <button type="button" key={s.id} onClick={() => { setScope(s.id); setScopePicker(false); }}>{sessionName(s)}{s.id === scope && <Check size={16} strokeWidth={1.8} aria-hidden="true" />}</button>)}
                </div>}
            </div>}
        </div>
        {!session ? <p className={styles.hint}>先选择一个聊天，建立你们的歌单。</p> : <ListeningAlbumShelf>
            <div className={styles.albumCard}>
                <button type="button" className={styles.albumArt + " " + styles.createArt} aria-label="创建歌单" onClick={() => { setCreating(true); setName(""); }}><Plus size={28} strokeWidth={1.6} /></button>
                {creating
                    ? <input autoFocus className={styles.albumInput} aria-label="新歌单名称" placeholder="歌单名称" value={name} maxLength={60}
                        onChange={e => setName(e.target.value)} onBlur={saveNew}
                        onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); saveNew(); } if (e.key === "Escape") { e.stopPropagation(); setCreating(false); } }} />
                    : <strong>创建歌单</strong>}
            </div>
            {playlists.map(p => <div key={p.id} className={styles.albumCard}>
                <button type="button" className={styles.albumOpen} onClick={() => setAlbum(p.id)}>
                    <span className={styles.albumArt}><SongCover song={latestSong(p.songs)} /></span>
                    <strong>{p.name}</strong>
                    <small>{p.songs.length} 首 · {actorName(p.updatedBy)}最近整理</small>
                </button>
            </div>)}
        </ListeningAlbumShelf>}

        {/* 有效播放时长榜单 */}
        {!heroSessionId && <>
            <div className={styles.sectionHead}><h3>陪伴时光</h3></div>
            {!ranking.length
                ? <p className={styles.hint}>还没有一起听的时光。只有真正在播放的时间才会计入。</p>
                : <ol className={styles.ranking}>{ranking.map(r => {
                    const c = chars.find(item => item.id === r.characterId)!;
                    return <li key={c.id}>
                        <span className={styles.rank}>{r.rank}</span>
                        <span className={styles.avatar}><ListeningAvatar src={resolveChatCharacterAvatar(c) || undefined} name={c.name} /></span>
                        <span className={styles.rowText}><strong>{c.name}</strong><small>一起听过的时光</small></span>
                        <span className={styles.time}>{Math.floor(r.milliseconds / 60000)}<small> 分钟</small></span>
                    </li>;
                })}</ol>}
        </>}

        {notice && <p role="status" className={styles.notice}>{notice}</p>}

        {/* 歌单详情：盖在音乐 App 上的一页 */}
        {openAlbum && createPortal(<div className={styles.detail} hidden={!!player?.showFullPlayer} role="dialog" aria-modal="true" aria-label={openAlbum.name}
            onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setAlbum(null); } }}>
            <div className={styles.detailHeader}>
                <button type="button" className={styles.iconBtn} aria-label="返回共同歌单" onClick={() => setAlbum(null)}><ArrowLeft size={22} strokeWidth={1.8} /></button>
                <span className={styles.detailTitle}>共同歌单</span>
                <button type="button" className={styles.iconBtn} aria-label={`修改${openAlbum.name}名称`} onClick={() => { setRenaming(true); setName(openAlbum.name); }}><Pencil size={19} strokeWidth={1.8} /></button>
            </div>
            <div className={styles.detailBody}>
                <div className={styles.detailIdentity}>
                    <span className={styles.albumArt}><SongCover song={latestSong(openAlbum.songs)} /></span>
                    <h3>{openAlbum.name}</h3>
                    <small>{openAlbum.songs.length} 首 · {actorName(openAlbum.updatedBy)}最近整理</small>
                </div>
                {renaming && <form className={styles.edit} onSubmit={e => { e.preventDefault(); act(() => { editListeningPlaylist(scope, openAlbum.id, "self", { name }); setRenaming(false); }); }}>
                    <input autoFocus aria-label="歌单名称" placeholder="给歌单起个名字" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
                    <button type="submit" className={styles.primarySm} disabled={!name.trim()}>保存</button>
                    <button type="button" className={styles.secondarySm} onClick={() => setRenaming(false)}>取消</button>
                </form>}
                {!openAlbum.songs.length && <p className={styles.hint}>还没有歌曲。在播放器里点收藏，或者让 TA 帮你找歌入单。</p>}
                <div className={styles.songList}>{openAlbum.songs.map((song, index) => {
                    const current = player?.currentTrack?.id === song.id;
                    const playing = current && !!player?.isPlaying;
                    return <div className={styles.song} key={song.id}>
                        <button type="button" className={styles.songArt} disabled={busy} aria-label={`${playing ? "暂停" : "播放"}${song.title}`} aria-pressed={playing} onClick={() => void play(song)}>
                            <SongCover song={song} override={current ? player?.currentTrack?.coverUrl : undefined} />
                            <span className={styles.songPlay}>{playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</span>
                        </button>
                        <button type="button" className={styles.songLabel} disabled={busy} aria-label={`打开${song.title}播放详情`} onClick={() => void play(song, "open")}>
                            <strong>{song.title}</strong><small>{song.artist} · {actorName(song.addedBy)}加入</small>
                        </button>
                        <span className={styles.songNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                        <button type="button" className={styles.iconBtn} aria-label={`从${openAlbum.name}移除${song.title}`} onClick={() => act(() => editListeningPlaylist(scope, openAlbum.id, "self", { removeId: song.id }))}><Trash2 size={16} strokeWidth={1.8} /></button>
                    </div>;
                })}</div>
                <button type="button" className={styles.danger} onClick={() => {
                    if (!confirmDelete) { setConfirmDelete(true); return; }
                    act(() => { deleteListeningPlaylist(scope, openAlbum.id); setAlbum(null); });
                }}>{confirmDelete ? "再点一次删除歌单" : "删除歌单"}</button>
                {notice && <p role="status" className={styles.notice}>{notice}</p>}
            </div>
        </div>, portalHost || document.body)}
    </section>;
}
