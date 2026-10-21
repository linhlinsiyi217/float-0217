"use client";

// 心声设置：主题管理（内置只读 + 用户新建/编辑/删除）、本会话绑定（这条会话用哪几份主题）、
// 进阶沙箱开关（HTML 原样进 sandbox iframe）。在聊天设置面板里以「心声」入口打开。

import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, ChevronLeft } from "lucide-react";
import { Toggle } from "@/components/ui/form";
import {
    createMindTheme,
    deleteMindTheme,
    getMindSessionBinding,
    getMindSandbox,
    loadMindThemes,
    saveMindThemes,
    seedMindTheme,
    setMindSandbox,
    setMindSessionEnabled,
    toggleMindThemeBinding,
    validateMindTheme,
    type MindField,
    type MindTheme,
} from "@/lib/inner-voice";

type Tab = "themes" | "session" | "advanced";

export function InnerVoiceSettingsModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
    const [tab, setTab] = useState<Tab>("themes");
    const [themes, setThemes] = useState<MindTheme[]>(() => loadMindThemes());
    const [editing, setEditing] = useState<MindTheme | null>(null);
    const [error, setError] = useState("");
    const [binding, setBinding] = useState(() => getMindSessionBinding(sessionId));
    const [sandbox, setSandbox] = useState(() => getMindSandbox());

    const seed = useMemo(() => seedMindTheme(), []);
    const userThemes = themes.filter(t => !t.seed);

    const commitThemes = (next: MindTheme[]) => {
        setThemes(next);
        saveMindThemes(next);
    };

    const startCreate = () => {
        setError("");
        setEditing(createMindTheme());
    };

    const startEdit = (t: MindTheme) => {
        setError("");
        setEditing(JSON.parse(JSON.stringify(t)) as MindTheme);
    };

    const saveEditing = () => {
        if (!editing) return;
        const clean: MindTheme = { ...editing, name: editing.name.trim() };
        const bad = validateMindTheme(clean);
        if (bad) {
            setError(bad);
            return;
        }
        const exists = themes.some(t => t.id === clean.id);
        commitThemes(exists ? themes.map(t => (t.id === clean.id ? clean : t)) : [...themes, clean]);
        setEditing(null);
        setError("");
    };

    const removeTheme = (id: string) => {
        deleteMindTheme(id);
        setThemes(loadMindThemes());
        // 绑定里被摘掉的 id 同步到本地视图
        setBinding(getMindSessionBinding(sessionId));
    };

    const patchEditing = (patch: Partial<MindTheme>) => {
        if (!editing) return;
        setEditing({ ...editing, ...patch });
    };

    const patchField = (idx: number, patch: Partial<MindField>) => {
        if (!editing) return;
        setEditing({
            ...editing,
            fields: editing.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
        });
    };

    const addField = () => {
        if (!editing) return;
        setEditing({ ...editing, fields: [...editing.fields, { key: "", desc: "" }] });
    };

    const removeField = (idx: number) => {
        if (!editing) return;
        setEditing({ ...editing, fields: editing.fields.filter((_, i) => i !== idx) });
    };

    const patchSub = (fieldIdx: number, subIdx: number, patch: Partial<MindField>) => {
        if (!editing) return;
        setEditing({
            ...editing,
            fields: editing.fields.map((f, i) => {
                if (i !== fieldIdx) return f;
                const items = (f.items || []).map((s, j) => (j === subIdx ? { ...s, ...patch } : s));
                return { ...f, items };
            }),
        });
    };

    const addSub = (fieldIdx: number) => {
        if (!editing) return;
        setEditing({
            ...editing,
            fields: editing.fields.map((f, i) => (i === fieldIdx ? { ...f, items: [...(f.items || []), { key: "", desc: "" }] } : f)),
        });
    };

    const removeSub = (fieldIdx: number, subIdx: number) => {
        if (!editing) return;
        setEditing({
            ...editing,
            fields: editing.fields.map((f, i) => (i === fieldIdx ? { ...f, items: (f.items || []).filter((_, j) => j !== subIdx) } : f)),
        });
    };

    return (
        <div className="ivs-overlay" style={{ zIndex: 80 }} onClick={onClose}>
            <style>{IVS_STYLES}</style>
            <div className="ivs-sheet" onClick={e => e.stopPropagation()}>
                <div className="ivs-titles">
                    <h2 className="ivs-title">心声</h2>
                    <p className="ivs-sub">点击 AI 头像时弹出的卡片：主题 = 提示词 + 字段 + 你自己写的 HTML 模板</p>
                </div>

                {editing ? (
                    <>
                        <button className="ivs-back" type="button" onClick={() => setEditing(null)}>
                            <ChevronLeft size={16} /> 返回主题列表
                        </button>
                        <div className="ivs-editor">
                            <label className="ivs-field">
                                <span>主题名字</span>
                                <input value={editing.name} maxLength={24} onChange={e => patchEditing({ name: e.target.value })} placeholder="如：晚安心事" />
                            </label>
                            <label className="ivs-field">
                                <span>写给模型的提示词（怎么想、怎么写）</span>
                                <textarea
                                    value={editing.prompt}
                                    rows={5}
                                    onChange={e => patchEditing({ prompt: e.target.value })}
                                    placeholder="提示词里可以用 {{char}} 和 {{user}} 指代角色与用户"
                                />
                            </label>

                            <div className="ivs-field">
                                <span>字段（模板里用 {'{{字段名}}'} 代入）</span>
                                <div className="ivs-fields">
                                    {editing.fields.map((f, i) => (
                                        <div key={i} className="ivs-field-card">
                                            <div className="ivs-field-row">
                                                <input
                                                    value={f.key}
                                                    onChange={e => patchField(i, { key: e.target.value })}
                                                    placeholder="字段名（中文/字母，无空格标点）"
                                                />
                                                <input
                                                    value={f.desc}
                                                    onChange={e => patchField(i, { desc: e.target.value })}
                                                    placeholder="说明（给模型看）"
                                                />
                                                <button
                                                    type="button"
                                                    className={`ivs-tag${f.type === "list" ? " is-on" : ""}`}
                                                    onClick={() => patchField(i, f.type === "list" ? { type: undefined, items: undefined } : { type: "list", items: [{ key: "", desc: "" }] })}
                                                    title="列表字段：模板里用 {{#字段名}}…{{/字段名}} 按项重复"
                                                >
                                                    列表
                                                </button>
                                                <button type="button" className="ivs-icon-btn" onClick={() => removeField(i)} aria-label="删除字段">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                            {f.type === "list" && (
                                                <div className="ivs-subs">
                                                    {(f.items || []).map((s, j) => (
                                                        <div key={j} className="ivs-field-row ivs-sub-row">
                                                            <input value={s.key} onChange={e => patchSub(i, j, { key: e.target.value })} placeholder="子字段名" />
                                                            <input value={s.desc} onChange={e => patchSub(i, j, { desc: e.target.value })} placeholder="说明" />
                                                            <button type="button" className="ivs-icon-btn" onClick={() => removeSub(i, j)} aria-label="删除子字段">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button type="button" className="ivs-add-sub" onClick={() => addSub(i)}>
                                                        <Plus size={13} /> 加子字段
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" className="ivs-add-sub" onClick={addField}>
                                        <Plus size={13} /> 加字段
                                    </button>
                                </div>
                            </div>

                            <label className="ivs-field">
                                <span>HTML 模板（可带 {'<style>'} CSS；{'{{字段}}'} 代入，值一律转义）</span>
                                <textarea
                                    value={editing.html}
                                    rows={9}
                                    onChange={e => patchEditing({ html: e.target.value })}
                                    placeholder={'<div class="card">\n  <div class="name">{{char}}</div>\n  <div class="say">{{心声}}</div>\n</div>\n<style>\n.card { padding: 16px; border-radius: 18px; }\n</style>'}
                                />
                            </label>

                            <p className="ivs-hint">内置变量不用声明：char、user、time、date、stamp、charAvatar、userAvatar。{"{{^字段}}"} 块在没内容时才显示。</p>
                            {error && <p className="ivs-error">{error}</p>}
                            <div className="ivs-editor-actions">
                                <button className="ivs-cta" type="button" onClick={saveEditing}>保存主题</button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="ivs-tabs" role="tablist">
                            <button role="tab" aria-selected={tab === "themes"} {...(tab === "themes" ? { "data-active": "" } : {})} onClick={() => setTab("themes")}>主题</button>
                            <button role="tab" aria-selected={tab === "session"} {...(tab === "session" ? { "data-active": "" } : {})} onClick={() => setTab("session")}>本会话</button>
                            <button role="tab" aria-selected={tab === "advanced"} {...(tab === "advanced" ? { "data-active": "" } : {})} onClick={() => setTab("advanced")}>进阶</button>
                        </div>

                        <div className="ivs-list">
                            {tab === "themes" && (
                                <>
                                    <div className="ivs-theme-card" data-seed="">
                                        <div className="ivs-theme-row">
                                            <div className="ivs-theme-main">
                                                <span className="ivs-theme-name">{seed.name}</span>
                                                <span className="ivs-seed-badge">内置 · 只读</span>
                                            </div>
                                            <button type="button" className="ivs-pill-btn" onClick={() => startEdit(seed)}>看一眼</button>
                                        </div>
                                        <p className="ivs-theme-desc">{seed.fields.map(f => f.key).join(" · ")}</p>
                                    </div>
                                    {userThemes.map(t => (
                                        <div key={t.id} className="ivs-theme-card">
                                            <div className="ivs-theme-row">
                                                <div className="ivs-theme-main">
                                                    <span className="ivs-theme-name">{t.name}</span>
                                                </div>
                                                <div className="ivs-theme-actions">
                                                    <button type="button" className="ivs-icon-btn" onClick={() => startEdit(t)} aria-label="编辑">
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button type="button" className="ivs-icon-btn" onClick={() => removeTheme(t.id)} aria-label="删除">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="ivs-theme-desc">{t.fields.map(f => f.key).join(" · ") || "还没有字段"}</p>
                                        </div>
                                    ))}
                                    <button className="ivs-add-btn" type="button" onClick={startCreate}>
                                        <Plus size={16} /> 新建主题
                                    </button>
                                </>
                            )}

                            {tab === "session" && (
                                <>
                                    <div className="ivs-row">
                                        <div className="ivs-row-main">
                                            <span className="ivs-row-name">在这条会话开启心声</span>
                                            <span className="ivs-row-desc">关掉后模型不再多交心声，点头像也只看已有历史</span>
                                        </div>
                                        <Toggle
                                            checked={binding.on}
                                            onChange={c => {
                                                setMindSessionEnabled(sessionId, c);
                                                setBinding(getMindSessionBinding(sessionId));
                                            }}
                                        />
                                    </div>
                                    <p className="ivs-note">勾选这条会话要用的主题（可多选，每轮随机抽一份）：</p>
                                    {[seed, ...userThemes].map(t => (
                                        <label key={t.id} className="ivs-check-row">
                                            <input
                                                type="checkbox"
                                                checked={binding.ids.includes(t.id)}
                                                onChange={() => {
                                                    toggleMindThemeBinding(sessionId, t.id);
                                                    setBinding(getMindSessionBinding(sessionId));
                                                }}
                                            />
                                            <span>{t.name}{t.seed ? "（内置）" : ""}</span>
                                        </label>
                                    ))}
                                </>
                            )}

                            {tab === "advanced" && (
                                <>
                                    <div className="ivs-row">
                                        <div className="ivs-row-main">
                                            <span className="ivs-row-name">沙箱渲染（进阶）</span>
                                            <span className="ivs-row-desc">把 HTML 原样放进 sandbox iframe：脚本可以跑，但读不到聊天记录和 API 密钥。默认关闭走白名单清洗，更稳。</span>
                                        </div>
                                        <Toggle
                                            checked={sandbox}
                                            onChange={c => {
                                                setMindSandbox(c);
                                                setSandbox(c);
                                            }}
                                        />
                                    </div>
                                    <p className="ivs-note">提示：分享来的主题先别急着开沙箱，白名单模式已经把 script / iframe / 事件属性全剥掉了。</p>
                                </>
                            )}
                        </div>
                    </>
                )}

                <div className="ivs-footer">
                    <button className="ivs-cta" type="button" onClick={onClose}>完成</button>
                </div>
            </div>
        </div>
    );
}

const IVS_STYLES = `
.ivs-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.42);
  backdrop-filter: blur(14px) saturate(1.4);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  display: flex; align-items: flex-end; justify-content: center;
  animation: ivs-fade .2s ease both;
}
@keyframes ivs-fade { from { opacity: 0; } to { opacity: 1; } }
.ivs-sheet {
  width: min(100%, 560px); max-height: 86vh;
  display: flex; flex-direction: column; gap: 12px;
  padding: 18px 18px calc(16px + env(safe-area-inset-bottom));
  border-radius: 26px 26px 0 0;
  background: var(--background, #f5f5f7);
  box-shadow: 0 -12px 40px rgba(0,0,0,.22);
  animation: ivs-up .28s cubic-bezier(.34,1.2,.5,1) both;
  overflow: hidden;
}
@keyframes ivs-up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
.ivs-titles { flex: none; }
.ivs-title { margin: 0; font-size: 17px; font-weight: 700; }
.ivs-sub { margin: 4px 0 0; font-size: 12px; color: var(--text-secondary, #8a8a8e); line-height: 1.5; }
.ivs-tabs { display: flex; gap: 6px; flex: none; }
.ivs-tabs button {
  flex: 1; padding: 8px 0; border: none; border-radius: 12px; cursor: pointer;
  font-size: 13px; background: var(--muted, rgba(120,120,128,.12)); color: var(--foreground, #333);
}
.ivs-tabs button[data-active] { background: var(--primary, #111); color: var(--primary-foreground, #fff); }
.ivs-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.ivs-note { margin: 0; font-size: 12px; color: var(--text-secondary, #8a8a8e); line-height: 1.6; }
.ivs-theme-card, .ivs-row {
  padding: 12px 14px; border-radius: 16px;
  background: var(--card, #fff); box-shadow: 0 1px 4px rgba(0,0,0,.05);
}
.ivs-theme-row, .ivs-row { display: flex; align-items: center; gap: 10px; }
.ivs-theme-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
.ivs-theme-name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ivs-seed-badge { flex: none; font-size: 10px; padding: 2px 7px; border-radius: 999px; background: rgba(120,120,128,.14); color: var(--text-secondary, #8a8a8e); }
.ivs-theme-desc { margin: 6px 0 0; font-size: 12px; color: var(--text-secondary, #8a8a8e); }
.ivs-theme-actions { display: flex; gap: 6px; flex: none; }
.ivs-icon-btn {
  flex: none; width: 30px; height: 30px; border-radius: 10px; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: rgba(120,120,128,.12); color: var(--foreground, #333);
  transition: transform .15s ease;
}
.ivs-icon-btn:active { transform: scale(.9); }
.ivs-pill-btn {
  flex: none; padding: 6px 12px; border: none; border-radius: 999px; cursor: pointer;
  font-size: 12px; background: rgba(120,120,128,.12); color: var(--foreground, #333);
}
.ivs-add-btn, .ivs-add-sub {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 11px 0; border: 1px dashed rgba(120,120,128,.35); border-radius: 14px;
  background: transparent; cursor: pointer; font-size: 13px; color: var(--foreground, #333);
}
.ivs-add-sub { padding: 7px 0; font-size: 12px; border-radius: 10px; }
.ivs-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ivs-row-name { font-size: 14px; font-weight: 600; }
.ivs-row-desc { font-size: 12px; color: var(--text-secondary, #8a8a8e); line-height: 1.5; }
.ivs-check-row {
  display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 14px;
  background: var(--card, #fff); box-shadow: 0 1px 4px rgba(0,0,0,.05); font-size: 14px; cursor: pointer;
}
.ivs-check-row input { accent-color: var(--primary, #111); width: 17px; height: 17px; }
.ivs-back {
  flex: none; display: flex; align-items: center; gap: 4px;
  border: none; background: transparent; cursor: pointer; font-size: 13px; color: var(--primary, #111);
  padding: 0; width: fit-content;
}
.ivs-editor { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.ivs-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary, #8a8a8e); }
.ivs-field > span { font-size: 12px; }
.ivs-field input, .ivs-field textarea {
  width: 100%; border: 1px solid rgba(120,120,128,.22); border-radius: 12px;
  padding: 10px 12px; font-size: 13px; color: var(--foreground, #222);
  background: var(--card, #fff); outline: none; resize: vertical;
  font-family: inherit;
}
.ivs-field textarea { line-height: 1.6; }
.ivs-field input:focus, .ivs-field textarea:focus { border-color: var(--primary, #111); }
.ivs-fields { display: flex; flex-direction: column; gap: 8px; }
.ivs-field-card { padding: 10px; border-radius: 12px; background: rgba(120,120,128,.07); }
.ivs-field-row { display: flex; gap: 6px; align-items: center; }
.ivs-field-row input { flex: 1; min-width: 0; border: 1px solid rgba(120,120,128,.22); border-radius: 10px; padding: 8px 10px; font-size: 13px; background: var(--card, #fff); }
.ivs-tag {
  flex: none; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(120,120,128,.3);
  background: transparent; font-size: 11px; cursor: pointer; color: var(--text-secondary, #8a8a8e);
}
.ivs-tag.is-on { background: var(--primary, #111); color: var(--primary-foreground, #fff); border-color: transparent; }
.ivs-subs { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; padding-left: 8px; border-left: 2px solid rgba(120,120,128,.18); }
.ivs-sub-row input { font-size: 12px; padding: 6px 9px; }
.ivs-hint { margin: 0; font-size: 11px; color: var(--text-secondary, #8a8a8e); line-height: 1.6; }
.ivs-error { margin: 0; font-size: 12px; color: #e5484d; }
.ivs-editor-actions { display: flex; }
.ivs-footer { flex: none; }
.ivs-cta {
  width: 100%; padding: 13px 0; border: none; border-radius: 16px; cursor: pointer;
  font-size: 15px; font-weight: 600;
  background: var(--primary, #111); color: var(--primary-foreground, #fff);
  transition: transform .15s ease;
}
.ivs-cta:active { transform: scale(.98); }
`;
