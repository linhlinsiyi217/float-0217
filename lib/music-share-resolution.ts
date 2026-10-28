import { unifiedSearch, type UnifiedSearchResult } from "./music-service";
import type { MusicTrack } from "./music-storage";
import { matchesSharedSong } from "./music-song-match";

export function selectSharedSong(results: UnifiedSearchResult[], title: string, artist?: string) {
    return results.find(item => matchesSharedSong(item, title, artist)) || null;
}

/** 按准确歌名 + 歌手在本地曲库和网易云里找真实歌曲；找不到返回 null，不编造曲目。 */
export async function resolveSharedSong(title: string, artist?: string): Promise<MusicTrack | null> {
    // 只用歌名搜也会命中本地曲库；「歌名 歌手」合并搜索会漏掉本地精确匹配
    let match = selectSharedSong(await unifiedSearch(title), title, artist);
    if (!match && artist?.trim()) match = selectSharedSong(await unifiedSearch(`${title} ${artist}`), title, artist);
    if (match?.localTrack) {
        const track = match.localTrack;
        return { ...track, coverUrl: track.coverUrl?.startsWith("blob:") ? undefined : track.coverUrl };
    }
    const song = match?.neteaseResult;
    if (!song) return null;
    return {
        id: `netease_${song.id}`, title: song.name, artist: song.artists, album: song.album,
        duration: song.duration / 1000, coverUrl: song.coverUrl, liked: false, addedAt: new Date().toISOString(),
    };
}
