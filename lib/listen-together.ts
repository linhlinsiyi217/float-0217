import { getMusicControlBridge } from "./music-control-bridge";
import { pushChatMessage, loadChatMessages, loadChatSessions, updateMessageMediaData, CHAT_REQUEST_REPLY_EVENT } from "./chat-storage";
import { loadCharacters } from "./character-storage";
import { addListeningTime, sampleListeningRank, takeListeningRankFacts, finishListeningHistory } from "./listening-library";
export { CHARACTER_LISTENING_INVITE_PROTOCOL } from "./music-sharing-protocol";

export type ListeningMemberStatus = "invited" | "joined" | "declined";
export type ListeningMember = { characterId: string; status: ListeningMemberStatus; joinedAt?: number; rankStarted?: boolean };

/**
 * 一起听房间。灵动岛只读 status / sessionId / characterId / startedAt / song，
 * 群聊房间里 characterId 始终指向「第一位已加入的成员」（没有就是发起人），岛不用区分私聊/群聊。
 * 群聊时 status === "joined" 表示「用户已加入且至少一位成员已加入」。
 */
export type ListeningRoom = {
    id: string;
    sessionId: string;
    characterId: string;
    status: ListeningMemberStatus;
    startedAt: number;
    initiator?: "user" | "character";
    invitationMessageId?: string;
    song?: { title?: string; artist?: string; coverUrl?: string };
    isGroup?: boolean;
    /** 群聊：用户是否在房间里（角色发起时用户先是 false，接受后 true；用户退出而角色还在时回到 false） */
    userJoined?: boolean;
    members?: ListeningMember[];
    /** 加入动效：本次加入已经播过的时间；glowEpoch 每次有人新加入 +1 */
    lastGlowAt?: number;
    glowEpoch?: number;
    glowBatchId?: string;
};

// 一起听是「当前小手机内」的一个房间；换会话不复活旧邀请，重载也不保留。
let room: ListeningRoom | null = null;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
function notifyChat(sessionId: string) {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
}
function characterName(id: string) { return loadCharacters().find(c => c.id === id)?.name || "群成员"; }

