"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, Music, Plus, Trash2, Upload, Link2, Volume2 } from "lucide-react";

import {
    loadNotificationPrefs,
    saveNotificationPrefs,
    loadSoundList,
    saveSoundList,
    SOUND_LIST_MAX,
    type NotificationPrefs,
    type ImportedSound,
} from "@/lib/notification-prefs";
import { armAudioUnlock, auditionSound, unlockAudio, resetBannerSoundCache } from "@/lib/banner-sound";
import { isShellEnvironment } from "@/lib/shell-detect";
import { sendShellNotification } from "@/lib/shell-notify";
import { Toggle } from "@/components/ui/form";

// 系统通知设置页（第三轮任务 4）。所有开关即时落盘。
// 分组照任务书：SWITCH / BANNER / SOUND / DISPLAY / SOURCE / TEST。
const SECTION_TITLE = "text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em]";

const STATUS_SYSTEM_ON = "通知已开启。系统推送角色信息，点击直接进入角色对话。";
const STATUS_BANNER_ON = "横幅已开启。未在对话页面弹出消息横幅，点击进入对话。";

// 提示音文件上限：超过提示（任务书：≤ 1MB）
const SOUND_FILE_MAX = 1024 * 1024;

export function NotificationSettings({ onNotice }: { onNotice?: (msg: string) => void }) {
    const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
        typeof window === "undefined"
            ? {
                systemEnabled: false, bannerEnabled: true, soundEnabled: true, mergeBanners: false,
                foregroundEnabled: false, previewEnabled: true, fixedTitle: "", activeSoundId: "",
            }
            : loadNotificationPrefs()
    );
    const [sounds, setSounds] = useState<ImportedSound[]>(() => (typeof window === "undefined" ? [] : loadSoundList()));
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [testBusy, setTestBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setPrefs(loadNotificationPrefs());
        setSounds(loadSoundList());
        // 开着提示音：挂手势闩等第一次点击解锁音频（iOS）
        if (loadNotificationPrefs().soundEnabled) armAudioUnlock();
    }, []);

    const patch = (updates: Partial<NotificationPrefs>) => {
        const next = { ...prefs, ...updates };
        setPrefs(next);
        saveNotificationPrefs(next);
        if (updates.activeSoundId !== undefined) resetBannerSoundCache();
    };

    // ── 系统通知开关：网页端要先拿权限 ──
    const handleSystemToggle = async (value: boolean) => {
        if (!value) {
            patch({ systemEnabled: false });
            return;
        }
        if (isShellEnvironment()) {
            // 壳里走原生通道，没有浏览器权限概念
            patch({ systemEnabled: true });
            return;
        }
        if (typeof Notification === "undefined") {
            onNotice?.("这个环境不支持系统通知，只有站内横幅可用");
            return;
        }
        if (Notification.permission === "granted") {
            patch({ systemEnabled: true });
            return;
        }
        if (Notification.permission === "denied") {
            onNotice?.("通知权限已被拒绝，请到浏览器设置里放开");
            return;
        }
        const granted = (await Notification.requestPermission()) === "granted";
        if (granted) {
            patch({ systemEnabled: true });
        } else {
            onNotice?.("没有拿到通知权限，开关没有打开");
        }
    };

    // ── 导入提示音：文件 ──
    const pickSoundFile = async (file: File) => {
        if (file.size > SOUND_FILE_MAX) {
            onNotice?.("这个音频超过 1MB，装不下（可以换成更短的音频或用链接）");
            return;
        }
        try {
            const raw = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const item: ImportedSound = {
                id: `snd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: file.name.replace(/\.[^.]+$/, "").slice(0, 24) || "自定义提示音",
                kind: "file",
                data: raw,
                importLabel: "文件",
            };
            appendSound(item);
        } catch {
            onNotice?.("音频读取失败，换一个试试");
        }
    };

    const appendSound = (item: ImportedSound) => {
        const list = [...loadSoundList(), item];
        if (list.length > SOUND_LIST_MAX) {
            onNotice?.(`提示音最多存 ${SOUND_LIST_MAX} 个，先删一个再导`);
            return;
        }
        saveSoundList(list);
        setSounds(list);
        onNotice?.(`已导入「${item.name}」，点它试听`);
    };

    const importFromLink = () => {
        const url = linkUrl.trim();
        if (!/^https?:\/\/\S+$/i.test(url)) {
            onNotice?.("链接要以 http:// 或 https:// 开头");
            return;
        }
        let name = "链接提示音";
        try {
            const path = new URL(url).pathname.split("/").filter(Boolean).pop();
            if (path) name = decodeURIComponent(path).replace(/\.[^.]+$/, "").slice(0, 24);
        } catch { /* 用默认名 */ }
        appendSound({
            id: `snd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            kind: "url",
            url,
            importLabel: "链接",
        });
        setLinkUrl("");
        setLinkOpen(false);
    };

    const removeSound = (id: string) => {
        const list = loadSoundList().filter(item => item.id !== id);
        saveSoundList(list);
        setSounds(list);
        if (prefs.activeSoundId === id) patch({ activeSoundId: "" });
    };

    const selectSound = (id: string) => {
        auditionSound(id); // 内部会保存选中并试听
        setPrefs(loadNotificationPrefs());
    };

    // ── 预览横幅：走真实横幅管道（desktop-shell 对 isTest+demo 放行） ──
    const previewBanner = () => {
        if (prefs.soundEnabled) unlockAudio();
        import("@/lib/chat-notification-events").then(({ dispatchChatMessageNotice }) => {
            dispatchChatMessageNotice({
                sessionId: "demo",
                body: "这是一条预览横幅，点一下就能进入对话",
                senderName: prefs.fixedTitle.trim() || "预览",
                avatar: null,
                isTest: true,
            });
        });
    };

    // ── 测试通知：两条，间隔 5 秒（点完切到后台接收） ──
    const sendTestOnce = (text: string) => {
        const who = prefs.fixedTitle.trim() || "Float";
        if (isShellEnvironment()) {
            sendShellNotification(who, text, null, "");
            return;
        }
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
                const notification = new Notification(who, { body: text, icon: "/icon-192.png" });
                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };
            } catch { /* 老安卓 Chrome 走不了构造器，忽略 */ }
            return;
        }
        // 没有通知权限：退回站内横幅演示
        import("@/lib/chat-notification-events").then(({ dispatchChatMessageNotice }) => {
            dispatchChatMessageNotice({
                sessionId: "demo",
                body: text,
                senderName: who,
                avatar: null,
                isTest: true,
            });
        });
    };

    const runTest = () => {
        if (testBusy) return;
        setTestBusy(true);
        sendTestOnce("消息测试中，切到后台等下一条");
        window.setTimeout(() => {
            sendTestOnce("淡淡的，慢慢的，顺顺的…");
            setTestBusy(false);
        }, 5000);
        onNotice?.("测试消息已发出，5 秒后还有一条");
    };

    return (
        <div className="flex flex-col gap-5 pb-6">
            {/* SWITCH */}
            <div className="flex flex-col gap-2">
                <p className={SECTION_TITLE}>Switch</p>
                <div className="ui-group-card !flex-row !items-center justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5 pr-3">
                        <span className="menu-label flex items-center gap-1.5"><Bell size={14} /> 系统通知</span>
                        <span className="menu-desc">接收系统推送的角色信息。</span>
                    </div>
                    <Toggle checked={prefs.systemEnabled} onChange={(value) => void handleSystemToggle(value)} className="shrink-0" />
                </div>
                {prefs.systemEnabled && <p className="menu-desc px-1">{STATUS_SYSTEM_ON}</p>}
            </div>

            {/* BANNER */}
            <div className="flex flex-col gap-2">
                <p className={SECTION_TITLE}>Banner</p>
                <div className="flex flex-col gap-2">
                    <div className="ui-group-card !flex-row !items-center justify-between">
                        <div className="flex min-w-0 flex-col gap-0.5 pr-3">
                            <span className="menu-label">站内横幅</span>
                            <span className="menu-desc">未在对话页面时弹出消息横幅。</span>
                        </div>
                        <Toggle checked={prefs.bannerEnabled} onChange={(value) => patch({ bannerEnabled: value })} className="shrink-0" />
                    </div>
                    <div className="ui-group-card !flex-row !items-center justify-between" style={{ opacity: prefs.bannerEnabled ? 1 : 0.5 }}>
                        <div className="flex min-w-0 flex-col gap-0.5 pr-3">
                            <span className="menu-label">提示音</span>
                            <span className="menu-desc">横幅弹出时播放提示音。</span>
                        </div>
                        <Toggle
                            checked={prefs.bannerEnabled && prefs.soundEnabled}
                            disabled={!prefs.bannerEnabled}
                            onChange={(value) => {
                                patch({ soundEnabled: value });
                                if (value) armAudioUnlock();
                            }}
                            className="shrink-0"
                        />
                    </div>
                    <div className="ui-group-card !flex-row !items-center justify-between">
                        <div className="flex min-w-0 flex-col gap-0.5 pr-3">
                            <span className="menu-label">合并显示</span>
                            <span className="menu-desc">同一角色连发多条消息合并成一条横幅。</span>
                        </div>
                        <Toggle checked={prefs.mergeBanners} onChange={(value) => patch({ mergeBanners: value })} className="shrink-0" />
                    </div>
                </div>
                {prefs.bannerEnabled && <p className="menu-desc px-1">{STATUS_BANNER_ON}</p>}
                <button type="button" onClick={previewBanner} className="glass-btn is-primary mt-1 h-11" style={{ width: "auto", alignSelf: "flex-start", padding: "0 20px" }}>
                    <span className="inline-flex items-center gap-1.5"><Volume2 size={15} /> 预览横幅</span>
                </button>
            </div>

            {/* SOUND */}
            <div className="flex flex-col gap-2">
                <p className={SECTION_TITLE}>Sound</p>
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => selectSound("")}
                        className="ui-group-card !flex-row !items-center justify-between text-left"
                    >
                        <div className="flex min-w-0 flex-col gap-0.5 pr-3">
                            <span className="menu-label flex items-center gap-1.5"><Music size={14} /> 默认提示音</span>
                            <span className="menu-desc">内置音色，当前选中带勾。</span>
                        </div>
                        {prefs.activeSoundId === "" && <Check size={16} className="shrink-0 text-[var(--c-success,#34c759)]" />}
                    </button>

                    {sounds.map(item => (
                        <div key={item.id} className="ui-group-card !flex-row !items-center justify-between">
                            <button type="button" onClick={() => selectSound(item.id)} className="flex min-w-0 flex-1 flex-col gap-0.5 pr-3 text-left">
                                <span className="menu-label truncate">{item.name}</span>
                                <span className="menu-desc">导入方式：{item.importLabel}{item.kind === "url" ? "（链接失效自动退回默认）" : ""}</span>
                            </button>
                            {prefs.activeSoundId === item.id && <Check size={16} className="shrink-0 text-[var(--c-success,#34c759)]" />}
                            <button
                                type="button"
                                onClick={() => removeSound(item.id)}
                                className="ui-link-btn ml-2 shrink-0"
                                data-variant="danger"
                                aria-label={`删除 ${item.name}`}
                            >
                                <Trash2 size={17} />
                            </button>
                        </div>
                    ))}

                    {linkOpen ? (
                        <div className="ui-group-card flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Link2 size={15} className="shrink-0 text-[var(--c-icon)]" />
                                <input
                                    type="url"
                                    value={linkUrl}
                                    onChange={(event) => setLinkUrl(event.target.value)}
                                    placeholder="https://... 音频地址"
                                    className="ui-input flex-1"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={importFromLink} className="ui-btn ui-btn-primary h-9 flex-1 rounded-[18px] text-xs">导入</button>
                                <button type="button" onClick={() => { setLinkOpen(false); setLinkUrl(""); }} className="ui-btn h-9 flex-1 rounded-[18px] border border-black/10 bg-white text-xs text-gray-600">取消</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="ui-btn ui-btn-outline h-10 flex-1 rounded-[20px] text-xs"
                            >
                                <span className="inline-flex items-center gap-1.5"><Upload size={14} /> 导入提示音</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setLinkOpen(true)}
                                className="ui-btn h-10 flex-1 rounded-[20px] border border-black/10 bg-white text-xs text-gray-700"
                            >
                                <span className="inline-flex items-center gap-1.5"><Plus size={14} /> 从链接导入</span>
                            </button>
                        </div>
                    )}
                    <input
                        ref={fileRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void pickSoundFile(file);
                        }}
                    />
                </div>
                <p className="menu-desc px-1">点击切换并且试听。链接导入只记地址，链接失效退回默认。</p>
            </div>

            {/* DISPLAY */}
            <div className="flex flex-col gap-2">
                <p className={SECTION_TITLE}>Display</p>
                <div className="flex flex-col gap-2">
                    <div className="ui-group-card !flex-row !items-center justify-between">
                        <div className="flex min-w-0 flex-col gap-0.5 pr-3">
                            <span className="menu-label">前台通知</span>
                            <span className="menu-desc">使用本站时推送系统通知（横幅开着时前台让给横幅）。</span>
                        </div>
                        <Toggle checked={prefs.foregroundEnabled} onChange={(value) => patch({ foregroundEnabled: value })} className="shrink-0" />
                    </div>
                    <div className="ui-group-card !flex-row !items-center justify-between">
                        <div className="flex min-w-0 flex-col gap-0.5 pr-3">
                            <span className="menu-label">消息预览</span>
                            <span className="menu-desc">通知与横幅显示消息内容，关掉只显示"收到一条新消息"。</span>
                        </div>
                        <Toggle checked={prefs.previewEnabled} onChange={(value) => patch({ previewEnabled: value })} className="shrink-0" />
                    </div>
                </div>
            </div>

            {/* SOURCE */}
            <div className="flex flex-col gap-2">
                <p className={SECTION_TITLE}>Source</p>
                <div className="ui-group-card flex flex-col gap-1.5">
                    <span className="menu-label">固定通知标题</span>
                    <input
                        type="text"
                        value={prefs.fixedTitle}
                        maxLength={12}
                        onChange={(event) => patch({ fixedTitle: event.target.value })}
                        placeholder="填写固定通知标题，例如：微信"
                        className="ui-input"
                    />
                    <span className="menu-desc">留空显示角色名；最长 12 个字。</span>
                </div>
            </div>

            {/* TEST */}
            <div className="flex flex-col gap-2">
                <p className={SECTION_TITLE}>Test</p>
                <button
                    type="button"
                    onClick={runTest}
                    disabled={testBusy}
                    className="glass-btn h-11"
                    style={{ width: "auto", alignSelf: "flex-start", padding: "0 20px" }}
                >
                    <span className="inline-flex items-center gap-1.5"><Bell size={15} /> {testBusy ? "测试中…" : "测试通知"}</span>
                </button>
                <p className="menu-desc px-1">测试消息一共两条，间隔 5 秒；点击测试切至后台接收。</p>
            </div>
        </div>
    );
}
