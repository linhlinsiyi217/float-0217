// lib/chat-forward-appearance.ts
// 转发时从当前聊天室 DOM 采样原气泡外观（只取白名单内的视觉属性，不复制任意样式或 HTML）。
import type { CSSProperties } from "react";
import type { ForwardedAppearance, ForwardedChat } from "./chat-forward-types";

const properties = {
    "--bubble-text-ink": "--bubble-text-ink",
    "--voice-ink": "--voice-ink",
    "--bubble-surface-color": "--bubble-surface-color",
    "--bubble-surface-opacity": "--bubble-surface-opacity",
    "--im26-base-blue": "--im26-base-blue",
    "--im26-base-incoming": "--im26-base-incoming",
    background: "background",
    color: "color",
    borderRadius: "border-radius",
    border: "border",
    boxShadow: "box-shadow",
    backdropFilter: "backdrop-filter",
    WebkitBackdropFilter: "-webkit-backdrop-filter",
    padding: "padding",
    fontSize: "font-size",
    lineHeight: "line-height",
    fontWeight: "font-weight",
    letterSpacing: "letter-spacing",
    WebkitMaskBoxImage: "-webkit-mask-box-image",
    maskBorder: "mask-border",
} as const;

/** 只有白名单视觉属性能穿过快照边界。 */
export function forwardedStyle(value?: Record<string, string>): CSSProperties {
    const out: Record<string, string> = {};
    for (const key of Object.keys(properties)) {
        const item = value?.[key];
        // url() 只允许同站相对路径（打包内的气泡蒙版），挡掉外链与 data/javascript 协议
        if (typeof item !== "string" || item.length > 4096) continue;
        if (/url\(\s*(?!["']?\/(?!\/))/i.test(item)) continue;
        out[key] = item;
    }
    return out as CSSProperties;
}

function wrapperOf(messageId: string): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return document.getElementById("message-" + messageId);
}

export function captureForwardedStickerUrl(messageId: string): string | undefined {
    return wrapperOf(messageId)?.querySelector<HTMLImageElement>(".chat-sticker img")?.src || undefined;
}

export function captureForwardedDisplayText(messageId: string): string | undefined {
    const bubble = wrapperOf(messageId)?.querySelector<HTMLElement>("[data-msg-id]");
    const text = bubble?.innerText?.trim();
    return text || undefined;
}

export function captureForwardedAppearance(messageId: string): ForwardedAppearance | undefined {
    if (typeof document === "undefined") return undefined;
    const wrapper = wrapperOf(messageId);
    const bubble = wrapper?.querySelector<HTMLElement>("[data-msg-id]");
    if (!bubble || !bubble.getClientRects().length) return undefined;
    const read = (element: Element) => {
        const computed = getComputedStyle(element);
        const out: Record<string, string> = {};
        for (const [key, css] of Object.entries(properties)) {
            let value = computed.getPropertyValue(css).trim();
            // 打包的气泡蒙版改成站点相对路径，换部署域名也能用
            if (key === "WebkitMaskBoxImage" || key === "maskBorder") {
                value = value.replace(/url\(["']?[^)"']*[/]([^/"')]+\.svg(?:\?[^"')]+)?)["']?\)/g, 'url("/$1")');
            }
            if (value && value.length <= 4096) out[key] = value;
        }
        return out;
    };
    const surface = bubble.querySelector(":scope > .imessage-bubble-surface");
    const voice = bubble.querySelector(".voice-msg-bubble");
    // FLOT 的语音转写气泡是消息行的兄弟节点，不在 message-<id> 里面
    const row = wrapper?.parentElement;
    return {
        bubble: read(bubble),
        ...(surface ? { surface: read(surface) } : {}),
        ...(voice ? { voiceInk: getComputedStyle(voice).color } : {}),
        voiceTextVisible: !!row?.querySelector(".voice-msg-text-bubble"),
    };
}

export function captureForwardedTheme(messageId: string): ForwardedChat["theme"] {
    if (typeof document === "undefined") return undefined;
    const room = wrapperOf(messageId)?.closest<HTMLElement>(".chat-room-wrapper");
    if (!room) return undefined;
    const sample = (role: "user" | "bot") => {
        const bubble = room.querySelector(`[data-ui="bubble-${role}"][data-msg-id]`);
        const id = bubble?.closest(".chat-msg-wrapper")?.id.replace(/^message-/, "");
        return id ? captureForwardedAppearance(id) : undefined;
    };
    const computed = getComputedStyle(room);
    return {
        preset: room.dataset.beautyPreset === "glass" ? "glass" : room.dataset.beautyPreset === "classic" ? "classic" : undefined,
        dark: room.hasAttribute("data-chat-dark"),
        width: Math.min(480, Math.max(280, room.clientWidth || 390)),
        ink: computed.getPropertyValue("--im26-ink").trim() || "#050505",
        background: computed.getPropertyValue("--im26-page").trim() || "#ffffff",
        self: sample("user"),
        other: sample("bot"),
    };
}
