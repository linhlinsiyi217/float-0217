"use client";
// 聊天记录合并转发：消息卡片、只读详情页、转发目标半屏、聊天长图发朋友圈。
// 行为参考 Y2K 1.2.0（同源 AGPL-3.0 fork），界面按 FLOT 的 iMessage 玻璃样式（styles/chat-forward.css）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Aperture, Check, ChevronLeft, ChevronRight, Download, Send, X, ZoomIn, ZoomOut } from "lucide-react";
import { forwardedEntrySummary, type ForwardedChat } from "@/lib/chat-forward-types";
import { canForwardTo, captureForwardedChat, sendForwardedChat } from "@/lib/chat-forward";
import { createChatScreenshot, saveChatScreenshot, type ChatScreenshot } from "@/lib/chat-screenshot";
import { loadChatContacts, loadChatSessions, resolveChatCharacterAvatar, type ChatSession } from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import { characterMatchesChatScope, loadChatScope, resolveChatScopeUserIdentity } from "@/lib/chat-scope-storage";
import { getCurrentIdentityId } from "@/lib/identity-runtime";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { ForwardedNativeTranscript } from "./forwarded-native-transcript";

/** 浮层挂到所在聊天室（继承聊天外观变量）；不在聊天室里（如朋友圈）时挂到手机屏。 */
function useOverlayHost(anchor: React.RefObject<HTMLElement | null>) {
    const [host, setHost] = useState<Element | null>(null);
    useLayoutEffect(() => {
        setHost(anchor.current?.closest(".chat-room-wrapper") || document.querySelector('[data-ui="phone-screen"]') || document.body);
    }, [anchor]);
    return host;
}

function useDialogFocus(panel: React.RefObject<HTMLElement | null>, active: boolean) {
    useEffect(() => {
        if (!active) return;
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.querySelector<HTMLElement>("button,[tabindex='0']")?.focus();
        return () => previous?.focus?.();
    }, [active, panel]);
}

