// lib/island-notify.ts — 灵动岛通知状态（单条槽位，后来者顶掉前一条，约 4 秒自动收回）
// 纯客户端 store：desktop-shell 全局派发，MusicDynamicIsland 订阅渲染。
"use client";

export type IslandNotification = {
    id: string;
    /** 点击跳转的会话 id */
    sessionId: string;
    title: string;
    text: string;
    avatar: string;
    createdAt: number;
};

const AUTO_DISMISS_MS = 4200;
const NOTIFY_EVENT = "island-notify-changed";

let current: IslandNotification | null = null;
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(NOTIFY_EVENT));
}

export function subscribeIslandNotification(listener: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(NOTIFY_EVENT, listener);
    return () => window.removeEventListener(NOTIFY_EVENT, listener);
}

export function getIslandNotification(): IslandNotification | null {
    return current;
}

export function publishIslandNotification(
    notification: Pick<IslandNotification, "sessionId" | "title" | "text" | "avatar">
): void {
    current = {
        ...notification,
        id: `island_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        createdAt: Date.now()
    };
    if (autoDismissTimer) clearTimeout(autoDismissTimer);
    autoDismissTimer = setTimeout(() => {
        autoDismissTimer = null;
        current = null;
        emit();
    }, AUTO_DISMISS_MS);
    emit();
}

/** 手动收回（点击进入会话时调用）；id 不匹配时忽略，避免误关后来者 */
export function dismissIslandNotification(id?: string): void {
    if (!current) return;
    if (id && current.id !== id) return;
    if (autoDismissTimer) {
        clearTimeout(autoDismissTimer);
        autoDismissTimer = null;
    }
    current = null;
    emit();
}