function createInvitationId(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/* ---------- 有效播放时长：只记真实在播的时间（音频位置推进 ≤ 墙钟） ---------- */

let accountingTimer: ReturnType<typeof setInterval> | undefined;
let previousSample: { roomId: string; at: number; time: number; trackId: string; playing: boolean } | null = null;

function joinedIds(current: ListeningRoom): string[] {
    return current.isGroup
        ? (current.members || []).filter(m => m.status === "joined").map(m => m.characterId)
        : current.status === "joined" ? [current.characterId] : [];
}

/** 群聊房间：characterId 跟随第一位已加入成员，灵动岛据此显示头像。 */
function withLeadMember(current: ListeningRoom): ListeningRoom {
    if (!current.isGroup) return current;
    const lead = current.members?.find(m => m.status === "joined")?.characterId;
    return lead && lead !== current.characterId ? { ...current, characterId: lead } : current;
}

export function settleListeningTime() {
    const current = room, state = getMusicControlBridge()?.getState(), now = Date.now();
    if (!current || current.status !== "joined" || current.userJoined === false || !state?.currentTrack) { previousSample = null; return; }
    const before = previousSample;
    if (before?.roomId === current.id && before.trackId === state.currentTrack.id && (before.playing || state.isPlaying)) {
        const wall = now - before.at, audio = (state.currentTime - before.time) * 1000;
        if (wall > 0 && audio > 0 && audio <= wall + 1500) addListeningTime(joinedIds(current), Math.min(wall, audio));
    }
    previousSample = { roomId: current.id, at: now, time: state.currentTime, trackId: state.currentTrack.id, playing: state.isPlaying };
}
function beginAccounting() {
    if (accountingTimer) clearInterval(accountingTimer);
    previousSample = null;
    settleListeningTime();
    accountingTimer = setInterval(() => { reconcileListeningMembers(); settleListeningTime(); }, 5000);
}
function stopAccounting() { if (accountingTimer) clearInterval(accountingTimer); accountingTimer = undefined; previousSample = null; }

function rankingEvent(current: ListeningRoom, id: string, phase: "start" | "end") {
    const member = current.members?.find(m => m.characterId === id);
    sampleListeningRank(current.isGroup ? current.id + ":" + (member?.joinedAt || current.startedAt) : current.id, current.sessionId, id, phase);
}
function startRanks() {
    if (!room || room.status !== "joined" || room.userJoined === false) return;
    const current = room;
    if (current.isGroup) {
        room = { ...current, members: current.members?.map(m => {
            if (m.status !== "joined" || m.rankStarted) return m;
            rankingEvent(current, m.characterId, "start");
            return { ...m, rankStarted: true };
        }) };
    } else rankingEvent(current, current.characterId, "start");
}
function endRoom(current: ListeningRoom) {
    settleListeningTime();
    const ids = joinedIds(current);
    for (const id of ids) if (!current.isGroup || current.members?.find(m => m.characterId === id)?.rankStarted) rankingEvent(current, id, "end");
    if (ids.length && current.userJoined !== false) finishListeningHistory(current.id, current.sessionId, ids);
    stopAccounting();
}

/** 群成员变化（被移出群 / 新进群）时同步房间成员。 */
export function reconcileListeningMembers() {
    if (!room?.isGroup) return;
    const session = loadChatSessions().find(s => s.id === room!.sessionId);
    if (!session || session.isSpectator) { endRoom(room); room = null; emit(); return; }
    const ids = session.participantIds || [];
    const removed = room.members?.filter(m => !ids.includes(m.characterId)) || [];
    const added = ids.filter(id => !room!.members?.some(m => m.characterId === id));
    if (!removed.length && !added.length) return;
    for (const m of removed) if (m.rankStarted) rankingEvent(room, m.characterId, "end");
    room = withLeadMember({ ...room, members: [...(room.members?.filter(m => !removed.includes(m)) || []), ...added.map(characterId => ({ characterId, status: "invited" as const }))] });
    emit();
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
    if (current && current.status !== "declined" && current.userJoined !== false && current.sessionId !== sessionId) {
        throw new Error("请先结束当前的一起听");
    }
    if (current) endRoom(current);
    room = { id: createInvitationId(), sessionId, characterId, status: "invited", startedAt: Date.now() };
    emit();
    return room;
}

/** 群聊一起听：用户发起时全员待回应；角色发起时发起人已加入、用户待接受。 */
export function inviteGroupListeningRoom(sessionId: string, initiatorId?: string): ListeningRoom {
    const session = loadChatSessions().find(s => s.id === sessionId);
    if (!session?.isGroup || session.isSpectator) throw new Error("当前群聊不能发起一起听");
    const ids = session.participantIds || [];
    if (!ids.length || (initiatorId && !ids.includes(initiatorId))) throw new Error("一起听发起人不在当前群聊");
    const existing = getListeningRoom();
    if (existing && existing.status !== "declined") {
        if (existing.sessionId === sessionId) return existing;
        if (existing.userJoined !== false) throw new Error("请先结束当前的一起听");
        endRoom(existing);
    }
    const now = Date.now();
    room = {
        id: createInvitationId(), sessionId, characterId: initiatorId || ids[0], isGroup: true,
        userJoined: !initiatorId, initiator: initiatorId ? "character" : "user", status: "invited", startedAt: now,
        members: ids.map(characterId => ({ characterId, status: characterId === initiatorId ? "joined" as const : "invited" as const, joinedAt: characterId === initiatorId ? now : undefined })),
    };
    emit();
    return room;
}

/** 群成员各自决定加入 / 拒绝 / 退出，只改自己的状态，不解散其他人。 */
export function respondGroupListeningMember(roomId: string, sessionId: string, characterId: string, action: "接受" | "拒绝" | "退出", batchId?: string) {
    const current = getListeningRoom(), session = loadChatSessions().find(s => s.id === sessionId);
    if (!current?.isGroup || current.id !== roomId || current.sessionId !== sessionId || !session?.participantIds?.includes(characterId)) return;
    const member = current.members?.find(m => m.characterId === characterId);
    if (!member) return;
    const status: ListeningMemberStatus = action === "接受" ? "joined" : "declined";
    if (member.status === status) return;
    settleListeningTime();
    if (member.rankStarted && status !== "joined") rankingEvent(current, characterId, "end");
    const members = current.members!.map(m => m === member ? { characterId, status, joinedAt: status === "joined" ? Date.now() : undefined } : m);
    const joined = current.userJoined !== false && members.some(m => m.status === "joined");
    const freshGlow = status === "joined" && (!batchId || current.glowBatchId !== batchId);
    room = withLeadMember({
        ...current, members, status: joined ? "joined" : "invited",
        ...(freshGlow ? { lastGlowAt: undefined, glowEpoch: (current.glowEpoch || 0) + 1, glowBatchId: batchId } : {}),
    });
    if (joined) { startRanks(); if (!accountingTimer) beginAccounting(); } else stopAccounting();
    pushChatMessage({ sessionId, role: "system", content: characterName(characterId) + (action === "接受" ? "加入了一起听。" : action === "退出" ? "退出了一起听。" : "暂未加入一起听。") });
    emit();
    notifyChat(sessionId);
}

/** 用户离开：私聊直接结束；群聊里还有成员在听时房间保留，用户之后可以重新加入。 */
export function leaveListeningRoom(sessionId: string) {
    const current = getListeningRoom();
    if (current?.sessionId !== sessionId) return;
    endRoom(current);
    room = current.isGroup && joinedIds(current).length && current.userJoined !== false
        ? { ...current, userJoined: false, status: "invited", members: current.members?.map(m => ({ ...m, rankStarted: false })) }
        : null;
    emit();
}

/** 用户主动退出一起听：清房间并写一条系统消息，让模型知道一起听已结束（灵动岛「退出」按钮用）。 */
export function exitListeningRoom(sessionId: string) {
    const current = getListeningRoom();
    if (current?.sessionId !== sessionId) return;
    leaveListeningRoom(sessionId);
    pushChatMessage({ sessionId, role: "system", content: current.status === "invited" && current.userJoined !== false ? "用户取消了一起听邀请。" : current.isGroup ? "用户退出了一起听。" : "用户结束了一起听。" });
    notifyChat(sessionId);
}

/** 群聊：用户加入已经有成员在听的房间。 */
export function joinGroupListeningAsUser(sessionId: string) {
    const current = getListeningRoom();
    if (!current?.isGroup || current.sessionId !== sessionId || current.userJoined) return;
    const session = loadChatSessions().find(s => s.id === sessionId);
    if (!session || session.isSpectator) throw new Error("当前群聊不能加入");
    const now = Date.now();
    room = withLeadMember({
        ...current, userJoined: true, status: joinedIds(current).length ? "joined" : "invited", startedAt: now,
        lastGlowAt: undefined, glowEpoch: (current.glowEpoch || 0) + 1,
        members: current.members?.map(m => m.status === "joined" ? { ...m, joinedAt: now, rankStarted: false } : m),
    });
    if (room.status === "joined") { startRanks(); beginAccounting(); }
    pushChatMessage({ sessionId, role: "system", content: "用户加入了一起听。" });
    emit();
    notifyChat(sessionId);
}

/** 加入动效每次加入只播一次（换页面回来不重播）。 */
export function recordListeningGlow(roomId: string) {
    const current = getListeningRoom();
    if (current?.id === roomId && current.status === "joined" && !current.lastGlowAt) {
        room = { ...current, lastGlowAt: Date.now() };
        emit();
    }
}
function currentTrackLine(): string {
    const snapshot = getMusicControlBridge()?.getState();
    const track = snapshot?.currentTrack ?? null;
    return track ? `当前${snapshot!.isPlaying ? "播放" : "暂停"}：${track.title} · ${track.artist}。` : "尚未播放歌曲。";
}

/** 群聊提示：房间状态 + 每位成员只给自己看的榜单小事实。 */
export function groupListeningRoomPrompt(sessionId: string, characterIds: string[]): string {
    reconcileListeningMembers();
    const session = loadChatSessions().find(s => s.id === sessionId);
    if (!session?.isGroup || session.isSpectator) return "";
    const ids = characterIds.filter(id => session.participantIds?.includes(id));
    const facts = ids.map(id => { const text = takeListeningRankFacts(id, sessionId); return text ? `[${characterName(id)}个人知晓]\n${text}` : ""; }).filter(Boolean);
    const current = getListeningRoom();
    if (current?.isGroup && current.sessionId === sessionId) {
        const states = current.members?.filter(m => ids.includes(m.characterId))
            .map(m => `${characterName(m.characterId)}:${m.status === "joined" ? "已加入" : m.status === "declined" ? "拒绝/退出" : "待回应"}`).join("、");
        facts.unshift(`群聊一起听房间ID:${current.id}；用户${current.userJoined === false ? "未加入" : "已加入"}。成员状态：${states}。${currentTrackLine()}`
            + `按意愿在自己的发言段输出[一起听:${current.id}:接受]、[一起听:${current.id}:拒绝]或[一起听:${current.id}:退出]。仅决定自己的状态；退出不解散其他人，换歌/暂停不散场。`
            + "具体歌词以歌词卡或用户输入为准，不每轮提起音乐。");
    }
    return facts.join("\n");
}

export function listeningRoomPrompt(characterId: string, sessionId?: string): string {
    const current = getListeningRoom();
    const facts = sessionId ? takeListeningRankFacts(characterId, sessionId) : "";
    if (!current || current.sessionId !== sessionId || current.status === "declined" || (!current.isGroup && current.characterId !== characterId)) return facts;
    if (current.isGroup) return [facts, groupListeningRoomPrompt(current.sessionId, [characterId])].filter(Boolean).join("\n");
    if (current.status === "invited" && current.initiator === "character") {
        return [facts, "你已向用户发出一起听邀请，正在等待用户接受或拒绝。不要代替用户接受，不重复邀请；正常继续对话。"].filter(Boolean).join("\n");
    }
    if (current.status === "invited") {
        return [facts, `用户邀请你一起听歌。按人设、关系与当前意愿接受或拒绝；先输出[一起听:${current.id}:接受]或[一起听:${current.id}:拒绝]，再自然回复。`].filter(Boolean).join("\n");
    }
    return `${facts ? facts + "\n" : ""}你正在与用户一起听歌。${currentTrackLine()}换歌、歌曲结束或暂停不结束一起听，无需重新邀请；仅任一方主动退出才结束。`
        + `具体歌词仅以用户分享的歌词卡或输入文字为准，不必每轮提及音乐。想结束时自然说明并附[一起听:${current.id}:退出]。`;
}

function createCharacterGroupInvite(sessionId: string, actorId: string, song: string | undefined, batchId?: string) {
    const existing = getListeningRoom();
    if (existing?.isGroup && existing.sessionId === sessionId) { respondGroupListeningMember(existing.id, sessionId, actorId, "接受", batchId); return; }
    if (existing && existing.status !== "declined" && existing.sessionId !== sessionId && existing.userJoined !== false) return;
    const invitation = inviteGroupListeningRoom(sessionId, actorId);
    const [title, artist] = (song || "").split("|").map(value => value.trim());
    const track = getMusicControlBridge()?.getState().currentTrack ?? null;
    const metadata = { title: title || track?.title, artist: artist || (!title || title === track?.title ? track?.artist : undefined) };
    if (invitation.invitationMessageId || invitation.initiator !== "character") return;
    const message = pushChatMessage({
        sessionId, role: "assistant", senderCharacterId: actorId, senderName: characterName(actorId),
        content: "邀请大家一起听歌。" + (metadata.title ? ` 歌曲：${metadata.title}${metadata.artist ? " · " + metadata.artist : ""}` : ""),
        mediaType: "listening_invite", mediaData: { listeningInvite: { roomId: invitation.id, initiator: "character", ...metadata } },
    });
    room = { ...invitation, invitationMessageId: message.id, song: metadata };
    emit();
    notifyChat(sessionId);
}

/** 解析回复里的一起听标记。群聊传 actorId（发言角色），每位成员只决定自己。 */
export function applyListeningRoomReply(text: string, sessionId: string, actorId?: string, batchId?: string): string {
    const cleaned = text.replace(/\[一起听邀请(?::([^\]\n]*))?\]/g, (_m, song: string | undefined) => {
        const session = loadChatSessions().find(item => item.id === sessionId);
        if (!session) return "";
        if (session.isGroup) {
            if (actorId && !session.isSpectator) {
                try { createCharacterGroupInvite(sessionId, actorId, song, batchId); } catch { /* 群聊不能发起时忽略标记 */ }
            }
            return "";
        }
        const current = getListeningRoom();
        if (current && current.status !== "declined") {
            if (current.sessionId !== sessionId) {
                pushChatMessage({ sessionId, role: "system", content: "一起听邀请未创建：请先结束另一个聊天的一起听。" });
                notifyChat(sessionId);
                return "";
            }
            if (current.status === "invited" && current.initiator === "character") return "";
        }
        const invitation = inviteListeningRoom(sessionId, session.contactId);
        const track = getMusicControlBridge()?.getState().currentTrack ?? null;
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
        // 指定了歌但当前没在放：补查封面（真实搜索结果，查不到就保持无封面）
        if (metadata.title && !metadata.coverUrl) {
            void import("./music-share-resolution").then(module => module.resolveSharedSong(metadata.title!, metadata.artist)).then(found => {
                if (!found?.coverUrl) return;
                const saved = loadChatMessages(sessionId).find(item => item.id === message.id);
                if (!saved || saved.isRetracted || saved.mediaData?.listeningInvite?.roomId !== invitation.id) return;
                updateMessageMediaData(saved.id, { ...saved.mediaData, listeningInvite: { ...saved.mediaData.listeningInvite, coverUrl: found.coverUrl } });
                if (getListeningRoom()?.id === invitation.id) { room = { ...room!, song: { ...room!.song, coverUrl: found.coverUrl } }; emit(); }
                notifyChat(sessionId);
            }).catch(() => { /* 查不到封面时邀请照常可用 */ });
        }
        emit();
        notifyChat(sessionId);
        return "";
    });
    return cleaned.replace(/\[一起听:([\w-]+):(接受|拒绝|退出)\]/g, (_m, id: string, action: string) => {
        const current = getListeningRoom();
        if (!current || current.id !== id || current.sessionId !== sessionId) return "";
        if (current.isGroup) {
            if (actorId) respondGroupListeningMember(id, sessionId, actorId, action as "接受" | "拒绝" | "退出", batchId);
            return "";
        }
        if (actorId && actorId !== current.characterId) return "";
        let notice = "";
        if (action === "退出") { endRoom(current); room = null; notice = "对方结束了一起听。"; }
        else if (current.status === "invited" && current.initiator !== "character") {
            room = { ...current, status: action === "接受" ? "joined" : "declined", startedAt: Date.now() };
            if (action === "接受") { startRanks(); beginAccounting(); }
            notice = action === "接受" ? "对方加入了一起听。" : "对方拒绝了一起听邀请。";
        }
        if (notice) {
            pushChatMessage({ sessionId, role: "system", content: notice });
            notifyChat(sessionId);
        }
        emit();
        return "";
    }).trim();
}

