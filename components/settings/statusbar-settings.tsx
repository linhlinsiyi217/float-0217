// components/settings/statusbar-settings.tsx — 状态栏自定义样式页（任务 5，对照曲曲页面结构，视觉用 Float 自己的）。
// 开关直接写主题档的 statusBarMode / islandMode（与主题页共用一份数据，不会两处打架）；
// 自定义 CSS 存 lib/statusbar-css.ts，由 desktop-shell 注入 <style>，写完即生效。
"use client";

import { useEffect, useRef, useState } from "react";
import { readThemeProfile, writeThemeProfile } from "@/lib/theme-storage";
import { loadStatusbarCss, saveStatusbarCss, STATUSBAR_CSS_MAX } from "@/lib/statusbar-css";
import { Toggle } from "@/components/ui/form";

// 全是 Float 里真实存在的类名 / 变量（没的就现做，绝不列假的）
const STATUSBAR_HOOKS: Array<{ desc: string; sel: string }> = [
    { desc: "整条状态栏", sel: ".phone-status-bar" },
    { desc: "时间", sel: ".status-time" },
    { desc: "右边那一组图标", sel: ".status-right" },
    { desc: "信号", sel: ".status-signal" },
    { desc: "WiFi", sel: ".status-wifi" },
    { desc: "电池", sel: ".status-battery" },
    { desc: "灵动岛", sel: ".status-island" },
    { desc: "放歌时点开的灵动岛", sel: ".music-dynamic-island.is-open" },
    { desc: "一起听时岛旁边的小圆", sel: ".mdi-bub" },
    { desc: "高度（变量）", sel: "--sb-h" },
    { desc: "字与图标的颜色（变量）", sel: "--sb-color" },
];

const CSS_PLACEHOLDER = ":root { --sb-color: #ff7aa2; }\n.status-time { font-size: 15px; }\n.status-wifi { display: none; }";
const SAVE_WAIT_MS = 300; // 停手这么久才落盘：逐字落盘会让写到一半的规则闪来闪去

