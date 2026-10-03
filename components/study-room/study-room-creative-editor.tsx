"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Square,
  BookOpen,
  RefreshCw,
  ListTree,
} from "lucide-react";

import { loadApiConfigs } from "@/lib/settings-storage";
import { loadCharacters } from "@/lib/character-storage";
import { loadBooks } from "@/lib/reading-storage";
import { fileToBackgroundImage, UnsupportedBackgroundError } from "@/lib/study-room/background-image";
import type { Book } from "@/lib/reading-types";
import {
  CREATIVE_TEMPLATES,
  draftWordCount,
  generateChapter,
  generateOutline,
  loadDrafts,
  makeChapter,
  publishDraft,
  resolveWriterConfig,
  upsertDraft,
  wordCount,
  type CreativeChapter,
  type CreativeDraft,
} from "@/lib/study-room/creative";

type StudyRoomCreativeEditorProps = {
  draftId: string;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
};

type BusyState =
  | { kind: "idle" }
  | { kind: "outline" }
  | { kind: "chapter"; chapterNumber: number }
  | { kind: "publish" };

export function StudyRoomCreativeEditor({ draftId, onBack, onOpenBook }: StudyRoomCreativeEditorProps) {
  const [, setDrafts] = useState<CreativeDraft[]>(() => loadDrafts());
  const [draft, setDraft] = useState<CreativeDraft | null>(
    () => loadDrafts().find((item) => item.id === draftId) ?? null,
  );
  const [busy, setBusy] = useState<BusyState>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [openChapterId, setOpenChapterId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | null>(null);
  const characters = useMemo(() => loadCharacters().map((c) => ({ id: c.id, name: c.name })), []);
  const apiConfigs = useMemo(() => loadApiConfigs().map((c) => ({ id: c.id, name: c.name || c.defaultModel })), []);

  const flash = useCallback((message: string, ms = 2200) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), ms);
  }, []);

  // 改动即存（防抖），写坏也不用担心丢草稿
  const update = useCallback(
    (patch: Partial<CreativeDraft>, persist = true) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
        if (persist) {
          if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            setDrafts((list) => upsertDraft(list, next));
          }, 500);
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!draft) {
    return (
      <section className="sr-app">
        <header className="sr-header">
          <div className="sr-header-safe" />
          <div className="sr-header-row">
            <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回">
              <ChevronLeft size={22} strokeWidth={1.6} />
            </button>
            <div>
              <div className="sr-header-title">创作</div>
              <span className="sr-header-sub">草稿不存在</span>
            </div>
            <span style={{ width: 40 }} />
          </div>
        </header>
        <div className="sr-body">
          <div className="sr-empty">
            <p>这份草稿已经不在了，回书桌重新开始吧。</p>
            <button type="button" className="sr-btn" onClick={onBack} style={{ marginTop: 12 }}>
              返回书桌
            </button>
          </div>
        </div>
      </section>
    );
  }

  const words = draftWordCount(draft);
  const nextChapterNumber = draft.chapters.length + 1;
  const writer = resolveWriterConfig(draft);
  const generating = busy.kind === "chapter" || busy.kind === "outline";

  const runOutline = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy({ kind: "outline" });
    try {
      const outline = await generateOutline(draft, controller.signal);
      update({ outline });
      setShowSettings(true);
      flash("大纲已生成，可以直接改");
    } catch (err) {
      if ((err as Error).name === "AbortError") flash("已停止");
      else flash((err as Error).message || "生成失败，请重试", 3200);
    } finally {
      setBusy({ kind: "idle" });
    }
  };

  const runChapter = async (chapterNumber: number, replaceId?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy({ kind: "chapter", chapterNumber });
    try {
      const result = await generateChapter(draft, chapterNumber, controller.signal);
      const chapter = makeChapter(result.title, result.content);
      if (replaceId) {
        const next = draft.chapters.map((item) => (item.id === replaceId ? { ...chapter, id: replaceId } : item));
        update({ chapters: next });
        flash("已重新生成这一章");
      } else {
        update({ chapters: [...draft.chapters, chapter] });
        setOpenChapterId(chapter.id);
        flash(`第 ${chapterNumber} 章已写好，可以自己改`);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") flash("已停止生成，已完成的内容不受影响");
      else flash((err as Error).message || "生成失败，请重试", 3200);
    } finally {
      setBusy({ kind: "idle" });
    }
  };

  const handlePublish = async () => {
    setBusy({ kind: "publish" });
    try {
      const book = await publishDraft(draft);
      update({ publishedBookId: book.id });
      flash(`《${book.title}》已加入书架`, 3000);
    } catch (err) {
      flash(err instanceof Error ? err.message : "发布失败", 3200);
    } finally {
      setBusy({ kind: "idle" });
    }
  };

  const handleCover = async (file: File) => {
    try {
      const picked = await fileToBackgroundImage(file);
      update({ cover: picked.dataUrl });
      flash(picked.note ? `封面已设置（${picked.note}）` : "封面已设置");
    } catch (err) {
      flash(err instanceof UnsupportedBackgroundError ? err.message : "这张图读不出来", 3000);
    }
  };

  return (
    <section className="sr-app">
      <header className="sr-header">
        <div className="sr-header-safe" />
        <div className="sr-header-row">
          <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回书桌">
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <div>
            <div className="sr-header-title">{draft.title.trim() || "未命名作品"}</div>
            <span className="sr-header-sub">
              {draft.chapters.length} 章 · {words} 字 · 自动保存
            </span>
          </div>
          <button
            type="button"
            className="sr-icon-btn"
            data-active={showSettings ? "true" : undefined}
            onClick={() => setShowSettings((v) => !v)}
            aria-label={showSettings ? "收起设定" : "展开设定"}
            title="设定"
          >
            <ListTree size={20} strokeWidth={1.6} />
          </button>
        </div>
      </header>

      <div className="sr-body">
        <div className="sr-tab-pane">
          {notice && (
            <div className="sr-note-card">
              <div className="sr-note-meta">{notice}</div>
            </div>
          )}

          <div className="sr-actions" style={{ marginBottom: 12 }}>
            {generating ? (
              <button
                type="button"
                className="sr-btn"
                onClick={() => {
                  abortRef.current?.abort();
                }}
              >
                <Square size={15} strokeWidth={2} />
                停止生成
              </button>
            ) : (
              <button type="button" className="sr-btn sr-btn-primary" onClick={() => void runChapter(nextChapterNumber)}>
                <Sparkles size={16} strokeWidth={1.7} />
                写第 {nextChapterNumber} 章
              </button>
            )}
            <button type="button" className="sr-btn" onClick={() => void runOutline()} disabled={generating}>
              {busy.kind === "outline" ? <Loader2 size={15} className="sr-spin" /> : <RefreshCw size={15} strokeWidth={1.7} />}
              先写大纲
            </button>
            <button
              type="button"
              className="sr-btn"
              disabled={generating}
              onClick={() => {
                const chapter = makeChapter(`第 ${nextChapterNumber} 章`, "");
                update({ chapters: [...draft.chapters, chapter] });
                setOpenChapterId(chapter.id);
                setShowSettings(false);
              }}
            >
              <PenLine size={16} strokeWidth={1.7} />
              自己写一章
            </button>
          </div>

          {busy.kind === "chapter" && (
            <p className="sr-note-meta" style={{ marginBottom: 10, lineHeight: 1.7 }}>
              正在写第 {busy.chapterNumber} 章…可以随时停止；写好的内容会留在草稿里。
            </p>
          )}

          {showSettings && (
            <>
              <div className="sr-section-label">参考模板（可选）</div>
              <div className="sr-chip-row">
                {CREATIVE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="sr-chip"
                    data-active={draft.templateId === template.id ? "true" : undefined}
                    title={template.desc}
                    onClick={() => update({ templateId: template.id, ...template.fields })}
                  >
                    {template.name}
                  </button>
                ))}
              </div>

              <div className="sr-section-label">作品设定（都可以不填）</div>
              <div className="sr-appear-row">
                <span className="sr-appear-label">书名</span>
                <input
                  className="sr-appear-input"
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="还没想好也可以空着"
                  aria-label="书名"
                />
              </div>
              <div className="sr-appear-row">
                <span className="sr-appear-label">署名</span>
                <input
                  className="sr-appear-input"
                  value={draft.author ?? ""}
                  onChange={(e) => update({ author: e.target.value })}
                  placeholder="笔名或「佚名」"
                  aria-label="署名"
                />
              </div>
              <div className="sr-appear-row">
                <span className="sr-appear-label">标签</span>
                <input
                  className="sr-appear-input"
                  value={draft.tags.join("、")}
                  onChange={(e) => update({ tags: e.target.value.split(/[、,，\s]+/).filter(Boolean) })}
                  placeholder="用顿号分隔"
                  aria-label="标签"
                />
              </div>
              <div className="sr-appear-row">
                <span className="sr-appear-label">题材 / 文风</span>
                <input
                  className="sr-appear-input"
                  value={draft.genre ?? ""}
                  onChange={(e) => update({ genre: e.target.value })}
                  placeholder="题材"
                  aria-label="题材"
                />
                <input
                  className="sr-appear-input"
                  value={draft.style ?? ""}
                  onChange={(e) => update({ style: e.target.value })}
                  placeholder="文风"
                  aria-label="文风"
                />
              </div>
              <div className="sr-appear-row">
                <span className="sr-appear-label">每章字数</span>
                <input
                  type="range"
                  min={500}
                  max={6000}
                  step={100}
                  value={draft.targetWords ?? 2000}
                  onChange={(e) => update({ targetWords: Number(e.target.value) })}
                  className="sr-slider"
                  aria-label="每章目标字数"
                />
                <span className="sr-appear-value">{draft.targetWords ?? 2000}</span>
              </div>
              <div className="sr-appear-row">
                <span className="sr-appear-label">连载 / 完结</span>
                <button
                  type="button"
                  className="sr-chip"
                  data-active={draft.serialization === "serial" ? "true" : undefined}
                  onClick={() => update({ serialization: "serial" })}
                >
                  连载
                </button>
                <button
                  type="button"
                  className="sr-chip"
                  data-active={draft.serialization === "finished" ? "true" : undefined}
                  onClick={() => update({ serialization: "finished" })}
                >
                  完结短篇
                </button>
              </div>

              {(
                [
                  ["world", "世界观"],
                  ["cast", "人物（一人一段）"],
                  ["outline", "大纲"],
                  ["synopsis", "简介（发布到书架时用）"],
                  ["extra", "补充要求"],
                ] as Array<[keyof CreativeDraft, string]>
              ).map(([key, label]) => (
                <div key={String(key)} style={{ marginBottom: 10 }}>
                  <div className="sr-note-meta" style={{ marginBottom: 4 }}>{label}</div>
                  <textarea
                    className="sr-css-editor"
                    rows={key === "cast" || key === "outline" ? 5 : 3}
                    value={(draft[key] as string) ?? ""}
                    onChange={(e) => update({ [key]: e.target.value } as Partial<CreativeDraft>)}
                    aria-label={label}
                  />
                </div>
              ))}

              <div className="sr-appear-row">
                <span className="sr-appear-label">封面</span>
                {draft.cover && (
                  // 封面预览用本地 data URL / 远程图，不必走 next/image 优化
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.cover} alt="封面预览" className="sr-creative-cover" />
                )}
                <button type="button" className="sr-chip" onClick={() => coverInputRef.current?.click()}>
                  {draft.cover ? "换一张" : "选择图片"}
                </button>
                {draft.cover && (
                  <button type="button" className="sr-chip" onClick={() => update({ cover: undefined })}>
                    去掉
                  </button>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.gif"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleCover(f);
                }}
              />

              <div className="sr-section-label">谁来写</div>
              <div className="sr-chip-row">
                <button
                  type="button"
                  className="sr-chip"
                  data-active={draft.writer.mode === "assistant" ? "true" : undefined}
                  onClick={() => update({ writer: { ...draft.writer, mode: "assistant" } })}
                >
                  写作助手
                </button>
                <button
                  type="button"
                  className="sr-chip"
                  data-active={draft.writer.mode === "character" ? "true" : undefined}
                  onClick={() => update({ writer: { ...draft.writer, mode: "character" } })}
                  disabled={characters.length === 0}
                >
                  用角色卡写
                </button>
              </div>
              {draft.writer.mode === "assistant" ? (
                <div className="sr-appear-row">
                  <span className="sr-appear-label">写作模型</span>
                  <select
                    className="sr-appear-select"
                    value={draft.writer.apiConfigId ?? ""}
                    onChange={(e) => update({ writer: { ...draft.writer, apiConfigId: e.target.value || undefined } })}
                    aria-label="选择写作模型"
                  >
                    <option value="">跟随默认</option>
                    {apiConfigs.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="sr-appear-row">
                  <span className="sr-appear-label">角色</span>
                  <select
                    className="sr-appear-select"
                    value={draft.writer.characterId ?? ""}
                    onChange={(e) => update({ writer: { ...draft.writer, characterId: e.target.value || undefined } })}
                    aria-label="选择代笔的角色"
                  >
                    <option value="">选择角色</option>
                    {characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="sr-note-meta" style={{ margin: "6px 2px 14px", lineHeight: 1.8 }}>
                当前由「{writer.writerLabel}」执笔，用设置里已配置的 API，不在书房里保存任何密钥。
                角色是以作者身份写作，书里的角色是虚构人物，不会当成现实里的身份或经历。
              </p>
              <p className="sr-note-meta" style={{ margin: "0 2px 14px", lineHeight: 1.6 }}>
                提示词预览（只读）：<code className="sr-code-inline">写第 N 章</code> 会带上上面的设定与最近两章的结尾片段，
                不会发送整本书。
              </p>
            </>
          )}

          <div className="sr-section-label">章节</div>
          {draft.chapters.length === 0 ? (
            <p className="sr-note-meta" style={{ margin: "2px 2px 14px", lineHeight: 1.8 }}>
              还没有章节。可以点上面的「写第 1 章」让 AI 起个头，也可以「自己写一章」。
            </p>
          ) : (
            <ul className="sr-creative-chapters">
              {draft.chapters.map((chapter, index) => (
                <li key={chapter.id} className="sr-creative-chapter">
                  <button
                    type="button"
                    className="sr-creative-chapter-main"
                    onClick={() => setOpenChapterId(openChapterId === chapter.id ? null : chapter.id)}
                    aria-expanded={openChapterId === chapter.id}
                  >
                    <span className="sr-creative-chapter-title">{chapter.title || `第 ${index + 1} 章`}</span>
                    <span className="sr-note-meta">{wordCount(chapter.content)} 字</span>
                    <ChevronRight
                      size={16}
                      strokeWidth={1.7}
                      style={{ transform: openChapterId === chapter.id ? "rotate(90deg)" : undefined, transition: "transform .15s" }}
                    />
                  </button>
                  {openChapterId === chapter.id && (
                    <div className="sr-creative-chapter-body">
                      <input
                        className="sr-appear-input"
                        value={chapter.title}
                        onChange={(e) =>
                          update({
                            chapters: draft.chapters.map((item) =>
                              item.id === chapter.id ? { ...item, title: e.target.value, updatedAt: new Date().toISOString() } : item,
                            ),
                          })
                        }
                        aria-label="章节标题"
                      />
                      <textarea
                        className="sr-css-editor"
                        rows={10}
                        value={chapter.content}
                        onChange={(e) =>
                          update({
                            chapters: draft.chapters.map((item) =>
                              item.id === chapter.id ? { ...item, content: e.target.value, updatedAt: new Date().toISOString() } : item,
                            ),
                          })
                        }
                        aria-label="章节正文"
                      />
                      <div className="sr-css-actions">
                        <button
                          type="button"
                          className="sr-chip"
                          disabled={generating}
                          onClick={() => void runChapter(index + 1, chapter.id)}
                        >
                          <RefreshCw size={13} strokeWidth={1.8} />重新生成这一章
                        </button>
                        <button
                          type="button"
                          className="sr-chip"
                          onClick={() => {
                            if (!confirm(`删除「${chapter.title || `第 ${index + 1} 章`}」？`)) return;
                            update({ chapters: draft.chapters.filter((item) => item.id !== chapter.id) });
                            setOpenChapterId(null);
                          }}
                        >
                          <Trash2 size={13} strokeWidth={1.8} />删除
                        </button>
                        <button
                          type="button"
                          className="sr-chip"
                          onClick={() => {
                            const copy: CreativeChapter = {
                              ...chapter,
                              id: `cc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                              title: `${chapter.title}（副本）`,
                            };
                            const index = draft.chapters.findIndex((item) => item.id === chapter.id);
                            const next = [...draft.chapters];
                            next.splice(index + 1, 0, copy);
                            update({ chapters: next });
                          }}
                        >
                          <Plus size={13} strokeWidth={1.8} />复制一份
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="sr-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="sr-btn sr-btn-primary"
              onClick={() => void handlePublish()}
              disabled={busy.kind === "publish" || draft.chapters.length === 0}
            >
              {busy.kind === "publish" ? <Loader2 size={15} className="sr-spin" /> : <Upload size={15} strokeWidth={1.8} />}
              {draft.publishedBookId ? "更新到书架" : "加入书架"}
            </button>
            {draft.publishedBookId && (
              <button
                type="button"
                className="sr-btn"
                onClick={() => {
                  const book = loadBooks().find((item) => item.id === draft.publishedBookId);
                  if (book) onOpenBook(book);
                  else flash("这本书不在书架上了，重新发布即可", 2600);
                }}
              >
                <BookOpen size={15} strokeWidth={1.8} />
                打开这本书
              </button>
            )}
          </div>
          <p className="sr-note-meta" style={{ marginTop: 10, lineHeight: 1.8 }}>
            发布只是把草稿变成书架上的一本书，之后还能回来继续写并再次更新；草稿始终留在书桌里。
          </p>
        </div>
      </div>
    </section>
  );
}

