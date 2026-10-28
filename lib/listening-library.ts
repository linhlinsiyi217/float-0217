// 一起听资料库：有效播放时长榜单、每个聊天的共同歌单、加入/结束记录。
// 只存元数据与稳定 ID，不缓存带签名的播放地址或 Cookie。没有数据时 = 空资料库（旧用户行为不变）。
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import type { MusicTrack } from "./music-storage";

export const LISTENING_LIBRARY_KEY = "listening-library-v1";
registerKvMigration(LISTENING_LIBRARY_KEY);
export const LISTENING_LIBRARY_EVENT = "listening-library-updated";

/** addedBy / updatedBy：角色 ID，或 "self" 表示用户 */
export type SharedListeningSong = { id: string; title: string; artist: string; source: "local" | "netease"; coverUrl?: string; addedBy: string; addedAt: number };
export type SharedListeningPlaylist = { id: string; sessionId: string; name: string; songs: SharedListeningSong[]; updatedBy: string; updatedAt: number };
type RankFact = { eventId: string; sessionId: string; characterId: string; text: string; at: number };
export type ListeningLibrary = {
    version: 1;
    totals: Record<string, number>;
    playlists: SharedListeningPlaylist[];
    sampled: string[];
    facts: RankFact[];
    history: { roomId: string; sessionId: string; characterIds: string[]; endedAt: number }[];
};

const MAX_PLAYLISTS_PER_CHAT = 50;
const MAX_SONGS_PER_PLAYLIST = 500;

export function loadListeningLibrary(): ListeningLibrary {
    try {
        const raw = JSON.parse(kvGet(LISTENING_LIBRARY_KEY) || "null");
        if (raw?.version === 1) return { totals: {}, playlists: [], sampled: [], facts: [], history: [], ...raw };
    } catch { /* 读不出来按空资料库处理 */ }
    return { version: 1, totals: {}, playlists: [], sampled: [], facts: [], history: [] };
}
function save(data: ListeningLibrary) {
    kvSet(LISTENING_LIBRARY_KEY, JSON.stringify(data));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(LISTENING_LIBRARY_EVENT));
}

/** 按累计有效时长排名，时长相同名次相同。 */
export function listeningRanking() {
    const rows = Object.entries(loadListeningLibrary().totals).filter(([, ms]) => ms > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return rows.map(([characterId, milliseconds]) => ({ characterId, milliseconds, rank: rows.findIndex(([, ms]) => ms === milliseconds) + 1 }));
}
export function ownListeningRank(characterId: string) {
    const own = listeningRanking().find(row => row.characterId === characterId);
    return { rank: own?.rank ?? null, milliseconds: own?.milliseconds ?? 0, minutes: Math.floor((own?.milliseconds ?? 0) / 60000) };
}

export function addListeningTime(characterIds: string[], milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0 || !characterIds.length) return;
    const data = loadListeningLibrary();
    for (const id of new Set(characterIds)) data.totals[id] = (data.totals[id] || 0) + milliseconds;
    save(data);
}

/** 开始 / 结束时偶尔让角色「看一眼自己的榜单」，只给这个角色本人看，是否提起由角色决定。 */
export function sampleListeningRank(roomId: string, sessionId: string, characterId: string, phase: "start" | "end", random = Math.random) {
    const data = loadListeningLibrary(), eventId = `${roomId}:${characterId}:${phase}`;
    if (data.sampled.includes(eventId)) return;
    data.sampled = [...data.sampled, eventId].slice(-2000);
    if (random() < (phase === "start" ? .1 : .25)) {
        const own = ownListeningRank(characterId);
        data.facts.push({
            eventId, sessionId, characterId, at: Date.now(),
            text: `你在一起听${phase === "start" ? "开始" : "结束"}时看了自己的榜单：${own.rank === null ? "尚未上榜" : `第${own.rank}名`}，累计${own.minutes}分钟。仅你知道此信息，是否提起由你决定。`,
        });
        data.facts = data.facts.slice(-100);
    }
    save(data);
}
export function takeListeningRankFacts(characterId: string, sessionId: string) {
    const data = loadListeningLibrary();
    const facts = data.facts.filter(f => f.characterId === characterId && f.sessionId === sessionId && Date.now() - f.at < 86400000);
    if (!facts.length) return "";
    data.facts = data.facts.filter(f => !facts.includes(f));
    save(data);
    return facts.map(f => f.text).join("\n");
}
export function finishListeningHistory(roomId: string, sessionId: string, characterIds: string[]) {
    const data = loadListeningLibrary();
    if (!data.history.some(h => h.roomId === roomId)) data.history.push({ roomId, sessionId, characterIds, endedAt: Date.now() });
    data.history = data.history.slice(-200);
    save(data);
}

export function createListeningPlaylist(sessionId: string, name: string, actorId: string) {
    const data = loadListeningLibrary();
    if (data.playlists.filter(p => p.sessionId === sessionId).length >= MAX_PLAYLISTS_PER_CHAT) throw new Error(`这个聊天已有${MAX_PLAYLISTS_PER_CHAT}张一起听歌单`);
    const playlist: SharedListeningPlaylist = {
        id: `together_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, sessionId,
        name: name.trim().slice(0, 60) || "我们一起听", songs: [], updatedBy: actorId, updatedAt: Date.now(),
    };
    data.playlists.push(playlist);
    save(data);
    return playlist;
}
export function editListeningPlaylist(sessionId: string, playlistId: string, actorId: string, edit: { name?: string; add?: SharedListeningSong; removeId?: string }) {
    const data = loadListeningLibrary(), playlist = data.playlists.find(p => p.id === playlistId && p.sessionId === sessionId);
    if (!playlist) throw new Error("找不到这个聊天的一起听歌单");
    if (edit.name !== undefined) {
        if (!edit.name.trim()) throw new Error("歌单名称不能为空");
        playlist.name = edit.name.trim().slice(0, 60);
    }
    if (edit.removeId) {
        if (!playlist.songs.some(song => song.id === edit.removeId)) throw new Error("歌单里没有这首歌");
        playlist.songs = playlist.songs.filter(song => song.id !== edit.removeId);
    }
    if (edit.add && !playlist.songs.some(song => song.id === edit.add!.id)) {
        if (playlist.songs.length >= MAX_SONGS_PER_PLAYLIST) throw new Error(`歌单最多${MAX_SONGS_PER_PLAYLIST}首歌`);
        playlist.songs.push(edit.add);
    }
    playlist.updatedBy = actorId;
    playlist.updatedAt = Date.now();
    save(data);
    return playlist;
}
export function deleteListeningPlaylist(sessionId: string, playlistId: string) {
    const data = loadListeningLibrary();
    if (!data.playlists.some(p => p.id === playlistId && p.sessionId === sessionId)) throw new Error("找不到这个聊天的一起听歌单");
    data.playlists = data.playlists.filter(p => p.id !== playlistId || p.sessionId !== sessionId);
    save(data);
}
export function songForListeningLibrary(track: MusicTrack, actorId: string): SharedListeningSong {
    return {
        id: track.id, title: track.title, artist: track.artist,
        coverUrl: track.coverUrl?.startsWith("blob:") || track.coverUrl?.startsWith("data:") ? undefined : track.coverUrl,
        source: track.id.startsWith("netease_") ? "netease" : "local", addedBy: actorId, addedAt: Date.now(),
    };
}
