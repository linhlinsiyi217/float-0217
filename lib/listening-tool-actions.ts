// 「一起听」动作执行：只能操作当前聊天的共同歌单，执行者必须是当前聊天里的角色。
import { loadChatSessions } from "./chat-storage";
import { getMusicControlBridge } from "./music-control-bridge";
import { ownListeningRank, loadListeningLibrary, createListeningPlaylist, editListeningPlaylist, songForListeningLibrary } from "./listening-library";
import { settleListeningTime, getListeningRoom } from "./listen-together";
import { resolveSharedSong } from "./music-share-resolution";
import { LISTENING_RANK_TOOL } from "./listening-tool-definitions";

type Context = { characterId?: string; sessionId?: string; appId?: string; signal?: AbortSignal };

function belongs(sessionId: string, actor: string) {
    const session = loadChatSessions().find(s => s.id === sessionId);
    if (!session) return null;
    return (session.isGroup ? session.participantIds?.includes(actor) : session.contactId === actor) ? session : null;
}

export async function executeListeningAction(name: string, args: Record<string, unknown>, context: Context): Promise<unknown> {
    const actor = context.characterId;
    if (!actor || !context.sessionId || !["chat", "group_chat"].includes(context.appId || "")) throw new Error("缺少当前聊天角色身份");
    const session = belongs(context.sessionId, actor);
    if (!session) throw new Error("角色不属于当前聊天");

    if (name === LISTENING_RANK_TOOL) {
        settleListeningTime();
        const own = ownListeningRank(actor);
        return { rank: own.rank, minutes: own.minutes, note: own.rank === null ? "还没有一起听的有效时长" : undefined };
    }

    const action = String(args.action || "");
    const id = String(args.playlistId || "");
    const summary = (p: { id: string; name: string; songs: unknown[] }) => ({ id: p.id, name: p.name, songCount: p.songs.length });

    if (action === "list") {
        return loadListeningLibrary().playlists.filter(p => p.sessionId === session.id).map(p => ({
            ...summary(p), updatedBy: p.updatedBy === "self" ? "用户" : p.updatedBy === actor ? "你" : p.updatedBy,
            ...(p.id === id ? { songs: p.songs.slice(0, 100).map(s => ({ songId: s.id, title: s.title, artist: s.artist })) } : {}),
        }));
    }
    if (action === "create") return summary(createListeningPlaylist(session.id, String(args.name || "我们一起听"), actor));
    if (action === "rename") return summary(editListeningPlaylist(session.id, id, actor, { name: String(args.name || "") }));
    if (action === "remove") return summary(editListeningPlaylist(session.id, id, actor, { removeId: String(args.songId || "") }));
    if (action === "add_song") {
        const title = String(args.title || "").trim(), artist = String(args.artist || "").trim();
        if (!title || !artist) throw new Error("加入指定歌曲需要准确歌名title和歌手artist");
        if (!loadListeningLibrary().playlists.some(p => p.id === id && p.sessionId === session.id)) throw new Error("找不到当前聊天的歌单，请先list取得playlistId");
        const track = await resolveSharedSong(title, artist);
        if (context.signal?.aborted) throw new Error("操作已取消，未加入歌曲");
        if (!belongs(session.id, actor)) throw new Error("角色已不属于当前聊天，未加入歌曲");
        if (!track) throw new Error("未找到匹配的歌曲，未加入歌单");
        const playlist = editListeningPlaylist(session.id, id, actor, { add: songForListeningLibrary(track, actor) });
        return { ...summary(playlist), song: { songId: track.id, title: track.title, artist: track.artist } };
    }
    if (action === "add_current") {
        const room = getListeningRoom(), state = getMusicControlBridge()?.getState();
        const inRoom = room?.sessionId === session.id && room.status === "joined"
            && (!room.isGroup || room.members?.some(m => m.characterId === actor && m.status === "joined"));
        if (!inRoom) throw new Error("你尚未加入当前聊天的一起听");
        if (!state?.currentTrack) throw new Error("当前没有可收藏的歌曲");
        const playlist = editListeningPlaylist(session.id, id, actor, { add: songForListeningLibrary(state.currentTrack, actor) });
        return { ...summary(playlist), song: { songId: state.currentTrack.id, title: state.currentTrack.title, artist: state.currentTrack.artist } };
    }
    throw new Error("不支持的一起听歌单操作");
}