function trapTab(event: React.KeyboardEvent, panel: HTMLElement | null) {
    if (event.key !== "Tab" || !panel) return;
    const nodes = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,a[href],[tabindex="0"]')]
        .filter(node => !node.closest("[inert]") && node.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

/** 全屏只读详情：顶栏走 --page-header-safe-top，内容用原气泡重绘。 */
function ForwardedTranscriptPage({ record, onClose }: { record: ForwardedChat; onClose: () => void }) {
    const anchor = useRef<HTMLSpanElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const host = useOverlayHost(anchor);
    const [image, setImage] = useState<string | null>(null);
    const [dark, setDark] = useState(false);
    useLayoutEffect(() => {
        // 深浅色跟随所在聊天室的「聊天外观」，不在聊天室里时沿用转发时的外观
        const room = anchor.current?.closest<HTMLElement>(".chat-room-wrapper");
        setDark(room ? room.hasAttribute("data-chat-dark") : record.theme?.dark === true);
    }, [record.theme?.dark]);
    useDialogFocus(panel, !!host);
    return <>
        <span ref={anchor} hidden />
        {host && createPortal(
            <div ref={panel} className="chat-forward-page" role="dialog" aria-modal="true" aria-label={record.title}
                data-chat-dark={dark || undefined}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
                onKeyDown={event => {
                    if (event.key === "Escape") { event.stopPropagation(); if (image) setImage(null); else onClose(); }
                    trapTab(event, panel.current);
                }}>
                <header className="chat-forward-page-header">
                    <button type="button" className="chat-forward-icon-btn" aria-label="返回" onClick={onClose}><ChevronLeft size={24} strokeWidth={1.8} /></button>
                    <strong>{record.title}</strong>
                    <span aria-hidden="true" className="chat-forward-icon-spacer" />
                </header>
                <ForwardedNativeTranscript record={record} dark={dark} onImage={setImage} />
                {image && (
                    <div className="chat-forward-lightbox">
                        <button type="button" className="chat-forward-icon-btn" aria-label="关闭图片" onClick={() => setImage(null)}><X size={20} /></button>
                        <img decoding="async" src={image} alt="转发的图片" />
                    </div>
                )}
            </div>,
            host,
        )}
    </>;
}

export function ForwardedChatCard({ record }: { record: ForwardedChat }) {
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" className="chat-forward-card" onClick={event => { event.stopPropagation(); setOpen(true); }}>
            <strong>{record.title}</strong>
            {record.entries.slice(0, 3).map((entry, index) => (
                <span key={index}>{entry.speaker}：{forwardedEntrySummary(entry)}</span>
            ))}
            <footer>聊天记录 · {record.entries.length}条<ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" /></footer>
        </button>
        {open && <ForwardedTranscriptPage record={record} onClose={() => setOpen(false)} />}
    </>;
}

/** 朋友圈里的聊天长图：缩略显示顶部一截，点开全屏查看、放大、保存。 */
export function ChatScreenshotImage({ url, filename = "chat-screenshot.png" }: { url: string; filename?: string }) {
    const [open, setOpen] = useState(false);
    const [zoom, setZoom] = useState(false);
    const [saving, setSaving] = useState(false);
    const panel = useRef<HTMLDivElement>(null);
    useDialogFocus(panel, open);
    return <>
        <button type="button" className="chat-forward-shot-thumb" aria-label="查看聊天长图" onClick={() => { setZoom(false); setOpen(true); }}>
            <img src={url} alt="聊天长图" />
        </button>
        {open && createPortal(
            <div ref={panel} className="chat-forward-shot-viewer" role="dialog" aria-modal="true" aria-label="聊天长图"
                onKeyDown={event => {
                    if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
                    trapTab(event, panel.current);
                }}>
                <header>
                    <button type="button" className="chat-forward-icon-btn" aria-label="关闭聊天长图" onClick={() => setOpen(false)}><X size={20} /></button>
                    <span>聊天长图</span>
                    <button type="button" className="chat-forward-icon-btn" aria-label={zoom ? "适应屏幕" : "放大"} onClick={() => setZoom(value => !value)}>{zoom ? <ZoomOut size={20} /> : <ZoomIn size={20} />}</button>
                    <button type="button" className="chat-forward-icon-btn" disabled={saving} aria-busy={saving || undefined} aria-label="保存聊天长图" onClick={async () => {
                        setSaving(true);
                        try { const { downloadUrl } = await import("@/lib/download-utils"); await downloadUrl(url, filename); }
                        finally { setSaving(false); }
                    }}><Download size={20} /></button>
                </header>
                <div className="chat-forward-shot-scroll" tabIndex={0}>
                    <img src={url} alt="聊天长图大图" style={{ width: zoom ? "200%" : "100%", maxWidth: zoom ? "none" : 780 }} />
                </div>
            </div>,
            document.body,
        )}
    </>;
}

type MomentDraft = { record: ForwardedChat; image: ChatScreenshot };

/** 多选后的「转发」半屏：选目标对话发卡片，或生成聊天长图发朋友圈（用户视角，自己在右侧）。 */
export function ForwardChatSheet({ source, selectedIds, onClose, onSent }: {
    source: ChatSession;
    selectedIds: Set<string>;
    onClose: () => void;
    onSent: (toast: string) => void;
}) {
    const anchor = useRef<HTMLSpanElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const host = useOverlayHost(anchor);
    const identity = useRef(getCurrentIdentityId());
    const lock = useRef(false);
    const live = useRef(true);
    const [query, setQuery] = useState("");
    const [target, setTarget] = useState("");
    const [busy, setBusy] = useState<"" | "send" | "shot" | "publish">("");
    const [error, setError] = useState("");
    const [draft, setDraft] = useState<MomentDraft | null>(null);
    const [caption, setCaption] = useState("");
    const [audience, setAudience] = useState<"friends" | "self">("friends");
    useDialogFocus(panel, !!host);
    useEffect(() => () => { live.current = false; }, []);
    useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.image.previewUrl); }, [draft]);

    const chars = useMemo(() => loadCharacters(), []);
    const sessions = useMemo(() => loadChatSessions().filter(s => s.id !== source.id && canForwardTo(s)), [source.id]);
    const nameOf = (s: ChatSession) => s.isGroup ? s.groupName || "群聊" : s.alias || chars.find(c => c.id === s.contactId)?.name || "对话";
    const avatarOf = (s: ChatSession) => s.isGroup ? "" : resolveChatCharacterAvatar(chars.find(c => c.id === s.contactId));
    const visible = sessions.filter(s => nameOf(s).toLowerCase().includes(query.trim().toLowerCase()));
    const targetName = sessions.find(s => s.id === target);
    const assertIdentity = () => { if (getCurrentIdentityId() !== identity.current) throw new Error("身份已切换，请重新选择。"); };

    const run = async (kind: "send" | "shot" | "publish", task: () => Promise<void>) => {
        if (lock.current) return;
        lock.current = true; setBusy(kind); setError("");
        try { await task(); }
        catch (e) { if (live.current) setError(e instanceof Error ? e.message : "操作失败，请重试"); }
        finally { lock.current = false; if (live.current) setBusy(""); }
    };

    const send = () => run("send", async () => {
        if (!target) return;
        assertIdentity();
        const record = await captureForwardedChat(source, selectedIds);
        sendForwardedChat(record, target, identity.current);
        onSent(`已转发给${targetName ? nameOf(targetName) : "对方"}`);
    });

    const prepareMoment = () => run("shot", async () => {
        assertIdentity();
        const record = await captureForwardedChat(source, selectedIds);
        const image = await createChatScreenshot(record, { kind: "user" }, assertIdentity);
        if (!live.current) { URL.revokeObjectURL(image.previewUrl); return; }
        setDraft({ record, image });
    });

    const publish = () => run("publish", async () => {
        if (!draft) return;
        assertIdentity();
        const [{ hydrateMomentsStorage, addMomentPost }, { onUserPost }] = await Promise.all([import("@/lib/moments-storage"), import("@/lib/moments-engine")]);
        await hydrateMomentsStorage();
        const photoUrl = await saveChatScreenshot(draft.image);
        assertIdentity();
        const scope = loadChatScope();
        const visibility = audience === "self" ? [] : loadChatContacts().map(c => c.characterId).filter(id => characterMatchesChatScope(id, scope));
        const post = addMomentPost({
            authorType: "user",
            authorId: "user",
            userIdentityId: scope.userIdentityId || resolveChatScopeUserIdentity()?.id,
            chatAccountId: scope.chatAccountId || undefined,
            content: caption.trim(),
            photoUrl,
            visibility,
            forwardedChat: structuredClone(draft.record),
            chatScreenshot: { version: 1, perspective: draft.image.perspective, width: draft.image.width, height: draft.image.height },
        });
        if (!post) throw new Error("发布未成功，请重试");
        window.dispatchEvent(new CustomEvent("moments-updated"));
        try { onUserPost(post); } catch (e) { console.warn("[ChatForward] onUserPost failed:", e); }
        onSent("已发到朋友圈");
    });

    const close = () => { if (!busy) onClose(); };
    const sheet = (
        <div className="chat-forward-overlay" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }}>
            <div ref={panel} className="chat-forward-sheet" role="dialog" aria-modal="true" aria-label={draft ? "发到朋友圈" : "转发聊天记录"}
                onKeyDown={event => {
                    if (event.key === "Escape") { event.stopPropagation(); if (draft && !busy) setDraft(null); else close(); }
                    trapTab(event, panel.current);
                }}>
                <header className="chat-forward-sheet-header">
                    {draft
                        ? <button type="button" className="chat-forward-icon-btn" aria-label="返回" disabled={!!busy} onClick={() => setDraft(null)}><ChevronLeft size={22} strokeWidth={1.8} /></button>
                        : <span aria-hidden="true" className="chat-forward-icon-spacer" />}
                    <strong>{draft ? "发到朋友圈" : `转发 ${selectedIds.size} 条记录`}</strong>
                    <button type="button" className="chat-forward-icon-btn" aria-label="关闭" disabled={!!busy} onClick={close}><X size={20} strokeWidth={1.8} /></button>
                </header>
                {draft ? <>
                    <div className="chat-forward-shot-preview"><img src={draft.image.previewUrl} alt="聊天长图预览" /></div>
                    <textarea className="chat-forward-caption" aria-label="附言" placeholder="说点什么（可选）…" maxLength={2000} value={caption} onChange={event => setCaption(event.target.value)} />
                    <div className="chat-forward-audience" role="radiogroup" aria-label="谁可以看">
                        <span>谁可以看</span>
                        <button type="button" role="radio" aria-checked={audience === "friends"} onClick={() => setAudience("friends")}>好友可见</button>
                        <button type="button" role="radio" aria-checked={audience === "self"} onClick={() => setAudience("self")}>仅自己</button>
                    </div>
                    {error && <p className="chat-forward-error" role="alert">{error}</p>}
                    <button type="button" className="chat-forward-primary" disabled={!!busy} aria-busy={busy === "publish" || undefined} onClick={() => void publish()}>
                        <Aperture size={17} strokeWidth={1.8} aria-hidden="true" />{busy === "publish" ? "正在发布…" : "发布"}
                    </button>
                </> : <>
                    <button type="button" className="chat-forward-row chat-forward-moments-row" disabled={!!busy} aria-busy={busy === "shot" || undefined} onClick={() => void prepareMoment()}>
                        <span className="chat-forward-row-icon" aria-hidden="true"><Aperture size={18} strokeWidth={1.8} /></span>
                        <span className="chat-forward-row-text">{busy === "shot" ? "正在生成聊天长图…" : "发到朋友圈"}<small>生成聊天长图，你在右侧</small></span>
                        <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    <input className="chat-forward-search" type="search" aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={event => setQuery(event.target.value)} />
                    <div className="chat-forward-targets">
                        {visible.map(s => {
                            const avatar = avatarOf(s);
                            return (
                                <button key={s.id} type="button" className="chat-forward-row" aria-pressed={target === s.id} onClick={() => setTarget(s.id)}>
                                    <span className="chat-forward-avatar" aria-hidden="true">{avatar ? <img src={avatar} alt="" /> : s.isGroup ? nameOf(s).slice(0, 1) : <ChatFallbackAvatar />}</span>
                                    <span className="chat-forward-row-text">{nameOf(s)}<small>{s.isGroup ? "群聊" : "私聊"}</small></span>
                                    <span className="chat-forward-check" aria-hidden="true">{target === s.id && <Check size={14} strokeWidth={2.5} />}</span>
                                </button>
                            );
                        })}
                        {!visible.length && <p className="chat-forward-empty">{sessions.length ? "没有匹配的对话" : "暂无可发送的对话"}</p>}
                    </div>
                    {error && <p className="chat-forward-error" role="alert">{error}</p>}
                    <button type="button" className="chat-forward-primary" disabled={!target || !!busy} aria-busy={busy === "send" || undefined} onClick={() => void send()}>
                        <Send size={16} strokeWidth={1.8} aria-hidden="true" />
                        {busy === "send" ? "正在转发…" : targetName ? `发送给${nameOf(targetName)}` : "选择对话"}
                    </button>
                </>}
            </div>
        </div>
    );
    return <><span ref={anchor} hidden />{host && createPortal(sheet, host)}</>;
}

