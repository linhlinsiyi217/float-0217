const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}]/gu, "");

/** 歌名必须一致；给了歌手时歌手也要对上（多歌手按分隔符拆开比对）。没给歌手时保留搜索排序。 */
export function matchesSharedSong(item: { title: string; artist: string }, title: string, artist?: string): boolean {
    if (!normalized(title) || normalized(item.title) !== normalized(title)) return false;
    if (!artist?.trim()) return true;
    return normalized(item.artist) === normalized(artist)
        || item.artist.split(/\s*[/、,;&]\s*/).some(name => normalized(name) === normalized(artist));
}
