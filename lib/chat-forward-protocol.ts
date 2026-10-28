// lib/chat-forward-protocol.ts
// 「聊天记录转发」内置能力的动作名、参数结构与用法说明（无依赖，供能力注册与执行共用）。
export const FORWARD_MAX_MESSAGES = 50;

export const CHAT_FORWARD_LIST_TOOL = "查看可转发聊天记录";
export const CHAT_FORWARD_SEND_TOOL = "转发聊天记录";
export const CHAT_FORWARD_TOOL_NAMES = new Set([CHAT_FORWARD_LIST_TOOL, CHAT_FORWARD_SEND_TOOL]);

export const CHAT_FORWARD_USAGE_GUIDE = [
    "聊天记录转发是可选表达方式，按性格与话题自行决定，不必每轮使用。",
    `真实记录：先用「${CHAT_FORWARD_LIST_TOOL}」取得会话及消息ID，再用「${CHAT_FORWARD_SEND_TOOL}」mode=history 选择记录；不能编造ID，也不能读取自己未参与的会话。`,
    "也可用 mode=compose 呈现自己与NPC的聊天片段：entries 只填 speaker 和 text，至少包含你自己的发言，不代替用户编造发言。",
    "默认发到当前对话；history 可设 destination=moments，把真实记录做成聊天长图发朋友圈，caption 为可选附言。长图自动以你为右侧，原话和说话人不变，不要自行改写或颠倒消息。compose 不能发朋友圈长图。",
    "只说「转发了」不会产生卡片，必须实际调用动作。",
    `示例：[执行动作:${CHAT_FORWARD_SEND_TOOL}({"mode":"history","sourceSessionId":"<会话ID>","messageIds":["<消息ID>"]})]`,
].join("\n");

export const CHAT_FORWARD_LIST_SCHEMA = JSON.stringify({
    type: "object",
    properties: {
        sourceSessionId: { type: "string", description: "不传时列出你参与且可访问的会话；传入后读取最近20条可转发消息" },
        beforeMessageId: { type: "string", description: "读取这条消息之前的一页" },
    },
    additionalProperties: false,
});

export const CHAT_FORWARD_SEND_SCHEMA = JSON.stringify({
    type: "object",
    properties: {
        mode: { type: "string", enum: ["history", "compose"] },
        destination: { type: "string", enum: ["chat", "moments"] },
        caption: { type: "string", maxLength: 2000 },
        sourceSessionId: { type: "string" },
        messageIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: FORWARD_MAX_MESSAGES },
        title: { type: "string", maxLength: 80 },
        entries: {
            type: "array", minItems: 1, maxItems: FORWARD_MAX_MESSAGES,
            items: {
                type: "object",
                properties: { speaker: { type: "string", maxLength: 60 }, text: { type: "string", maxLength: 2000 } },
                required: ["speaker", "text"],
                additionalProperties: false,
            },
        },
    },
    required: ["mode"],
    additionalProperties: false,
});
