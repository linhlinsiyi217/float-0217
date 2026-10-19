import { getMusicControlBridge } from "./music-control-bridge";
import { pushChatMessage, loadChatMessages, loadChatSessions, updateMessageMediaData, CHAT_REQUEST_REPLY_EVENT } from "./chat-storage";

export type ListeningRoom = {
    id: string;
    sessionId: string;
    characterId: string;
    status: "invited" | "joined" | "declined";
    startedAt: number;
    initiator?: "user" | "character";
    invitationMessageId?: string;
    song?: { title?: string; artist?: string; coverUrl?: string };
};

// 一起听是「当前小手机内」的一个房间；换会话不复活旧邀请，重载也不保留。
let room: ListeningRoom | null = null;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }

function createInvitationId(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function subscribeListeningRoom(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function getListeningRoom(): ListeningRoom | null {
    return room;
}

export function inviteListeningRoom(sessionId: string, characterId: string): ListeningRoom {
    const current = getListeningRoom();
    if (current && current.status !== "declined" && current.sessionId !== sessionId) {
        throw new Error("请先结束当前的一起听");
    }
    room = { id: createInvitationId(), sessionId, characterId, status: "invited", startedAt: Date.now() };
    emit();
    return room;
}

export function leaveListeningRoom(sessionId: string) {
    if (getListeningRoom()?.sessionId !== sessionId) return;
    room = null;
    emit();
}

/** 用户主动退出一起听：清房间并写一条系统消息，让模型知道一起听已结束。 */
export function exitListeningRoom(sessionId: string) {
    if (getListeningRoom()?.sessionId !== sessionId) return;
    room = null;
    emit();
    pushChatMessage({ sessionId, role: "system", content: "用户结束了一起听。" });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
}

export function listeningRoomPrompt(characterId: string, sessionId?: string): string {
    const current = getListeningRoom();
    if (!current || current.characterId !== characterId || current.sessionId !== sessionId || current.status === "declined") return "";
    if (current.status === "invited" && current.initiator === "character") {
        return "你已向用户发出一起听邀请，正在等待用户接受或拒绝。不要代替用户接受，不重复邀请；正常继续对话。";
    }
    if (current.status === "invited") {
        return `用户邀请你一起听歌。按人设、关系与当前意愿接受或拒绝；自然回复后附[一起听:${current.id}:接受]或[一起听:${current.id}:拒绝]。`;
    }
    const track = getMusicControlBridge()?.getState().currentTrack ?? null;
    return `你正在与用户一起听歌。${track ? `当前${getMusicControlBridge()?.getState().isPlaying ? "播放" : "暂停"}：${track.title} · ${track.artist}。` : "尚未播放歌曲。"}换歌、歌曲结束或暂停不结束一起听，无需重新邀请；仅任一方主动退出才结束。想结束时自然说明并附[一起听:${current.id}:退出]。`;
}

export function applyListeningRoomReply(text: string, sessionId: string): string {
    const cleaned = text.replace(/\[一起听邀请(?::([^\]\n]*))?\]/g, (_m, song: string | undefined) => {
        const session = loadChatSessions().find(item => item.id === sessionId);
        if (!session || session.isGroup) return "";
        const current = getListeningRoom();
        if (current && current.status !== "declined") {
            if (current.sessionId !== sessionId) {
                pushChatMessage({ sessionId, role: "system", content: "一起听邀请未创建：请先结束另一个聊天的一起听。" });
                window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
                return "";
            }
            if (current.status === "invited" && current.initiator === "character") return "";
        }
        const invitation = inviteListeningRoom(sessionId, session.contactId);
        const snapshot = getMusicControlBridge()?.getState();
        const track = snapshot?.currentTrack ?? null;
        const [title, artist] = (song || "").split("|").map(value => value.trim());
        const matches = !title || (track?.title === title && (!artist || track.artist === artist));
        const metadata = { title: title || track?.title, artist: artist || (matches ? track?.artist : undefined), coverUrl: matches ? track?.coverUrl : undefined };
        const message = pushChatMessage({
            sessionId,
            role: "assistant",
            content: "邀请你一起听歌。" + (metadata.title ? ` 歌曲：${metadata.title}${metadata.artist ? " · " + metadata.artist : ""}` : ""),
            mediaType: "listening_invite",
            mediaData: { listeningInvite: { roomId: invitation.id, initiator: "character", ...metadata } },
        });
        room = { ...invitation, initiator: "character", invitationMessageId: message.id, song: metadata };
        emit();
        window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
        return "";
    });
    return cleaned.replace(/\[一起听:([\w-]+):(接受|拒绝|退出)\]/g, (_m, id: string, action: string) => {
        const current = getListeningRoom();
        if (!current || current.id !== id || current.sessionId !== sessionId) return "";
        let notice = "";
        if (action === "退出") { room = null; notice = "对方结束了一起听。"; }
        else if (current.status === "invited" && current.initiator !== "character") {
            room = { ...current, status: action === "接受" ? "joined" : "declined", startedAt: Date.now() };
            notice = action === "接受" ? "对方加入了一起听。" : "对方拒绝了一起听邀请。";
        }
        if (notice) {
            pushChatMessage({ sessionId, role: "system", content: notice });
            window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
        }
        emit();
        return "";
    }).trim();
}

export const CHARACTER_LISTENING_INVITE_PROTOCOL = "可因自己的兴趣或当前话题，自然用[音乐分享:准确歌名|歌手]分享歌曲，无需等待用户索要；音乐相关动作均为可选，不按轮次触发。判断用户在索要歌曲还是邀你共同聆听，再按人设与意愿决定。决定发起时，必须在本轮输出独立一行[一起听邀请:歌名|歌手]；未指定歌曲用[一起听邀请]。不要为同次邀请重复发音乐分享卡。用户未接受前不能宣称已共同聆听，也不能用接受标记替用户同意；已有待回应邀请不重复发。不愿意时自然拒绝，无需标记。";

const resolving = new Set<string>();
export async function respondToListeningInvitation(id: string, sessionId: string, accept: boolean): Promise<void> {
    const current = getListeningRoom();
    if (!current || current.id !== id || current.sessionId !== sessionId || current.status !== "invited" || current.initiator !== "character") {
        throw new Error("这份邀请已不在等待回应");
    }
    if (resolving.has(id)) return;
    resolving.add(id);
    try {
        if (accept && current.song?.title) {
            const bridge = getMusicControlBridge();
            if (!bridge) throw new Error("音乐播放器尚未准备好，请重试");
            const state = bridge.getState();
            if (state.currentTrack?.title === current.song.title && (!current.song.artist || state.currentTrack.artist === current.song.artist)) {
                bridge.resume();
            } else {
                const result = await bridge.playByQuery(current.song.title, current.song.artist);
                if (!result.ok) throw new Error(result.message || "歌曲暂时无法播放，请重试");
            }
        }
        if (getListeningRoom()?.id !== id) return;
        room = { ...current, status: accept ? "joined" : "declined", startedAt: Date.now() };
        const message = loadChatMessages(sessionId).find(item => item.id === current.invitationMessageId);
        if (message?.mediaData?.listeningInvite) {
            updateMessageMediaData(message.id, { ...message.mediaData, listeningInvite: { ...message.mediaData.listeningInvite, response: accept ? "accepted" : "declined" } });
        }
        pushChatMessage({ sessionId, role: "system", content: accept ? "用户已接受一起听邀请。" : "用户暂未接受一起听邀请。" });
        emit();
        window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
        window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId } }));
    } finally {
        resolving.delete(id);
    }
}
