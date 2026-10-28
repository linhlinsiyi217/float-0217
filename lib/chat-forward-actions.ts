// lib/chat-forward-actions.ts
// 角色侧的「查看可转发聊天记录 / 转发聊天记录」动作（内置能力 chat_forward，默认关闭）。
// destination=moments 时把真实记录生成长图发朋友圈，长图以角色自己为右侧。
import { loadChatContacts, loadChatMessages, loadChatSessions } from "./chat-storage";
import { loadCharacters } from "./character-storage";
import { resolveChatAccountUserIdentity } from "./chat-scope-storage";
import { getCurrentIdentityId } from "./identity-runtime";
import { canForwardTo, captureForwardedChat, forwardedValueSize, isForwardableMessage, sendForwardedChat } from "./chat-forward";
import { CHAT_FORWARD_LIST_TOOL, CHAT_FORWARD_SEND_TOOL, FORWARD_MAX_MESSAGES } from "./chat-forward-protocol";
import type { ForwardedChat, ForwardedEntry } from "./chat-forward-types";

type Context = { appId?: string; sourceEngine?: string; sessionId?: string; characterId?: string; signal?: AbortSignal };

export async function executeChatForwardAction(name: string, args: Record<string, unknown>, context: Context): Promise<Record<string, unknown>> {
    const actorId = context.characterId;
    const chatContext = (context.appId === "chat" && context.sourceEngine === "chat") || (context.appId === "group_chat" && context.sourceEngine === "group_chat");
    if (!actorId || !context.sessionId || !chatContext) throw new Error("当前场景不支持聊天记录转发");
    const identity = getCurrentIdentityId();
    const guard = () => {
        if (context.signal?.aborted || identity !== getCurrentIdentityId()) throw new Error("转发已取消或身份已切换");
    };
    guard();
    const sessions = loadChatSessions();
    const target = sessions.find(session => session.id === context.sessionId);
    if (!target || !canForwardTo(target, actorId)) throw new Error("你当前不能在这个会话发送消息");
    const characters = loadCharacters();
    const actor = characters.find(character => character.id === actorId);
    if (!actor) throw new Error("角色不可访问");
    const sources = sessions.filter(session => canForwardTo(session, actorId));
    const source = () => {
        const session = sources.find(item => item.id === args.sourceSessionId);
        if (!session) throw new Error("来源会话不存在或你未参与该会话");
        return session;
    };
    const userNameOf = (sessionId: string) => {
        const session = sessions.find(item => item.id === sessionId);
        return resolveChatAccountUserIdentity(session?.chatAccountId, session?.contactId, "chat")?.name || "用户";
    };

    if (name === CHAT_FORWARD_LIST_TOOL) {
        if (!args.sourceSessionId) {
            return {
                sessions: sources.slice(0, 80).map(session => ({
                    id: session.id,
                    name: session.isGroup ? session.groupName || "群聊" : `${userNameOf(session.id)}与你的私聊`,
                    kind: session.isGroup ? "group" : "private",
                })),
            };
        }
        const session = source();
        let messages = loadChatMessages(session.id).filter(isForwardableMessage);
        if (typeof args.beforeMessageId === "string" && args.beforeMessageId) {
            const index = messages.findIndex(message => message.id === args.beforeMessageId);
            if (index < 0) throw new Error("分页消息已不存在，请重新查看");
            messages = messages.slice(0, index);
        }
        const page = messages.slice(-20);
        const userName = userNameOf(session.id);
        return {
            sessionId: session.id,
            olderBefore: messages.length > 20 ? page[0].id : undefined,
            messages: page.map(message => ({
                id: message.id,
                speaker: message.role === "user" ? userName : characters.find(character => character.id === (message.senderCharacterId || session.contactId))?.name || "角色",
                time: message.createdAt,
                text: message.content.slice(0, 800),
                kind: message.mediaType,
            })),
        };
    }

    if (name !== CHAT_FORWARD_SEND_TOOL) throw new Error("未知聊天记录动作");
    if (args.destination !== undefined && args.destination !== "chat" && args.destination !== "moments") throw new Error("destination须为chat或moments");
    if (args.destination === "moments" && args.mode !== "history") throw new Error("朋友圈长图只支持真实聊天记录history");
    if (args.caption !== undefined && (typeof args.caption !== "string" || args.caption.length > 2000)) throw new Error("附言须为2000字以内文本");

    let record: ForwardedChat;
    if (args.mode === "history") {
        const session = source();
        if (!Array.isArray(args.messageIds) || !args.messageIds.length || args.messageIds.length > FORWARD_MAX_MESSAGES || args.messageIds.some(id => typeof id !== "string")) {
            throw new Error(`请选择1至${FORWARD_MAX_MESSAGES}条真实消息ID`);
        }
        const ids = new Set(args.messageIds as string[]);
        const eligible = new Set(loadChatMessages(session.id).filter(isForwardableMessage).map(message => message.id));
        if ([...ids].some(id => !eligible.has(id))) throw new Error("所选消息不存在、已撤回或不可转发");
        record = await captureForwardedChat(session, ids, { actorId, signal: context.signal });
        record.origin = "history";
    } else if (args.mode === "compose") {
        // 先限制模型生成内容的体积，再复制进快照
        forwardedValueSize(args, 128 * 1024);
        if (!Array.isArray(args.entries) || !args.entries.length || args.entries.length > FORWARD_MAX_MESSAGES) throw new Error(`聊天片段须包含1至${FORWARD_MAX_MESSAGES}条消息`);
        const user = resolveChatAccountUserIdentity(target.chatAccountId, target.contactId, "chat");
        const reserved = new Set([user?.name, "用户", "user", "self", "{{user}}", "你"].filter(Boolean).map(item => item!.trim().toLowerCase()));
        const now = new Date().toISOString();
        let own = false;
        const entries: ForwardedEntry[] = args.entries.map(value => {
            if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("聊天片段格式不正确");
            const { speaker, text } = value as { speaker?: unknown; text?: unknown };
            if (typeof speaker !== "string" || !speaker.trim() || speaker.length > 60 || typeof text !== "string" || !text.trim() || text.length > 2000) {
                throw new Error("说话人或消息内容无效/过长");
            }
            const speakerName = speaker.trim();
            if (reserved.has(speakerName.toLowerCase())) throw new Error("NPC片段不能代替用户编造发言");
            if (speakerName === actor.name) own = true;
            return { speaker: speakerName, speakerId: speakerName === actor.name ? actor.id : undefined, text: text.trim(), isUser: false, createdAt: now };
        });
        if (!own) throw new Error(`聊天片段须包含你自己的发言，说话人使用${actor.name}`);
        record = {
            version: 1,
            title: typeof args.title === "string" && args.title.trim() ? args.title.trim().slice(0, 80) : `${actor.name}分享的聊天记录`,
            sourceKind: new Set(entries.map(entry => entry.speaker)).size > 2 ? "group" : "private",
            origin: "character_composed",
            capturedAt: now,
            entries,
        };
    } else throw new Error("mode须为history或compose");
    guard();

    if (args.destination === "moments") {
        const { createChatScreenshot, saveChatScreenshot } = await import("./chat-screenshot");
        const { hydrateMomentsStorage, addMomentPost } = await import("./moments-storage");
        const { onCharacterChatScreenshotPost } = await import("./moments-engine");
        await hydrateMomentsStorage();
        const screenshotGuard = () => {
            guard();
            const currentSource = loadChatSessions().find(session => session.id === args.sourceSessionId);
            if (!currentSource || !canForwardTo(currentSource, actorId)) throw new Error("来源会话已变化或不再可访问");
        };
        const image = await createChatScreenshot(record, { kind: "character", characterId: actorId, name: actor.name }, screenshotGuard);
        try {
            screenshotGuard();
            const photoUrl = await saveChatScreenshot(image);
            screenshotGuard();
            const post = addMomentPost({
                authorType: "character",
                authorId: actorId,
                content: typeof args.caption === "string" ? args.caption.trim() : "",
                visibility: loadChatContacts().map(contact => contact.characterId),
                photoUrl,
                forwardedChat: record,
                chatScreenshot: { version: 1, perspective: image.perspective, width: image.width, height: image.height },
            });
            if (!post) throw new Error("这条朋友圈已发布，请勿重复发送");
            onCharacterChatScreenshotPost(post, actor);
            return { sent: true, destination: "moments", postId: post.id, entries: record.entries.length, origin: record.origin };
        } finally {
            URL.revokeObjectURL(image.previewUrl);
        }
    }
    const sent = sendForwardedChat(record, target.id, identity, actorId);
    return { sent: true, messageId: sent.id, entries: record.entries.length, origin: record.origin };
}
