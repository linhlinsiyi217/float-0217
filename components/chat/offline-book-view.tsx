"use client";

// 书页式线下正文。它不是聊天：没有气泡、没有已读、没有连发分组，
// 正文是一段一段的长文，我写一段、对方写一段，读起来像一本书。
//
// 本页一张弹窗都没有：段落的四件事（复制 / 删除 / 收藏 / 编辑）全在段首那一行的
// 图标上就地做完，编辑是页面里原地展开一个框；不可逆的那两件（删段 / 删记录）
// 不弹确认，原地按两次——第一次点变色并说一句，几秒内再点一次才真做，过期自己复原。
// 整场的四件事（继续约会 / 重写 / 时光回溯 / 结束约会）在底栏那颗键升起的菜单里，
// 归 OfflineTextInputBar 管，不在这个组件。
//
// 候选切换（开场白 / 重写共用）：候选列表与当前下标都在 chat-room 的内存 state 里，
// 这里只画箭头、计数器与横扫手势，切到哪条由回调写回——不新建段落、不触发 AI。

import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, PenLine, Star, Trash2, X } from "lucide-react";

import type { ChatOfflineArchive, ChatOfflineOpener, ChatOfflineTurn } from "@/lib/chat-offline-storage";
import { escapeOfflineHtml, offlineCopyPlain, renderOfflineRich, stripOfflineControlTags } from "@/lib/offline-rich";
import { isStandaloneHtmlPreviewContent } from "./message-bubble";
import { formatChatUiTime } from "@/lib/chat-time";

const ARM_MS = 3000; // 「再点一次」的有效期，过了自己复原
const SWIPE_MIN = 40; // 手指横扫超过这个像素数才算一次划

export type OfflineSegmentRole = "user" | "assistant";

export type OfflineBookCandidate = {
    turnId: string;
    items: string[];
    index: number;
    /** 等待 AI 落地的那一格：正文先转圈圈，不把旧字留在那儿唬人 */
    pending?: boolean;
};

export type OfflineBookViewProps = {
    turns: ChatOfflineTurn[];
    characterName: string;
    userLabel: string;
    isGenerating: boolean;
    streamContent: string;
    pendingUserText: string;
    /** 候选（开场白 / 重写共用），为空表示当前没有哪一段能划 */
    candidate: OfflineBookCandidate | null;
    onCandidateShift: (turnId: string, dir: -1 | 1) => void;
    /** 保存编辑：role=user 收 userContent，role=assistant 收 XML 原文（与旧编辑行为一致） */
    onEditSave: (turnId: string, role: OfflineSegmentRole, text: string) => void;
    /** 编辑框里初始显示的那份：user 段是 userContent，assistant 段是 XML 原文 */
    getEditText: (turnId: string, role: OfflineSegmentRole) => string;
    /** 删除一段：组件内完成两段式确认后才回调（删的是这一段所属的整轮） */
    onDeleteSegment: (turnId: string, role: OfflineSegmentRole) => void;
    onToggleFav: (turnId: string, role: OfflineSegmentRole) => void;
    onCopySegment: (text: string, role: OfflineSegmentRole) => string;
    /** 空态采用一条开场白：成为第一段 */
    onAdoptOpener: (text: string) => void;
    openers: ChatOfflineOpener[];
    archives: ChatOfflineArchive[];
    onDeleteArchive: (archiveId: string) => void;
    htmlCardEnabled: boolean;
    customCSS?: string;
    hasMore?: boolean;
    onLoadMore?: () => void;
};

const EDIT_TIP = "对话使用“对话”，动作使用**动作**，内心独白使用 > 独白";
const EMPTY_TIP = "正文还空着，从底下那条写第一段";

function timeBadge(iso: string): string {
    try {
        return formatChatUiTime(iso);
    } catch {
        return "";
    }
}

