"use client";

// 「发送后自动回复」：按会话开关与等待秒数（沿用 keyboard-auto-send-config 的旧键，
// 原来的开关和秒数直接继承）。普通发送后安静 N 秒就替用户点一次「触发回复」；
// 不再要求收起键盘。「发送并回复」按钮仍立即触发，不经过这里。
//
// 每条新发出的用户消息最多自动触发一次；手动回复、停止或失败后不会自动重试同一条。
// 有草稿、正在输入法组字、按住屏幕、打开面板 / 弹窗 / 菜单、页面不可见时都不算安静。
// 移植自 Y2K 1.2.0（AGPL-3.0，同源上游 fork）。

import { useEffect, useRef, type RefObject } from "react";
import { loadChatMessages, type ChatMessage } from "@/lib/chat-storage";
import { getKeyboardAutoSendDebounceMs, isKeyboardAutoSendEnabled, IDLE_REPLY_CONFIG_UPDATED } from "@/lib/keyboard-auto-send-config";

interface ChatIdleAutoReplyOptions {
    /** 当前场景是否允许自动回复（线下模式、多选、围观群传 false） */
    active: boolean;
    /** 发过消息、还没被回复 */
    pending: boolean;
    /** 正在生成（含重试版本切换） */
    generating: boolean;
    /** 面板、菜单、编辑、引用、插件改写等未完成的操作 */
    busy: boolean;
    sessionId: string;
    /** 最后一条待回复的用户消息 id；不是用户消息时为空 */
    messageId: string;
    onTrigger: () => void;
}

/** 最后一条待回复的用户消息 id。系统指令虽以 system 落库，也是用户刚发出的待回应动作。 */
export function findIdleReplyMessageId(messages: ChatMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (msg.role === "system") {
            if (msg.mediaType === "system_instruction") return msg.id;
            continue;
        }
        return msg.role === "user" ? msg.id : "";
    }
    return "";
}

function visible(element: HTMLElement | null): boolean {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        if (node.hidden || node.inert || node.getAttribute("aria-hidden") === "true") return false;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
}

export function useChatIdleAutoReply(rootRef: RefObject<HTMLElement | null>, options: ChatIdleAutoReplyOptions): void {
    const latest = useRef(options);
    latest.current = options;
    const wake = useRef<() => void>(() => {});
    const attempted = useRef("");

    useEffect(() => {
        const sessionId = options.sessionId;
        attempted.current = "";
        let timer = 0;
        let candidate = "";
        let lastActivity = Date.now();
        let wasBlocked = false;
        let composing = false;
        let windowFocused = true;
        const pointers = new Set<number>();
        let enabled = isKeyboardAutoSendEnabled(sessionId);
        let delay = getKeyboardAutoSendDebounceMs(sessionId);
        const cancel = () => { window.clearTimeout(timer); timer = 0; };
        const scope = () => rootRef.current?.closest(".phone-shell") || rootRef.current?.parentElement;
        const withinScope = (event: Event) => event.target instanceof Node && !!scope()?.contains(event.target);
        const blocked = () => {
            const root = rootRef.current;
            if (latest.current.busy || composing || pointers.size || !windowFocused || document.visibilityState !== "visible" || !visible(root)) return true;
            if (root?.querySelector<HTMLTextAreaElement>(".chat-input-textarea")?.value.trim()) return true;
            // 也覆盖挂到聊天室外面的悬浮工具、通话界面和应用弹窗
            return Array.from((scope() || document).querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [aria-modal="true"], .pv-panel, [data-chat-idle-busy]')).some(visible);
        };
        const check = () => {
            cancel();
            const cur = latest.current;
            if (cur.sessionId !== sessionId) return;
            const key = `${sessionId}:${cur.messageId}`;
            // 手动回复 / 停止 / 失败过的这一条，不再自动重试
            if (cur.generating && cur.messageId) attempted.current = key;
            if (!enabled || !cur.active || !cur.pending || cur.generating || !cur.messageId || attempted.current === key) return;
            if (candidate !== key) { candidate = key; lastActivity = Date.now(); }
            if (blocked()) {
                wasBlocked = true;
                timer = window.setTimeout(check, 250);
                return;
            }
            if (wasBlocked) { wasBlocked = false; lastActivity = Date.now(); }
            const remaining = delay - (Date.now() - lastActivity);
            if (remaining > 0) {
                timer = window.setTimeout(check, Math.min(remaining, 250));
                return;
            }
            // 触发前以存储为准再核对一次：最后一条仍是这条待回复的消息
            if (findIdleReplyMessageId(loadChatMessages(sessionId)) !== cur.messageId) return;
            attempted.current = key;
            cur.onTrigger();
        };
        const activity = () => {
            lastActivity = Date.now();
            cancel();
            // 等 React 先提交点击 / 输入的状态，再检查草稿和面板
            timer = window.setTimeout(check, 0);
        };
        const onActivity = (event: Event) => {
            if (!withinScope(event)) return;
            // 手机回到前台不一定有 focus 事件；有真实输入时视为已回到前台
            if (document.visibilityState === "visible" && ["input", "keydown", "click", "focusin"].includes(event.type)) windowFocused = true;
            activity();
        };
        const onPointerDown = (event: PointerEvent) => {
            if (!withinScope(event)) return;
            if (document.visibilityState === "visible") windowFocused = true;
            pointers.add(event.pointerId);
            activity();
        };
        const onPointerUp = (event: PointerEvent) => { if (pointers.delete(event.pointerId)) activity(); };
        const onCompositionStart = (event: Event) => { if (withinScope(event)) { composing = true; activity(); } };
        const onCompositionEnd = (event: Event) => { if (withinScope(event)) { composing = false; activity(); } };
        const onVisibility = () => { pointers.clear(); composing = false; activity(); };
        const onWindowBlur = () => { windowFocused = false; onVisibility(); };
        const onWindowFocus = () => { windowFocused = true; activity(); };
        const refreshConfig = () => {
            enabled = isKeyboardAutoSendEnabled(sessionId);
            delay = getKeyboardAutoSendDebounceMs(sessionId);
            activity();
        };
        const events = ["input", "keydown", "click", "focusin", "focusout", "wheel", "scroll"];
        events.forEach(type => document.addEventListener(type, onActivity, { capture: true, passive: true }));
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("pointerup", onPointerUp, true);
        document.addEventListener("pointercancel", onPointerUp, true);
        document.addEventListener("compositionstart", onCompositionStart, true);
        document.addEventListener("compositionend", onCompositionEnd, true);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("blur", onWindowBlur);
        window.addEventListener("focus", onWindowFocus);
        window.addEventListener(IDLE_REPLY_CONFIG_UPDATED, refreshConfig);
        wake.current = activity;
        activity();
        return () => {
            cancel();
            wake.current = () => {};
            events.forEach(type => document.removeEventListener(type, onActivity, true));
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("pointerup", onPointerUp, true);
            document.removeEventListener("pointercancel", onPointerUp, true);
            document.removeEventListener("compositionstart", onCompositionStart, true);
            document.removeEventListener("compositionend", onCompositionEnd, true);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("blur", onWindowBlur);
            window.removeEventListener("focus", onWindowFocus);
            window.removeEventListener(IDLE_REPLY_CONFIG_UPDATED, refreshConfig);
        };
    }, [rootRef, options.sessionId]);

    useEffect(() => { wake.current(); }, [options.active, options.pending, options.generating, options.busy, options.messageId]);
}
