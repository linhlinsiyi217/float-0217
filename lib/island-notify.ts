// lib/island-notify.ts — 聊天消息进灵动岛的便捷入口（旧接口保留）
// 实际状态由 lib/island-center.ts 统一管理：多条消息进队列，同一会话合并计数。
"use client";

import { pushIslandEvent } from "./island-center";

export function publishIslandNotification(notification: {
    sessionId: string;
    title: string;
    text: string;
    avatar: string;
}): void {
    pushIslandEvent({
        kind: "message",
        source: notification.title,
        text: notification.text,
        avatar: notification.avatar || undefined,
        target: { appId: "chat", sessionId: notification.sessionId },
        mergeKey: `message:${notification.sessionId}`,
    });
}