/** 一段的正文显示文本：assistant 段落存的是剥过 XML 的正文，旧数据兼容直接用 */
function segmentText(turn: ChatOfflineTurn, role: OfflineSegmentRole): string {
    const raw = role === "user" ? turn.userContent : turn.assistantContent;
    return stripOfflineControlTags(raw).trim();
}

type ParagraphProps = {
    who: string;
    at: string;
    isMe: boolean;
    text: string;
    editing: boolean;
    fav: boolean;
    armed: boolean;
    swipable: boolean;
    candidate?: OfflineBookCandidate;
    htmlCardEnabled: boolean;
    onEditStart: () => void;
    onEditCancel: () => void;
    onEditSave: (text: string) => void;
    onCopy: () => void;
    onDelete: () => void;
    onToggleFav: () => void;
    onCandidateShift: (dir: -1 | 1) => void;
};

/** 删除 / 取消编辑的「再点一次」提示，说在图标变色与 title 上 */
const ARM_HINT: Record<string, string> = {
    drop: "再次点击删除",
    cancel: "再次点击放弃修改",
};

const OfflineBookParagraph = memo(function OfflineBookParagraph({
    who, at, isMe, text, editing, fav, armed, swipable, candidate, htmlCardEnabled,
    onEditStart, onEditCancel, onEditSave, onCopy, onDelete, onToggleFav, onCandidateShift,
}: ParagraphProps) {
    const [draft, setDraft] = useState(text);
    const [editArmed, setEditArmed] = useState(false);
    const editArmTimer = useRef(0);
    const [dropArmed, setDropArmed] = useState(false);
    const dropArmTimer = useRef(0);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const swipeRef = useRef({ x: 0, y: 0, tracking: false });

    useEffect(() => {
        if (editing) {
            setDraft(text);
            requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (!el) return;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 320) + "px";
                el.focus();
            });
        }
    }, [editing, text]);

    useEffect(() => () => {
        window.clearTimeout(editArmTimer.current);
        window.clearTimeout(dropArmTimer.current);
    }, []);

    // 删除的第一下：变色 + 提示，3 秒内再点才真删，过期自己复原
    const handleDelete = () => {
        if (dropArmTimer.current) {
            window.clearTimeout(dropArmTimer.current);
            dropArmTimer.current = 0;
        }
        if (!dropArmed) {
            setDropArmed(true);
            dropArmTimer.current = window.setTimeout(() => setDropArmed(false), ARM_MS);
            return;
        }
        setDropArmed(false);
        onDelete();
    };

    const handleEditCancel = () => {
        if (draft.trim() !== text.trim() && !editArmed) {
            // 改过字才要这一下：白看一眼直接退，不打扰
            setEditArmed(true);
            window.clearTimeout(editArmTimer.current);
            editArmTimer.current = window.setTimeout(() => setEditArmed(false), ARM_MS);
            return;
        }
        setEditArmed(false);
        onEditCancel();
    };

    // 横扫换候选：点箭头与手指横扫是两条独立的路，共用同一个步进
    const shift = (dir: -1 | 1) => onCandidateShift(dir);
    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        swipeRef.current = { x: t?.clientX ?? 0, y: t?.clientY ?? 0, tracking: true };
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        const s = swipeRef.current;
        if (!s.tracking) return;
        swipeRef.current.tracking = false;
        const t = e.changedTouches[0];
        const dx = (t?.clientX ?? 0) - s.x;
        const dy = (t?.clientY ?? 0) - s.y;
        if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
        shift(dx < 0 ? 1 : -1); // 往左划 = 下一版
    };

    const editingArmedTitle = ARM_HINT.cancel;
    // 整段就是一个前端卡片（整页 HTML）：默认关；开了才放进无 allow-same-origin 的沙箱
    const isHtmlCard = !editing && htmlCardEnabled && isStandaloneHtmlPreviewContent(text);

    const acts = editing ? (
        <>
            <button type="button" className={`cof-act${editArmed ? " is-armed" : ""}`} title={editingArmedTitle} aria-label={editingArmedTitle} onClick={handleEditCancel}><X size={15} strokeWidth={1.8} /></button>
            <button type="button" className="cof-act" title="复制这一段" aria-label="复制这一段" onClick={onCopy}><Copy size={15} strokeWidth={1.8} /></button>
            <button type="button" className={`cof-act${dropArmed ? " is-armed" : ""}`} title={dropArmed ? "再次点击删除" : "删除这一段"} aria-label={dropArmed ? "再次点击删除" : "删除这一段"} onClick={handleDelete}><Trash2 size={15} strokeWidth={1.8} /></button>
            <button type="button" className={`cof-act${fav ? " is-on" : ""}`} title={fav ? "取消收藏" : "收藏这一段"} aria-label={fav ? "取消收藏" : "收藏这一段"} onClick={onToggleFav}><Star size={15} strokeWidth={1.8} /></button>
            <button type="button" className="cof-act is-on" title="保存这一段" aria-label="保存这一段" onClick={() => onEditSave(draft)}><Check size={15} strokeWidth={2} /></button>
        </>
    ) : (
        <>
            <button type="button" className={`cof-act${fav ? " is-on" : ""}`} title={fav ? "取消收藏" : "收藏这一段"} aria-label={fav ? "取消收藏" : "收藏这一段"} onClick={onToggleFav}><Star size={15} strokeWidth={1.8} /></button>
            <button type="button" className="cof-act" title="编辑这一段" aria-label="编辑这一段" onClick={onEditStart}><PenLine size={15} strokeWidth={1.8} /></button>
        </>
    );

    const body = editing ? (
        <div className="cof-editbox">
            <textarea
                ref={textareaRef}
                className="cof-edit-input"
                aria-label="这一段的正文"
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                    const el = e.target;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 320) + "px";
                }}
            />
            <div className="cof-edit-tip">{EDIT_TIP}</div>
        </div>
    ) : isHtmlCard ? (
        <iframe
            title="前端卡片"
            className="cof-html-card"
            sandbox=""
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${text}</body></html>`}
        />
    ) : (
        <div className="cof-text" dangerouslySetInnerHTML={{ __html: renderOfflineRich(text) }} />
    );

    return (
        <div className={`cof-p is-${isMe ? "me" : "ta"}${editing ? " is-edit" : ""}`}>
            <div className="cof-p-head">
                <span className="cof-p-who">{who}</span>
                <span className="cof-p-time">{at}</span>
                <div className="cof-p-acts">{acts}</div>
            </div>
            {body}
            {swipable && candidate ? (
                <div
                    className="cof-sw"
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                >
                    <button type="button" className="cof-sw-btn" aria-label="上一版" onClick={() => shift(-1)}><ChevronLeft size={14} strokeWidth={2} /></button>
                    <span className="cof-sw-count">{candidate.pending ? "…" : `${candidate.index + 1}/${candidate.items.length}`}</span>
                    <button type="button" className="cof-sw-btn" aria-label="下一版" onClick={() => shift(1)}><ChevronRight size={14} strokeWidth={2} /></button>
                </div>
            ) : null}
        </div>
    );
});

export function OfflineBookView(props: OfflineBookViewProps) {
    const {
        turns, characterName, userLabel, isGenerating, streamContent, pendingUserText,
        candidate, onCandidateShift, onEditSave, getEditText, onDeleteSegment, onToggleFav, onCopySegment,
        onAdoptOpener, openers, archives, onDeleteArchive, htmlCardEnabled, customCSS,
        hasMore, onLoadMore,
    } = props;

    const [editing, setEditing] = useState<{ turnId: string; role: OfflineSegmentRole } | null>(null);
    const [openArchiveId, setOpenArchiveId] = useState("");

    const lastTurn = turns.length ? turns[turns.length - 1] : null;
    const lastTurnId = lastTurn?.id ?? "";
    // 能划的那一段：候选挂在最后一个 assistant 段上（开场白 / 重写共用）
    const swipableTurnId = candidate?.turnId ?? "";

    const paragraphs = useMemo(() => {
        const out: Array<{
            key: string; turnId: string; role: OfflineSegmentRole; who: string; at: string;
            isMe: boolean; text: string; fav: boolean;
        }> = [];
        for (const turn of turns) {
            const userText = segmentText(turn, "user");
            if (userText) {
                out.push({
                    key: `${turn.id}_user`, turnId: turn.id, role: "user", who: userLabel,
                    at: timeBadge(turn.createdAt), isMe: true, text: userText,
                    fav: turn.faved?.user === true,
                });
            }
            const assistantText = segmentText(turn, "assistant");
            if (assistantText) {
                out.push({
                    key: `${turn.id}_assistant`, turnId: turn.id, role: "assistant", who: characterName,
                    at: timeBadge(turn.createdAt), isMe: false, text: assistantText,
                    fav: turn.faved?.assistant === true,
                });
            }
        }
        return out;
    }, [turns, characterName, userLabel]);

    const isEmpty = paragraphs.length === 0 && !pendingUserText && !isGenerating;

    return (
        <div className="cof-page-body" data-offline-page="1">
            {customCSS?.trim() ? (
                // 作用域：所有选择器都套在 [data-offline-page] 下面，别处看不见
                <style dangerouslySetInnerHTML={{
                    __html: customCSS
                        .replace(/\/\*[\s\S]*?\*\//g, "")
                        .split("}")
                        .map(part => {
                            const idx = part.indexOf("{");
                            if (idx < 0) return "";
                            const selectors = part.slice(0, idx).split(",").map(s => s.trim()).filter(Boolean);
                            if (!selectors.length) return "";
                            const body = part.slice(idx + 1).trim();
                            return selectors.map(sel => sel.startsWith("@") || sel.includes("[data-offline-page") ? sel : `[data-offline-page] ${sel}`).join(",") + "{" + body + "}";
                        })
                        .filter(Boolean)
                        .join("\n"),
                }} />
            ) : null}

            {isEmpty ? (
                <div className="cof-empty">
                    <div className="cof-empty-tip">{EMPTY_TIP}</div>
                    {openers.length ? (
                        <div className="cof-openers">
                            <div className="cof-openers-title">选择开场白</div>
                            {openers.map(opener => (
                                <button
                                    key={opener.id}
                                    type="button"
                                    className="cof-opener"
                                    onClick={() => onAdoptOpener(opener.text)}
                                >
                                    {opener.text.length > 120 ? `${opener.text.slice(0, 120)}…` : opener.text}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {hasMore ? (
                <button type="button" className="cof-more" onClick={onLoadMore}>查看更多段落</button>
            ) : null}

            {paragraphs.map(seg => {
                const editingHere = editing?.turnId === seg.turnId && editing.role === seg.role;
                return (
                    <OfflineBookParagraph
                        key={seg.key}
                        who={seg.who}
                        at={seg.at}
                        isMe={seg.isMe}
                        text={editingHere ? getEditText(seg.turnId, seg.role) : seg.text}
                        editing={editingHere}
                        fav={seg.fav}
                        armed={false}
                        swipable={seg.turnId === swipableTurnId && seg.role === "assistant"}
                        candidate={seg.turnId === swipableTurnId && seg.role === "assistant" ? candidate ?? undefined : undefined}
                        htmlCardEnabled={htmlCardEnabled}
                        onEditStart={() => {
                            setEditing({ turnId: seg.turnId, role: seg.role });
                        }}
                        onEditCancel={() => setEditing(null)}
                        onEditSave={(text) => {
                            if (!text.trim()) return;
                            onEditSave(seg.turnId, seg.role, text);
                            setEditing(null);
                        }}
                        onCopy={() => {
                            const copyText = onCopySegment(seg.text, seg.role);
                            void navigator.clipboard?.writeText(copyText).catch(() => {});
                        }}
                        onDelete={() => onDeleteSegment(seg.turnId, seg.role)}
                        onToggleFav={() => onToggleFav(seg.turnId, seg.role)}
                        onCandidateShift={(dir) => onCandidateShift(seg.turnId, dir)}
                    />
                );
            })}

            {pendingUserText ? (
                <div className="cof-p is-me">
                    <div className="cof-p-head"><span className="cof-p-who">{userLabel}</span></div>
                    <div className="cof-text">{pendingUserText}</div>
                </div>
            ) : null}

            {isGenerating ? (
                <div className="cof-typing" aria-live="polite">
                    <span className="cof-typing-who">{characterName}</span>
                    <span className="cof-typing-dots" aria-label="正在写"><i /><i /><i /></span>
                </div>
            ) : null}
            {isGenerating && streamContent ? (
                <div className="cof-p is-ta">
                    <div className="cof-p-head"><span className="cof-p-who">{characterName}</span></div>
                    <div className="cof-text" dangerouslySetInnerHTML={{ __html: renderOfflineRich(streamContent) }} />
                </div>
            ) : null}

            {archives.length ? (
                <div className="cof-logs">
                    <div className="cof-logs-title">过去的约会</div>
                    {archives.map(archive => (
                        <Fragment key={archive.id}>
                            <div className="cof-log">
                                <button
                                    type="button"
                                    className="cof-log-head"
                                    onClick={() => setOpenArchiveId(openArchiveId === archive.id ? "" : archive.id)}
                                >
                                    <span>{timeBadge(archive.startedAt)} 开始 · {archive.turnCount} 轮</span>
                                    <span className="cof-log-toggle">{openArchiveId === archive.id ? "收起" : "展开"}</span>
                                </button>
                                {openArchiveId === archive.id ? (
                                    <div className="cof-log-body">
                                        {archive.turns.map(turn => (
                                            <Fragment key={turn.id}>
                                                {segmentText(turn, "user") ? (
                                                    <div className="cof-log-seg is-me" dangerouslySetInnerHTML={{ __html: renderOfflineRich(segmentText(turn, "user")) }} />
                                                ) : null}
                                                {segmentText(turn, "assistant") ? (
                                                    <div className="cof-log-seg" dangerouslySetInnerHTML={{ __html: renderOfflineRich(segmentText(turn, "assistant")) }} />
                                                ) : null}
                                            </Fragment>
                                        ))}
                                        <ArchiveDeleteButton onDelete={() => onDeleteArchive(archive.id)} />
                                    </div>
                                ) : null}
                            </div>
                        </Fragment>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** 记录的删除也要两段式：第一次点变色说一句，几秒内再点才真删 */
function ArchiveDeleteButton({ onDelete }: { onDelete: () => void }) {
    const [armed, setArmed] = useState(false);
    const timer = useRef(0);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    return (
        <button
            type="button"
            className={`cof-log-drop${armed ? " is-armed" : ""}`}
            onClick={() => {
                if (timer.current) {
                    window.clearTimeout(timer.current);
                    timer.current = 0;
                }
                if (!armed) {
                    setArmed(true);
                    timer.current = window.setTimeout(() => setArmed(false), ARM_MS);
                    return;
                }
                setArmed(false);
                onDelete();
            }}
        >
            {armed ? "再次点击删除这条记录" : "删除这条记录"}
        </button>
    );
}

/** 复制用的纯文本：编辑进 XML 原文，复制走译文跟着走的那份 */
export function offlineCopyText(text: string): string {
    return offlineCopyPlain(text);
}

// 保留 escapeOfflineHtml 的引用，防止未来直接拼 HTML 的调用方漏掉转义
void escapeOfflineHtml;