const resolving = new Set<string>();
export async function respondToListeningInvitation(id: string, sessionId: string, accept: boolean): Promise<void> {
    const current = getListeningRoom();
    const pending = current && current.id === id && current.sessionId === sessionId && current.initiator === "character"
        && (current.isGroup ? current.userJoined === false : current.status === "invited");
    if (!current || !pending) throw new Error("这份邀请已不在等待回应");
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
        const latest = getListeningRoom();
        if (latest?.id !== id) return;
        if (latest.isGroup) {
            room = withLeadMember({
                ...latest, userJoined: accept, status: accept && joinedIds(latest).length ? "joined" : "invited", startedAt: Date.now(),
                lastGlowAt: undefined, glowEpoch: (latest.glowEpoch || 0) + 1,
            });
            if (!accept && !joinedIds(latest).length) room = null;
        } else {
            room = { ...latest, status: accept ? "joined" : "declined", startedAt: Date.now() };
        }
        if (accept && room?.status === "joined") { startRanks(); beginAccounting(); }
        const message = loadChatMessages(sessionId).find(item => item.id === current.invitationMessageId);
        if (message?.mediaData?.listeningInvite) {
            updateMessageMediaData(message.id, { ...message.mediaData, listeningInvite: { ...message.mediaData.listeningInvite, response: accept ? "accepted" : "declined" } });
        }
        pushChatMessage({ sessionId, role: "system", content: accept ? "用户已接受一起听邀请。" : "用户暂未接受一起听邀请。" });
        emit();
        notifyChat(sessionId);
        window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId } }));
    } finally {
        resolving.delete(id);
    }
}
