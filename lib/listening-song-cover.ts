import { loadAllTracks, type MusicTrack } from "./music-storage";
import type { SharedListeningSong } from "./listening-library";

// 只读的封面查找：歌单封面和歌曲缩略图共用，带小缓存，不重复解码。
const covers = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();
let catalog: Promise<MusicTrack[]> | undefined;

export async function resolveListeningSongCover(song: SharedListeningSong): Promise<string | undefined> {
    if (song.coverUrl) return song.coverUrl;
    const cached = covers.get(song.id);
    if (cached) return cached;
    const existing = pending.get(song.id);
    if (existing) return existing;
    const task = (async () => {
        try {
            if (!catalog) {
                const entry = loadAllTracks();
                catalog = entry;
                void entry.finally(() => { if (catalog === entry) catalog = undefined; }).catch(() => {});
            }
            let cover = (await catalog).find(track => track.id === song.id)?.coverUrl;
            if (!cover && song.source === "netease") {
                const id = Number(song.id.replace(/^netease_/, ""));
                if (Number.isFinite(id) && id > 0) cover = (await import("./music-service").then(module => module.getNeteaseSongDetail(id)))?.coverUrl;
            }
            if (cover) {
                if (covers.size >= 64) covers.delete(covers.keys().next().value!);
                covers.set(song.id, cover);
            }
            return cover;
        } catch { return undefined; }
    })();
    pending.set(song.id, task);
    try { return await task; } finally { pending.delete(song.id); }
}
