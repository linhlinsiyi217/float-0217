// lib/notification-prefs.ts — 系统通知 / 站内横幅的设置存取（任务 4）。
// 一份 kv 存所有开关；提示音清单同文件管理（曲曲的做法：横幅与系统通知共用一份配置）。
"use client";

import { kvGet, kvSet } from "./kv-db";

export type NotificationPrefs = {
    /** SWITCH：系统通知总开关（浏览器 Notification API / 安卓壳原生通道） */
    systemEnabled: boolean;
    /** BANNER：站内横幅（未在对话页面时弹出） */
    bannerEnabled: boolean;
    /** BANNER：横幅弹出时播放提示音 */
    soundEnabled: boolean;
    /** BANNER：同一角色连发多条合并成一条横幅 */
    mergeBanners: boolean;
    /** DISPLAY：前台通知（页面可见时也发系统通知；横幅开着时前台让给横幅） */
    foregroundEnabled: boolean;
    /** DISPLAY：消息预览（关掉后通知与横幅只显示"收到一条新消息"） */
    previewEnabled: boolean;
    /** SOURCE：固定通知标题（空 = 用角色名） */
    fixedTitle: string;
    /** SOUND：当前选中的提示音 id（空 = 内置默认音） */
    activeSoundId: string;
};

const PREFS_KEY = "notification-prefs-v1";
const SOUND_LIST_KEY = "notification-sound-list-v1";

export const NOTIFICATION_PREFS_EVENT = "notification-prefs-changed";

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
    systemEnabled: false,
    bannerEnabled: true,
    soundEnabled: true,
    mergeBanners: false,
    foregroundEnabled: false,
    previewEnabled: true,
    fixedTitle: "",
    activeSoundId: "",
};

export function loadNotificationPrefs(): NotificationPrefs {
    if (typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFS };
    try {
        const raw = kvGet(PREFS_KEY);
        if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
        const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
        return {
            ...DEFAULT_NOTIFICATION_PREFS,
            ...parsed,
            fixedTitle: typeof parsed.fixedTitle === "string" ? parsed.fixedTitle : "",
        };
    } catch {
        return { ...DEFAULT_NOTIFICATION_PREFS };
    }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
    if (typeof window === "undefined") return;
    kvSet(PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent(NOTIFICATION_PREFS_EVENT));
}

// ── 提示音清单 ──────────────────────────────────────────────
// 内置一个默认音（代码合成，见 lib/banner-sound.ts）；用户导入的每条：
//   kind "file" → data 存 dataURL（导入时限 1MB，见设置页校验）
//   kind "url"  → 只记地址，播放时现取，失效退回默认音
export type ImportedSound = {
    id: string;
    name: string;
    kind: "file" | "url";
    /** kind=file 时的 dataURL */
    data?: string;
    /** kind=url 时的地址 */
    url?: string;
    /** 导入方式（"文件" / "链接"） */
    importLabel: string;
};

const SOUND_NAME_MAX = 24;
export const SOUND_LIST_MAX = 6;

export function loadSoundList(): ImportedSound[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = kvGet(SOUND_LIST_KEY);
        const parsed = raw ? (JSON.parse(raw) as ImportedSound[]) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(item => item && typeof item.id === "string" && typeof item.name === "string")
            .map(item => ({
                id: item.id,
                name: item.name.slice(0, SOUND_NAME_MAX) || "自定义提示音",
                kind: item.kind === "url" ? "url" : "file",
                data: item.kind === "file" ? item.data : undefined,
                url: item.kind === "url" ? item.url : undefined,
                importLabel: item.kind === "url" ? "链接" : "文件",
            }));
    } catch {
        return [];
    }
}

export function saveSoundList(list: ImportedSound[]): void {
    if (typeof window === "undefined") return;
    kvSet(SOUND_LIST_KEY, JSON.stringify(list));
}
