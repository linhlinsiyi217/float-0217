// lib/statusbar-css.ts — 状态栏自定义样式的存取（任务 5）。
// 只存一段用户 CSS 文本；注入由 desktop-shell 统一写到 <style> 里，
// 改动通过事件广播，设置页边写边生效、不用刷新。
"use client";

import { kvGet, kvSet } from "./kv-db";

export const STATUSBAR_CSS_KEY = "statusbar-custom-css-v1";
export const STATUSBAR_CSS_EVENT = "statusbar-css-updated";
export const STATUSBAR_CSS_MAX = 20000;

export function loadStatusbarCss(): string {
    if (typeof window === "undefined") return "";
    try {
        const raw = kvGet(STATUSBAR_CSS_KEY);
        return typeof raw === "string" ? raw.slice(0, STATUSBAR_CSS_MAX) : "";
    } catch {
        return "";
    }
}

export function saveStatusbarCss(css: string): void {
    if (typeof window === "undefined") return;
    kvSet(STATUSBAR_CSS_KEY, css.slice(0, STATUSBAR_CSS_MAX));
    window.dispatchEvent(new CustomEvent(STATUSBAR_CSS_EVENT));
}
