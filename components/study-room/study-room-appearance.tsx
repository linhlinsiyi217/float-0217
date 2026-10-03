"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Copy, Download, Upload, Undo2, Info } from "lucide-react";

import {
  APPEARANCE_MODULES,
  VAR_DEFS,
  applyAppearance,
  buildAppearanceCss,
  defaultState,
  loadAppearance,
  moduleVarKeys,
  resetModule,
  saveAppearance,
  varDef,
  type AppearanceModule,
  type AppearanceState,
} from "@/lib/study-room/appearance";
import { ColorSheet } from "./color-sheet";

type StudyRoomAppearanceProps = { onBack: () => void };

export function StudyRoomAppearance({ onBack }: StudyRoomAppearanceProps) {
  const [module, setModule] = useState<AppearanceModule | "hub">("hub");
  const [saved, setSaved] = useState<AppearanceState>(() => loadAppearance());
  const [draft, setDraft] = useState<AppearanceState>(() => loadAppearance());
  const [colorKey, setColorKey] = useState<string | null>(null);
  const [cssDraft, setCssDraft] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 草稿实时预览：把草稿直接注入，用户在真实界面上看到的就是结果
  useEffect(() => {
    applyAppearance(draft);
  }, [draft]);

  // 离开外观页时恢复为已保存的外观（取消未保存的草稿）
  useEffect(() => () => {
    applyAppearance(loadAppearance());
  }, []);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const moduleVars = module === "hub" ? [] : VAR_DEFS.filter((d) => d.module === module);
  const moduleCss = module === "hub" ? "" : (cssDraft[module] ?? draft.css[module] ?? "");

  const setVar = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, vars: { ...prev.vars, [key]: value } }));
  };
  const setCss = (mod: AppearanceModule, value: string) => {
    setCssDraft((prev) => ({ ...prev, [mod]: value }));
    setDraft((prev) => ({ ...prev, css: { ...prev.css, [mod]: value } }));
  };
  const applyCssDraftToState = (mod: AppearanceModule) => {
    const value = cssDraft[mod];
    if (value === undefined) return;
    setDraft((prev) => ({ ...prev, css: { ...prev.css, [mod]: value } }));
  };

  const handleSave = () => {
    saveAppearance(draft);
    setSaved(draft);
    setNotice("已保存");
    window.setTimeout(() => setNotice((n) => (n === "已保存" ? null : n)), 1600);
  };
  const handleCancel = () => {
    setDraft(saved);
    setCssDraft({});
    applyAppearance(saved);
    setNotice("已取消未保存的修改");
    window.setTimeout(() => setNotice((n) => (n === "已取消未保存的修改" ? null : n)), 1600);
  };
  const handleUndo = () => {
    setDraft(saved);
    setCssDraft({});
    applyAppearance(saved);
  };
  const handleResetModule = () => {
    if (module === "hub") {
      const fresh = defaultState();
      setDraft(fresh);
      setCssDraft({});
      applyAppearance(fresh);
      setNotice("已恢复全部默认");
      return;
    }
    const next = resetModule(draft, module);
    setDraft(next);
    setCssDraft((prev) => ({ ...prev, [module]: "" }));
    setNotice(`已恢复「${APPEARANCE_MODULES.find((m) => m.key === module)?.label}」默认`);
    window.setTimeout(() => setNotice(null), 1800);
  };

  const handleCopyCss = async () => {
    try {
      await navigator.clipboard.writeText(module === "hub" ? buildAppearanceCss(draft) : moduleCss);
      setNotice("已复制 CSS");
    } catch {
      setNotice("复制失败");
    }
    window.setTimeout(() => setNotice(null), 1600);
  };

  const handleExport = () => {
    const payload = JSON.stringify(draft, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "studyroom-appearance.json";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("已导出外观文件");
    window.setTimeout(() => setNotice(null), 1600);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppearanceState>;
      const base = defaultState();
      const next: AppearanceState = {
        vars: { ...base.vars, ...(parsed.vars ?? {}) },
        css: { ...(parsed.css ?? {}) },
      };
      setDraft(next);
      setCssDraft({});
      applyAppearance(next);
      setNotice("已导入，未保存前可取消");
    } catch {
      setNotice("导入失败：文件格式不正确");
    }
    window.setTimeout(() => setNotice(null), 2000);
  };

  return (
    <section className="sr-app">
      <header className="sr-header">
        <div className="sr-header-safe" />
        <div className="sr-header-row">
          <button type="button" className="sr-icon-btn" onClick={() => (module === "hub" ? onBack() : setModule("hub"))} aria-label="返回">
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <div>
            <div className="sr-header-title">外观</div>
            <span className="sr-header-sub">{module === "hub" ? "书房外观与自定义" : APPEARANCE_MODULES.find((m) => m.key === module)?.desc}</span>
          </div>
          <span style={{ width: 40 }} />
        </div>
      </header>

      <div className="sr-body">
        <div className="sr-tab-pane sr-appearance-pane">
          {notice && <div className="sr-note-card"><div className="sr-note-meta">{notice}</div></div>}

          {module === "hub" ? (
            <>
              <div className="sr-section-label">选择要调整的部分</div>
              {APPEARANCE_MODULES.map((m) => (
                <button key={m.key} type="button" className="sr-btn" style={{ width: "100%", marginBottom: 10, justifyContent: "space-between" }} onClick={() => { setModule(m.key); setCssDraft({}); }}>
                  <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <span>{m.label}</span>
                    <span className="sr-note-meta">{m.desc}</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
                </button>
              ))}
              <div className="sr-actions" style={{ marginTop: 14 }}>
                <button type="button" className="sr-btn" onClick={handleExport}><Download size={16} strokeWidth={1.7} />导出外观</button>
                <button type="button" className="sr-btn" onClick={() => fileRef.current?.click()}><Upload size={16} strokeWidth={1.7} />导入外观</button>
              </div>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleImportFile(f); }} />
              <button type="button" className="sr-btn" style={{ width: "100%", marginTop: 10, justifyContent: "center", color: "var(--c-danger)" }} onClick={handleResetModule}>
                <RotateCcw size={16} strokeWidth={1.7} />恢复全部默认
              </button>
            </>
          ) : (
            <>
              {/* 基础控件 */}
              <div className="sr-section-label">基础样式</div>
              {moduleVars.map((def) => {
                const value = draft.vars[def.key] ?? def.fallback;
                if (def.type === "color") {
                  return (
                    <div key={def.key} className="sr-appear-row">
                      <span className="sr-appear-label">{def.label}</span>
                      <button type="button" className="sr-swatch" style={{ background: value }} onClick={() => setColorKey(def.key)} aria-label={`${def.label}，当前 ${value}`} />
                    </div>
                  );
                }
                if (def.type === "toggle") {
                  const on = value !== "0";
                  return (
                    <div key={def.key} className="sr-appear-row">
                      <span className="sr-appear-label">{def.label}</span>
                      <button type="button" className="sr-chip" data-active={on ? "true" : undefined} onClick={() => setVar(def.key, on ? "0" : "1")}>{on ? "开" : "关"}</button>
                    </div>
                  );
                }
                return (
                  <div key={def.key} className="sr-appear-row sr-appear-row--slider">
                    <span className="sr-appear-label">{def.label}</span>
                    <input
                      type="range"
                      min={def.min} max={def.max} step={def.step}
                      value={Number(value)}
                      onChange={(e) => setVar(def.key, e.target.value)}
                      className="sr-slider"
                      aria-label={def.label}
                    />
                    <span className="sr-appear-value">{value}{def.unit}</span>
                  </div>
                );
              })}

              {/* 只读的基础样式说明 */}
              <details className="sr-css-base">
                <summary><Info size={14} strokeWidth={1.7} />基础样式（只读）与可用的选择器</summary>
                <div className="sr-note-meta" style={{ marginTop: 8, lineHeight: 1.8 }}>
                  下面的变量就是上方控件在改的东西，可以直接写进下面的自定义 CSS：
                  <br />
                  {moduleVarKeys(module).map((k) => <code key={k} className="sr-code-inline">{k}</code>)}
                  <br />
                  本部分主要选择器：<code className="sr-code-inline">{MODULE_SELECTORS[module]}</code>
                </div>
              </details>

              {/* 实时预览：复用真实类名与相同样式机制，数据为明确标注的预览数据 */}
              <div className="sr-section-label">实时预览（预览数据，不写入书架/会话）</div>
              <div className="sr-preview-box"><ModulePreview module={module} /></div>

              {/* 自定义 CSS 覆盖层 */}
              <div className="sr-section-label">自定义 CSS（覆盖层，作用域限定在书房）</div>
              <textarea
                className="sr-css-editor"
                value={moduleCss}
                onChange={(e) => setCss(module, e.target.value)}
                onBlur={() => applyCssDraftToState(module)}
                spellCheck={false}
                rows={6}
                placeholder={`例如：\n.sr-btn { letter-spacing: .4px; }`}
              />
              <div className="sr-css-actions">
                <button type="button" className="sr-chip" onClick={handleCopyCss}><Copy size={13} strokeWidth={1.8} />复制</button>
                <button type="button" className="sr-chip" onClick={handleExport}><Download size={13} strokeWidth={1.8} />导出</button>
                <button type="button" className="sr-chip" onClick={() => fileRef.current?.click()}><Upload size={13} strokeWidth={1.8} />导入</button>
                <button type="button" className="sr-chip" onClick={handleResetModule}><RotateCcw size={13} strokeWidth={1.8} />恢复本部分默认</button>
              </div>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleImportFile(f); }} />
            </>
          )}
        </div>
      </div>

      {module !== "hub" && (
        <footer className="sr-appear-footer">
          <button type="button" className="sr-btn" onClick={handleUndo} disabled={!dirty}>
            <Undo2 size={16} strokeWidth={1.7} />撤销未保存
          </button>
          <button type="button" className="sr-btn" onClick={handleCancel} disabled={!dirty}>取消</button>
          <button type="button" className="sr-btn sr-btn-primary" onClick={handleSave} disabled={!dirty}>保存</button>
        </footer>
      )}

      {colorKey && (
        <ColorSheet
          title={varDef(colorKey)?.label ?? "颜色"}
          value={draft.vars[colorKey] ?? "#0a84ff"}
          onChange={(v) => setVar(colorKey, v)}
          onClose={() => setColorKey(null)}
        />
      )}
    </section>
  );
}

