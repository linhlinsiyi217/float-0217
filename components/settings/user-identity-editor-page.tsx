"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, Camera, Link, User } from "lucide-react";
import { Input } from "@/components/ui/form";
import { fileToDataUrl, type UserIdentity } from "./user-identity-editor-sheet";

/**
 * 整页「编辑资料」编辑器（任务 3）。
 *
 * 为什么是 fixed 覆盖层而不是设置子页：设置页的 PageShell 自带标题栏，
 * 而这里需要自己的三段式头部（圆形返回钮 / 居中标题 / 小字说明）和底部
 * 固定按钮区，做成覆盖层才能整页滑入滑出，不被设置页的滚动容器裁切。
 *
 * 数据流：进来时把 identity 复制成草稿，点「保存资料」才回传给父级落库；
 * 有未保存修改时点返回，页面内出现一行「放弃修改？」提示（不弹系统弹窗）。
 */
export function UserIdentityEditorPage({
    identity,
    isNew,
    onSave,
    onDelete,
    onClose,
}: {
    identity: UserIdentity;
    isNew: boolean;
    onSave: (draft: UserIdentity) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState<UserIdentity>(() => ({ ...identity }));
    const [closing, setClosing] = useState(false);
    const [askDiscard, setAskDiscard] = useState(false);
    const [deleteArmed, setDeleteArmed] = useState(false);
    const deleteTimer = useRef<number | null>(null);

    const dirty = useMemo(
        () => JSON.stringify(draft) !== JSON.stringify(identity),
        [draft, identity],
    );

    const startClose = () => {
        setClosing(true);
        window.setTimeout(onClose, 290);
    };

    const handleBack = () => {
        if (dirty) {
            setAskDiscard(true);
            return;
        }
        startClose();
    };

    const update = (updates: Partial<UserIdentity>) => {
        setDraft(current => ({ ...current, ...updates }));
        // 用户继续输入即视为选择「继续编辑」，收起放弃提示
        setAskDiscard(false);
    };

    const handleSave = () => {
        onSave(draft);
        startClose();
    };

    const disarmDelete = () => {
        setDeleteArmed(false);
        if (deleteTimer.current) {
            window.clearTimeout(deleteTimer.current);
            deleteTimer.current = null;
        }
    };

    const handleDelete = () => {
        if (!deleteArmed) {
            setDeleteArmed(true);
            if (deleteTimer.current) window.clearTimeout(deleteTimer.current);
            deleteTimer.current = window.setTimeout(disarmDelete, 3000);
            return;
        }
        disarmDelete();
        onDelete(draft.id);
    };

    const focusScroll = (event: React.FocusEvent<HTMLElement>) => {
        // 键盘弹出时把输入框滚到视口中部，避免被遮挡
        event.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const pickAvatar = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                update({ avatarUrl: await fileToDataUrl(file) });
            } catch { /* 保留原头像 */ }
        };
        input.click();
    };

    return (
        <div className={`identity-editor-page${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="编辑资料">
            <header className="identity-editor-header">
                <button type="button" onClick={handleBack} className="identity-editor-back" aria-label="返回">
                    <ChevronLeft size={20} strokeWidth={2} />
                </button>
                <div className="identity-editor-titles">
                    <span className="identity-editor-title">{isNew ? "新增身份" : "编辑资料"}</span>
                    <span className="identity-editor-subtitle">{isNew ? "NEW IDENTITY" : "EDIT PROFILE"}</span>
                </div>
                <span className="identity-editor-header-spacer" aria-hidden="true" />
            </header>

            {askDiscard && (
                <div className="identity-editor-discard" role="alert">
                    <span className="identity-editor-discard-text">有未保存的修改，放弃修改？</span>
                    <div className="identity-editor-discard-actions">
                        <button type="button" className="identity-editor-discard-btn" data-variant="danger" onClick={startClose}>放弃</button>
                        <button type="button" className="identity-editor-discard-btn" onClick={() => setAskDiscard(false)}>继续编辑</button>
                    </div>
                </div>
            )}

            <div className="identity-editor-body hide-scrollbar">
                {/* 头像 */}
                <div className="identity-editor-avatar-block">
                    <button type="button" onClick={pickAvatar} className="identity-editor-avatar" aria-label="点击上传头像">
                        {draft.avatarUrl ? (
                            <>
                                <img src={draft.avatarUrl} alt="" className="h-full w-full object-cover" />
                                <span className="identity-editor-avatar-badge"><Camera size={13} color="#fff" /></span>
                            </>
                        ) : (
                            <>
                                <User size={30} className="text-[var(--c-icon-active)]" />
                                <span className="identity-editor-avatar-hint">点击上传</span>
                            </>
                        )}
                    </button>
                    <div className="identity-editor-avatar-url">
                        <Link size={14} className="shrink-0 text-[var(--c-text)]" />
                        <Input
                            type="text"
                            value={draft.avatarUrl?.startsWith("data:") ? "" : (draft.avatarUrl || "")}
                            onChange={(event) => update({ avatarUrl: event.target.value })}
                            onFocus={focusScroll}
                            placeholder="或粘贴图片URL..."
                            className="flex-1 px-[10px] py-[7px] ts-12"
                        />
                    </div>
                </div>

                {/* IDENTITY */}
                <div className="identity-editor-group-title">Identity</div>
                <div className="identity-editor-fields">
                    <div className="identity-editor-field">
                        <label className="menu-desc ml-1" htmlFor="identity-name">名字</label>
                        <Input id="identity-name" type="text" value={draft.name} onChange={(e) => update({ name: e.target.value })} onFocus={focusScroll} placeholder="您希望AI怎么称呼您..." className="font-medium" />
                    </div>
                    <div className="identity-editor-field">
                        <label className="menu-desc ml-1" htmlFor="identity-nickname">昵称（可选）</label>
                        <Input id="identity-nickname" type="text" value={draft.nickname || ""} onChange={(e) => update({ nickname: e.target.value })} onFocus={focusScroll} placeholder="AI 也可以这样称呼您..." />
                    </div>
                    <div className="identity-editor-field">
                        <label className="menu-desc ml-1" htmlFor="identity-signature">签名（可选）</label>
                        <Input id="identity-signature" type="text" value={draft.signature || ""} onChange={(e) => update({ signature: e.target.value })} onFocus={focusScroll} placeholder="一句话介绍您现在的状态..." />
                    </div>
                </div>

                {/* BASIC */}
                <div className="identity-editor-group-title">Basic</div>
                <div className="identity-editor-fields">
                    <div className="identity-editor-field">
                        <label className="menu-desc ml-1" htmlFor="identity-gender">性别</label>
                        <select id="identity-gender" value={draft.gender} onChange={(e) => update({ gender: e.target.value })} className="ui-select">
                            <option value="保密">保密</option>
                            <option value="男">男</option>
                            <option value="女">女</option>
                            <option value="其他">其他</option>
                        </select>
                    </div>
                    <div className="identity-editor-field-row">
                        <div className="identity-editor-field">
                            <label className="menu-desc ml-1" htmlFor="identity-age">年龄</label>
                            <input id="identity-age" type="text" value={draft.age} onChange={(e) => update({ age: e.target.value })} onFocus={focusScroll} placeholder="例如: 24, 未知" className="ui-input" />
                        </div>
                        <div className="identity-editor-field">
                            <label className="menu-desc ml-1" htmlFor="identity-occupation">职业</label>
                            <input id="identity-occupation" type="text" value={draft.occupation} onChange={(e) => update({ occupation: e.target.value })} onFocus={focusScroll} placeholder="例如: 学生, 自由职业" className="ui-input" />
                        </div>
                    </div>
                </div>

                {/* PERSONA */}
                <div className="identity-editor-group-title">Persona</div>
                <div className="identity-editor-fields">
                    <div className="identity-editor-field">
                        <label className="menu-desc ml-1" htmlFor="identity-bio">简介</label>
                        <textarea id="identity-bio" value={draft.bio} onChange={(e) => update({ bio: e.target.value })} onFocus={focusScroll} placeholder="简单描述一下自己，这会作为AI了解您的基础背景..." rows={3} className="ui-textarea" />
                    </div>
                    <div className="identity-editor-field">
                        <label className="menu-desc ml-1" htmlFor="identity-custom">自定义设定</label>
                        <textarea id="identity-custom" value={draft.customSettings} onChange={(e) => update({ customSettings: e.target.value })} onFocus={focusScroll} placeholder="更深度的性格爱好描述，对话的特殊要求等..." rows={6} className="ui-textarea identity-editor-textarea-lg" />
                    </div>
                </div>
            </div>

            <footer className="identity-editor-footer">
                {!isNew && identity.id !== "identity-1" && (
                    <button
                        type="button"
                        className={`glass-btn identity-editor-delete${deleteArmed ? " is-armed" : ""}`}
                        onClick={handleDelete}
                    >
                        {deleteArmed ? "再次点击确认" : "删除身份"}
                    </button>
                )}
                <button type="button" className="glass-btn is-primary" onClick={handleSave} disabled={!dirty}>保存资料</button>
            </footer>
        </div>
    );
}