export function StatusbarSettings({ onNotice }: { onNotice?: (msg: string) => void }) {
    const [barOn, setBarOn] = useState(true);
    const [islandOn, setIslandOn] = useState(true);
    const [css, setCss] = useState("");
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const cssRef = useRef("");
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const profile = readThemeProfile();
        setBarOn(profile.statusBarMode !== "off");
        setIslandOn(profile.islandMode !== "off");
        const saved = loadStatusbarCss();
        cssRef.current = saved;
        setCss(saved);
    }, []);

    // 卸载时把还压在计时器里的字先落盘：写完立刻返回不能丢字
    useEffect(() => () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
        saveStatusbarCss(cssRef.current);
    }, []);

    const setCssBoth = (value: string) => {
        cssRef.current = value;
        setCss(value);
    };

    const commitNow = () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
        saveStatusbarCss(cssRef.current);
    };

    const scheduleSave = () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(commitNow, SAVE_WAIT_MS);
    };

    const toggleBar = (value: boolean) => {
        writeThemeProfile({ ...readThemeProfile(), statusBarMode: value ? "on" : "off" });
        setBarOn(value);
        window.dispatchEvent(new CustomEvent("statusbar-settings-updated"));
    };

    const toggleIsland = (value: boolean) => {
        writeThemeProfile({ ...readThemeProfile(), islandMode: value ? "on" : "off" });
        setIslandOn(value);
        window.dispatchEvent(new CustomEvent("statusbar-settings-updated"));
    };

    const handleClear = () => {
        if (!cssRef.current) return;
        setCssBoth("");
        commitNow();
        onNotice?.("已清空状态栏样式");
    };

    // 点清单插一段空规则，光标停在等着填的那个位置；-- 开头的是变量，插 :root 里的一行声明
    const insertHook = (sel: string) => {
        const area = areaRef.current;
        if (!area) return;
        const current = cssRef.current;
        if (current.length >= STATUSBAR_CSS_MAX) return;
        const isVar = sel.startsWith("--");
        const start = area.selectionStart ?? current.length;
        const end = area.selectionEnd ?? start;
        const needsBreak = start > 0 && current[start - 1] !== "\n";
        const lead = (needsBreak ? "\n" : "") + (isVar ? `:root {\n  ${sel}: ` : `${sel} {\n  `);
        const tail = isVar ? ";\n}" : "\n}";
        const next = (current.slice(0, start) + lead + tail + current.slice(end)).slice(0, STATUSBAR_CSS_MAX);
        setCssBoth(next);
        scheduleSave();
        requestAnimationFrame(() => {
            const el = areaRef.current;
            if (!el) return;
            const at = Math.min(start + lead.length, next.length);
            el.focus();
            try { el.setSelectionRange(at, at); } catch { /* 部分浏览器不支持 */ }
        });
    };

    const sectionTitle = "text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em]";

    return (
        <div className="flex flex-col gap-5 pb-6">
            {/* 开关 */}
            <div className="flex flex-col gap-2">
                <p className={sectionTitle}>SWITCH</p>
                <div className="flex flex-col gap-2">
                    <div className="ui-group-card !flex-row !items-center justify-between">
                        <div className="flex flex-col gap-0.5 min-w-0 pr-3">
                            <span className="menu-label">显示状态栏</span>
                            <span className="menu-desc">顶部显示时间、信号与电量。</span>
                        </div>
                        <Toggle checked={barOn} onChange={toggleBar} className="shrink-0" />
                    </div>
                    <div
                        className="ui-group-card !flex-row !items-center justify-between"
                        style={{ opacity: barOn ? 1 : 0.5 }}
                    >
                        <div className="flex flex-col gap-0.5 min-w-0 pr-3">
                            <span className="menu-label">显示灵动岛</span>
                            <span className="menu-desc">黑色胶囊，音乐和通知都在这里活动（需要先开状态栏）。</span>
                        </div>
                        <Toggle
                            checked={islandOn}
                            disabled={!barOn}
                            onChange={toggleIsland}
                            className="shrink-0"
                        />
                    </div>
                </div>
            </div>

            {/* 自定义 CSS */}
            <div className="flex flex-col gap-2">
                <p className={sectionTitle}>CUSTOM CSS</p>
                <textarea
                    ref={areaRef}
                    className="ui-textarea font-mono ts-13 leading-relaxed"
                    style={{ minHeight: 180, resize: "vertical" }}
                    value={css}
                    maxLength={STATUSBAR_CSS_MAX}
                    spellCheck={false}
                    placeholder={CSS_PLACEHOLDER}
                    aria-label="状态栏样式"
                    onChange={event => { setCssBoth(event.target.value); scheduleSave(); }}
                />
                <div className="flex items-center justify-between">
                    <span className="ts-11 text-gray-400">{css.length} / {STATUSBAR_CSS_MAX} 字</span>
                    <button
                        type="button"
                        className="ui-link-btn"
                        data-variant="danger"
                        disabled={!css}
                        onClick={handleClear}
                    >
                        清空样式
                    </button>
                </div>
                <p className="menu-desc">写完即生效。状态栏本身是透明的，页面的背景会铺到它底下。</p>
            </div>

            {/* Selectors 清单 */}
            <div className="flex flex-col gap-2">
                <p className={sectionTitle}>SELECTORS</p>
                <div className="flex flex-col gap-1.5">
                    {STATUSBAR_HOOKS.map(hook => (
                        <button
                            key={hook.sel}
                            type="button"
                            className="ui-group-card !flex-row !items-center justify-between text-left"
                            onClick={() => insertHook(hook.sel)}
                        >
                            <span className="ts-13 text-[var(--c-text)] shrink-0">{hook.desc}</span>
                            <code className="ts-11 text-gray-400 font-mono truncate pl-3">{hook.sel}</code>
                        </button>
                    ))}
                </div>
                <p className="menu-desc">点一行，把它插进上面的输入框。</p>
            </div>
        </div>
    );
}