/** 各部分的真实选择器（给用户写覆盖 CSS 参考，稳定且不含编译哈希）。 */
const MODULE_SELECTORS: Record<AppearanceModule, string> = {
  global: ".sr-app / .sr-btn / .sr-tabbar",
  shelf: ".sr3-stage / .sr3-shelf / .sr3-board / .sr3-book / .sr3-spine-title",
  reader: ".sr-reader / .sr-reader-body / .sr-para / .sr-chapter-title",
  chat: ".sr-msg-app / .sr-msg-row / .sr-msg-bubble / .sr-msg-inputbar",
  coread: ".sr-coread / .sr-coread-msg / .sr-coread-foot",
  notes: ".sr-note-card / .sr-note-group / .sr-res-card",
};

/** 预览块：用真实类名渲染，数据全部是写死的预览样本。 */
function ModulePreview({ module }: { module: AppearanceModule }) {
  if (module === "shelf") {
    return (
      <div className="sr3-stage" style={{ padding: 0, minHeight: 0 }}>
        <div className="sr3-shelves" style={{ gap: 18 }}>
          {[[0, 1, 2], [3, 4]].map((row, ri) => (
            <div className="sr3-shelf" key={ri}>
              <div className="sr3-row" style={{ minHeight: 92, transformStyle: "flat" }}>
                {row.map((i) => {
                  const bookStyle = {
                    "--w": `${24 + i * 4}px`,
                    "--h": "88px",
                    "--d": "58px",
                    "--tone": ["#33465e", "#5a3f36", "#3d4d41", "#5c3a46", "#2f4b4c"][i],
                    "--ink": "#eef2f8",
                    pointerEvents: "none",
                  } as CSSProperties;
                  return (
                    <span key={i} className="sr3-book" style={bookStyle}>
                      <span className="sr3-face sr3-spine"><span className="sr3-spine-title">样本{i + 1}</span></span>
                    </span>
                  );
                })}
              </div>
              <span className="sr3-board" /><span className="sr3-board-edge" /><span className="sr3-contact" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (module === "reader") {
    return (
      <div className="sr-reader" style={{ position: "static", inset: "auto", borderRadius: 12, overflow: "hidden" }}>
        <div className="sr-reader-body" style={{ padding: 14, maxHeight: 190 }}>
          <h2 className="sr-chapter-title" style={{ marginTop: 0 }}>第一章</h2>
          <p className="sr-para">预览正文：风从窗外进来，把书页吹得轻轻响了一声。</p>
          <p className="sr-para">第二行用来检查行距与字号是否合适。</p>
        </div>
      </div>
    );
  }
  if (module === "chat" || module === "coread") {
    const wrap = module === "chat" ? "sr-msg-body" : "sr-coread-body";
    const cls = module === "chat" ? "sr-msg-bubble" : "sr-coread-msg";
    const rowCls = module === "chat" ? "sr-msg-row" : null;
    const bubble = (mine: boolean, text: string, groupEnd: boolean, groupStart: boolean) => {
      const inner = <div className={cls} data-role={mine ? "user" : "assistant"} data-mine={mine ? "true" : "false"} data-group-start={groupStart ? "true" : undefined} data-group-end={groupEnd ? "true" : undefined}>{text}</div>;
      return rowCls
        ? <div className={rowCls} data-mine={mine ? "true" : "false"} data-group-start={groupStart ? "true" : undefined} data-group-end={groupEnd ? "true" : undefined}>{inner}</div>
        : inner;
    };
    return (
      <div className={wrap} style={{ padding: 12, maxHeight: 230, display: "flex", flexDirection: "column", gap: 2 }}>
        {bubble(false, "短消息，带尾巴。", true, true)}
        {bubble(false, "同一个人连续的第二条，组内不重复尾巴。", true, false)}
        {bubble(true, "这是一条比较长的消息，用来看多行换行、最大宽度和气泡圆角是否合适。", true, true)}
      </div>
    );
  }
  return (
    <div style={{ padding: 4 }}>
      <div className="sr-note-card">
        <p className="sr-note-quote">样本摘录：一句话被标记下来。</p>
        <p className="sr-note-thought">样本想法：这是我写下的批注。</p>
        <div className="sr-note-foot"><span className="sr-note-meta">样本书籍 · 第 1 章</span></div>
      </div>
      <div className="sr-res-card" style={{ marginTop: 10 }}>
        <div className="sr-res-cover">样</div>
        <div className="sr-res-main">
          <div className="sr-res-title">样本结果卡片</div>
          <div className="sr-res-meta">用于检查圆角与底色</div>
        </div>
      </div>
    </div>
  );
}
