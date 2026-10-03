"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  BookmarkCheck,
  Copy,
  Quote,
  PenLine,
  MessagesSquare,
  Loader2,
  Trash2,
} from "lucide-react";

import {
  loadChapters,
  loadProgress,
  saveProgress,
  loadChapterNotes,
  saveNote,
  deleteNote,
  loadAnnotations,
  saveAnnotation,
  loadBookmarks,
  saveBookmark,
  deleteBookmark,
} from "@/lib/reading-storage";
import type { Book, BookChapter, ReadingAnnotation, ReadingBookmark, ReadingNote } from "@/lib/reading-types";
import { loadAppearance } from "@/lib/study-room/appearance";
import {
  NOTE_EMOJIS,
  buildNote,
  marksByParagraph,
  shortText,
  type ParagraphMark,
} from "@/lib/study-room/annotations";
import { generateAnnotationBatch } from "@/lib/reading-engine";
import { loadCharacters } from "@/lib/character-storage";
import { StudyRoomCoread } from "./study-room-coread";

type StudyRoomReaderProps = {
  book: Book;
  /** 从笔记「回跳原文」时指定章节 */
  initialChapterIndex?: number;
  /** 从笔记「回跳原文」时指定段落 */
  initialParagraphIndex?: number;
  onBack: () => void;
};

type SelectionState = {
  text: string;
  paragraphIndex: number;
  x: number;
  y: number;
};

type AnnotateState = {
  quote: string;
  paragraphIndex: number;
  draft: string;
  /** 表情批注：可与文字并存，也可以只有表情 */
  emoji?: string;
};

type RestoreTarget = { paragraphIndex?: number; paragraphOffset?: number; fraction: number };

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function StudyRoomReader({ book, initialChapterIndex, initialParagraphIndex, onBack }: StudyRoomReaderProps) {
  const [chapters, setChapters] = useState<BookChapter[] | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterNotes, setChapterNotes] = useState<ReadingNote[]>([]);
  const [chapterAnnotations, setChapterAnnotations] = useState<ReadingAnnotation[]>([]);
  // 角色批注：选中角色后按需请求，不整章发往 API
  const [characters] = useState(() => loadCharacters().map((c) => ({ id: c.id, name: c.name })));
  const [characterId, setCharacterId] = useState<string>(() => loadCharacters()[0]?.id ?? "");
  const [annotating, setAnnotating] = useState(false);
  const [markSheet, setMarkSheet] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ id: string; text: string } | null>(null);
  const [bookmarks, setBookmarks] = useState<ReadingBookmark[]>([]);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [annotate, setAnnotate] = useState<AnnotateState | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [coreadOpen, setCoreadOpen] = useState(false);
  const [coreadAnchor, setCoreadAnchor] = useState(0);
  // 顶/底栏：点正文空白处切换；外观里可设为默认隐藏
  const [barsHidden, setBarsHidden] = useState(() => loadAppearance().vars["--sr-bar-autohide"] === "1");
  const [showHint, setShowHint] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<RestoreTarget | null>(null);
  const pendingAnchorRef = useRef<number | null>(initialParagraphIndex ?? null);

  const isPdf = book.format === "pdf";
  const chapter = chapters && chapters.length > 0 ? chapters[Math.min(chapterIndex, chapters.length - 1)] : null;
  const paragraphs = useMemo(() => (chapter && !isPdf ? chapter.paragraphs : []), [chapter, isPdf]);
  const total = chapters?.length ?? 0;

  /** 用户批注与角色批注按段归拢，正文行下方显示标记 */
  const marks = useMemo(() => marksByParagraph(chapterNotes, chapterAnnotations), [chapterNotes, chapterAnnotations]);

  const currentBookmark = bookmarks.find((b) => b.chapterIndex === chapterIndex) ?? null;

  const showFlash = useCallback((message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash((prev) => (prev === message ? null : prev)), 1600);
  }, []);

  const refreshChapterNotes = useCallback(async () => {
    const [notes, annotations] = await Promise.all([
      loadChapterNotes(book.id, chapterIndex),
      loadAnnotations(book.id, chapterIndex).catch(() => []),
    ]);
    setChapterNotes(notes);
    setChapterAnnotations(annotations);
  }, [book.id, chapterIndex]);

  // 载入章节 + 恢复进度
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [chs, progress, marks] = await Promise.all([
        loadChapters(book.id),
        loadProgress(book.id),
        loadBookmarks(book.id),
      ]);
      if (cancelled) return;
      setChapters(chs);
      setBookmarks(marks);
      const startIndex = initialChapterIndex !== undefined
        ? Math.min(Math.max(initialChapterIndex, 0), Math.max(chs.length - 1, 0))
        : Math.min(Math.max(progress?.chapterIndex ?? 0, 0), Math.max(chs.length - 1, 0));
      // 只有回到上次读的那一章才恢复位置；从目录/笔记跳转用指定段落
      restoreRef.current = progress && initialChapterIndex === undefined && progress.chapterIndex === startIndex
        ? { paragraphIndex: progress.paragraphIndex, paragraphOffset: progress.paragraphOffset, fraction: progress.scrollPosition }
        : null;
      setChapterIndex(startIndex);
    })();
    return () => {
      cancelled = true;
    };
  }, [book.id, initialChapterIndex]);

  useEffect(() => {
    void refreshChapterNotes();
  }, [refreshChapterNotes]);

  // 恢复滚动位置（或从笔记回跳时定位到指定段落）
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !chapter) return;
    const anchor = pendingAnchorRef.current;
    pendingAnchorRef.current = null;
    if (anchor !== null && anchor !== undefined) {
      const el = body.querySelector<HTMLElement>(`[data-pi="${anchor}"]`);
      if (el) {
        body.scrollTop = Math.max(el.offsetTop - 14, 0);
        return;
      }
    }
    const target = restoreRef.current;
    restoreRef.current = null;
    if (!target) {
      body.scrollTop = 0;
      return;
    }
    // 优先按段落锚点恢复：字号/行距变化后仍落在同一段
    if (target.paragraphIndex !== undefined) {
      const el = body.querySelector<HTMLElement>(`[data-pi="${target.paragraphIndex}"]`);
      if (el) {
        body.scrollTop = Math.max(el.offsetTop + el.offsetHeight * (target.paragraphOffset ?? 0) - 8, 0);
        return;
      }
    }
    body.scrollTop = Math.max(body.scrollHeight - body.clientHeight, 0) * target.fraction;
  }, [chapterIndex, chapter]);

  // 保存进度
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !chapters || chapters.length === 0) return;
    let timer: number | null = null;
    const persist = () => {
      const fraction = body.scrollHeight > body.clientHeight
        ? body.scrollTop / (body.scrollHeight - body.clientHeight)
        : 0;
      const anchor = readAnchor();
      void saveProgress({
        bookId: book.id,
        chapterIndex,
        scrollPosition: Math.min(Math.max(fraction, 0), 1),
        readingMode: "scroll",
        paragraphIndex: anchor.paragraphIndex,
        paragraphOffset: anchor.paragraphOffset,
        lastReadAt: new Date().toISOString(),
      });
    };
    const onScroll = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(persist, 400);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onScroll);
      if (timer !== null) window.clearTimeout(timer);
      persist();
    };
  }, [book.id, chapterIndex, chapters]);

  // 选中文字 → 弹出精简操作条
  useEffect(() => {
    if (isPdf) return;
    let debounce: number | null = null;

    const findParagraphIndex = (node: Node | null): number => {
      let el: Node | null = node;
      const root = bodyRef.current;
      while (el && el !== root) {
        if (el instanceof HTMLElement && el.dataset.pi !== undefined) return Number(el.dataset.pi);
        el = el.parentNode;
      }
      return -1;
    };

    const compute = () => {
      const sel = window.getSelection();
      const root = bodyRef.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) {
        setSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const pi = findParagraphIndex(range.startContainer);
      const rect = range.getBoundingClientRect();
      setSelection({ text, paragraphIndex: pi, x: rect.left + rect.width / 2, y: rect.top });
    };

    const onChange = () => {
      if (debounce !== null) window.clearTimeout(debounce);
      debounce = window.setTimeout(compute, 220);
    };

    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (debounce !== null) window.clearTimeout(debounce);
    };
  }, [isPdf, chapterIndex]);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const handleCopy = async () => {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.text);
      showFlash("已复制");
    } catch {
      showFlash("复制失败");
    }
    clearSelection();
  };

  const handleExcerpt = async () => {
    if (!selection) return;
    await saveNote(
      buildNote({
        book,
        chapterIndex,
        paragraphIndex: selection.paragraphIndex,
        quote: selection.text,
      }),
    );
    await refreshChapterNotes();
    showFlash("已收藏书摘");
    clearSelection();
  };

  const handleSaveAnnotate = async () => {
    if (!annotate) return;
    const content = annotate.draft.trim();
    const emoji = annotate.emoji;
    // 表情与文字至少有一个才算一条批注
    if (!content && !emoji) return;
    await saveNote(
      buildNote({
        book,
        chapterIndex,
        paragraphIndex: annotate.paragraphIndex,
        quote: annotate.quote,
        content,
        emoji,
      }),
    );
    await refreshChapterNotes();
    setAnnotate(null);
    clearSelection();
    showFlash(content ? "已保存批注" : "已保存表情批注");
  };

  /** 让选中角色为这一段写一条批注：只把这一段发给 API，不整章发。 */
  const handleCharacterAnnotate = async (paragraphIndex: number, text: string) => {
    const character = characters.find((c) => c.id === characterId);
    const chapter = chapters?.[chapterIndex];
    if (!character) {
      showFlash("先在「我的 → 角色」里创建一个角色");
      return;
    }
    if (!chapter) return;
    setAnnotating(true);
    try {
      const created = await generateAnnotationBatch(
        book,
        chapter.title,
        [{ chapterIndex, paragraphIndex, text }],
        chapterAnnotations,
        character.id,
      );
      if (created.length === 0) {
        showFlash(character.name + " 这次没有写下批注");
        return;
      }
      for (const item of created) {
        await saveAnnotation({ ...item, quote: text.slice(0, 200) });
      }
      await refreshChapterNotes();
      showFlash(character.name + " 已批注这一段");
    } catch (err) {
      showFlash(err instanceof Error ? err.message : "批注失败，请检查 API 配置");
    } finally {
      setAnnotating(false);
    }
  };

  const handleDeleteNote = async (note: ReadingNote) => {
    await deleteNote(note.id);
    await refreshChapterNotes();
    showFlash("已删除这条批注");
  };

  const handleUpdateNote = async (note: ReadingNote, content: string) => {
    const next: ReadingNote = {
      ...note,
      content: content.trim() || undefined,
      kind: content.trim() ? "note" : "excerpt",
      updatedAt: new Date().toISOString(),
    };
    await saveNote(next);
    await refreshChapterNotes();
  };

  const handleToggleBookmark = async () => {
    if (currentBookmark) {
      await deleteBookmark(currentBookmark.id);
      setBookmarks((prev) => prev.filter((b) => b.id !== currentBookmark.id));
      showFlash("已取消书签");
      return;
    }
    const body = bodyRef.current;
    const fraction = body && body.scrollHeight > body.clientHeight
      ? Math.min(Math.max(body.scrollTop / (body.scrollHeight - body.clientHeight), 0), 1)
      : 0;
    const bookmark: ReadingBookmark = {
      id: makeId("bm"),
      bookId: book.id,
      chapterIndex,
      paragraphIndex: visibleParagraphIndex(),
      scrollFraction: fraction,
      excerpt: selection?.text,
      createdAt: new Date().toISOString(),
    };
    await saveBookmark(bookmark);
    setBookmarks((prev) => [...prev, bookmark]);
    showFlash("已加书签");
    clearSelection();
  };

  /** 屏幕顶部所在段落 + 段内偏移比例，用于跨字号/分页恢复位置。 */
  function readAnchor(): { paragraphIndex?: number; paragraphOffset?: number } {
    const body = bodyRef.current;
    if (!body) return {};
    const top = body.scrollTop + 8;
    const nodes = body.querySelectorAll<HTMLElement>("[data-pi]");
    for (const node of Array.from(nodes)) {
      if (node.offsetTop + node.offsetHeight > top) {
        const offset = node.offsetHeight > 0 ? (top - node.offsetTop) / node.offsetHeight : 0;
        return { paragraphIndex: Number(node.dataset.pi ?? 0), paragraphOffset: Math.min(Math.max(offset, 0), 1) };
      }
    }
    return {};
  }

  // 点正文切换顶/底栏；选中文字、点按钮或链接时不切换
  const handleBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    if (!barsHidden) setShowHint(true);
    setBarsHidden(!barsHidden);
  };

  useEffect(() => {
    if (!showHint) return;
    const timer = window.setTimeout(() => setShowHint(false), 1800);
    return () => window.clearTimeout(timer);
  }, [showHint]);

  // 键盘：Esc 唤回工具栏，保证返回入口始终可达
  useEffect(() => {
    if (!barsHidden) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBarsHidden(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [barsHidden]);

  /** 找到当前屏幕顶部附近的段落索引，供书签定位。 */
  const visibleParagraphIndex = (): number => {
    const body = bodyRef.current;
    if (!body) return 0;
    const nodes = body.querySelectorAll<HTMLElement>("[data-pi]");
    for (const node of Array.from(nodes)) {
      if (node.offsetTop + node.offsetHeight > body.scrollTop + 8) {
        return Number(node.dataset.pi ?? 0);
      }
    }
    return 0;
  };

  const progressPct = total > 0 ? ((chapterIndex + 1) / total) * 100 : 0;

  return (
    <div className="sr-reader" data-bars={barsHidden ? "hidden" : undefined}>
      <header className="sr-reader-header" aria-hidden={barsHidden || undefined}>
        <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回书架">
          <ChevronLeft size={22} strokeWidth={1.6} />
        </button>
        <div className="sr-reader-title">{book.title}</div>
        <div className="sr-reader-actions">
          <button
            type="button"
            className="sr-icon-btn"
            data-active={coreadOpen ? "true" : undefined}
            onClick={() => {
              setCoreadAnchor(visibleParagraphIndex());
              setCoreadOpen(true);
              clearSelection();
            }}
            aria-label="打开共读"
            title="AI 共读"
            disabled={!chapter || isPdf}
          >
            <MessagesSquare size={20} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            className="sr-icon-btn"
            data-active={currentBookmark ? "true" : undefined}
            onClick={handleToggleBookmark}
            aria-label={currentBookmark ? "取消本章书签" : "为本章加书签"}
            disabled={!chapter}
          >
            {currentBookmark ? <BookmarkCheck size={20} strokeWidth={1.7} /> : <Bookmark size={20} strokeWidth={1.6} />}
          </button>
        </div>
      </header>

      <div ref={bodyRef} className="sr-reader-body" onClick={handleBodyClick}>
        {chapters === null ? (
          <div className="sr-empty" style={{ paddingTop: 60 }}>
            <p>正在载入正文…</p>
          </div>
        ) : chapters.length === 0 ? (
          <div className="sr-empty" style={{ paddingTop: 60 }}>
            <p>这本书暂无正文内容。</p>
          </div>
        ) : isPdf ? (
          <div className="sr-empty" style={{ paddingTop: 60 }}>
            <p>PDF 的原生分页阅读在后续阶段接入书房阅读器。当前阶段书房提供 TXT / EPUB 正文阅读。</p>
          </div>
        ) : (
          <>
            {chapter && <h2 className="sr-chapter-title">{chapter.title}</h2>}
            {paragraphs.map((para, index) => {
              const paraMarks = marks.get(index);
              return (
                <div key={index} className="sr-para-block">
                  <p className={paraMarks ? "sr-para sr-para--marked" : "sr-para"} data-pi={index}>
                    {para}
                  </p>
                  {paraMarks && (
                    <div className="sr-para-marks">
                      {paraMarks.map((mark) => (
                        <button
                          key={mark.id}
                          type="button"
                          className="sr-mark"
                          data-source={mark.source}
                          onClick={() => {
                            setMarkSheet(index);
                            setEditDraft(null);
                          }}
                          aria-label={`查看这一段上的 ${paraMarks.length} 条批注`}
                        >
                          {mark.emoji && <span className="sr-mark-emoji">{mark.emoji}</span>}
                          {mark.source === "character" && <span className="sr-mark-author">{mark.author}</span>}
                          {shortText(mark.text) && <span className="sr-mark-text">{shortText(mark.text)}</span>}
                          {!mark.emoji && !mark.text && <span className="sr-mark-text">批注</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {flash && <div className="sr-flash">{flash}</div>}
      {barsHidden && showHint && <div className="sr-reader-hint">轻点正文显示工具栏</div>}

      {selection && !annotate && (
        <div
          className="sr-selbar"
          style={{ left: Math.min(Math.max(selection.x, 90), window.innerWidth - 90), top: Math.max(selection.y - 52, 60) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button type="button" className="sr-selbar-btn" onClick={handleCopy}>
            <Copy size={16} strokeWidth={1.7} /> 复制
          </button>
          <button type="button" className="sr-selbar-btn" onClick={handleExcerpt}>
            <Quote size={16} strokeWidth={1.7} /> 书摘
          </button>
          <button
            type="button"
            className="sr-selbar-btn"
            onClick={() => setAnnotate({ quote: selection.text, paragraphIndex: selection.paragraphIndex, draft: "" })}
          >
            <PenLine size={16} strokeWidth={1.7} /> 批注
          </button>
        </div>
      )}

      {annotate && (
        <div className="sr-sheet-mask" onClick={() => setAnnotate(null)}>
          <div className="sr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sr-sheet-quote">{annotate.quote}</div>
            <div className="sr-sheet-label">表情批注（可以只选表情，也可以表情＋文字）</div>
            <div className="sr-emoji-grid">
              {NOTE_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="sr-emoji"
                  data-active={annotate.emoji === emoji ? "true" : undefined}
                  aria-pressed={annotate.emoji === emoji}
                  aria-label={`选择表情 ${emoji}`}
                  onClick={() =>
                    setAnnotate((prev) => (prev ? { ...prev, emoji: prev.emoji === emoji ? undefined : emoji } : prev))
                  }
                >
                  {emoji}
                </button>
              ))}
            </div>
            <textarea
              className="sr-sheet-input"
              placeholder="写下你的想法（可留空，只留表情）…"
              value={annotate.draft}
              rows={3}
              autoFocus
              onChange={(e) => setAnnotate((prev) => (prev ? { ...prev, draft: e.target.value } : prev))}
            />
            <div className="sr-sheet-actions">
              <button type="button" className="sr-btn" onClick={() => setAnnotate(null)}>
                取消
              </button>
              <button
                type="button"
                className="sr-btn sr-btn-primary"
                onClick={handleSaveAnnotate}
                disabled={!annotate.draft.trim() && !annotate.emoji}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {markSheet !== null && (
        <div
          className="sr-sheet-mask"
          onClick={() => {
            setMarkSheet(null);
            setEditDraft(null);
          }}
        >
          <div className="sr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sr-sheet-quote">{paragraphs[markSheet]}</div>
            <ul className="sr-mark-list">
              {(marks.get(markSheet) ?? []).map((mark) => {
                const editing = editDraft !== null && mark.note !== undefined && editDraft.id === mark.note.id;
                return (
                  <li key={mark.id} className="sr-mark-item" data-source={mark.source}>
                    {mark.emoji && <span className="sr-mark-emoji">{mark.emoji}</span>}
                    <div className="sr-mark-body">
                      <div className="sr-mark-head">
                        <span className="sr-mark-author">
                          {mark.source === "character" ? `${mark.author} 的批注` : "我的批注"}
                        </span>
                        <span className="sr-note-meta">
                          {new Date(mark.annotation?.createdAt ?? mark.note?.updatedAt ?? Date.now()).toLocaleString("zh-CN")}
                        </span>
                      </div>
                      {mark.note ? (
                        editing ? (
                          <textarea
                            className="sr-sheet-input"
                            rows={2}
                            value={editDraft?.text ?? ""}
                            onChange={(e) => setEditDraft({ id: mark.note!.id, text: e.target.value })}
                          />
                        ) : (
                          <p className="sr-mark-text-full">{mark.note.content || "（只加了表情）"}</p>
                        )
                      ) : (
                        <p className="sr-mark-text-full">{mark.text}</p>
                      )}
                    </div>
                    {mark.note && (
                      <span className="sr-mark-tools">
                        {editing ? (
                          <button
                            type="button"
                            className="sr-note-tool"
                            title="保存修改"
                            onClick={async () => {
                              await handleUpdateNote(mark.note!, editDraft?.text ?? "");
                              setEditDraft(null);
                            }}
                          >
                            保存
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="sr-note-tool"
                            title="修改我的批注"
                            onClick={() => setEditDraft({ id: mark.note!.id, text: mark.note!.content ?? "" })}
                          >
                            <PenLine size={15} strokeWidth={1.7} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="sr-note-tool"
                          title="删除这条批注"
                          onClick={async () => {
                            await handleDeleteNote(mark.note!);
                            setEditDraft(null);
                          }}
                        >
                          <Trash2 size={15} strokeWidth={1.7} />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="sr-mark-foot">
              {characters.length > 0 ? (
                <>
                  <select
                    className="sr-appear-select"
                    value={characterId}
                    onChange={(e) => setCharacterId(e.target.value)}
                    aria-label="选择要批注的角色"
                  >
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="sr-btn"
                    disabled={annotating}
                    onClick={() => void handleCharacterAnnotate(markSheet, paragraphs[markSheet] ?? "")}
                  >
                    {annotating ? (
                      <Loader2 size={15} className="sr-spin" />
                    ) : (
                      <MessagesSquare size={15} strokeWidth={1.7} />
                    )}
                    让 TA 批注这段
                  </button>
                </>
              ) : (
                <span className="sr-note-meta">还没有角色：先在「我的 → 角色」里创建，就能让 TA 为这段写批注。</span>
              )}
            </div>
            <p className="sr-note-meta" style={{ marginTop: 6 }}>只把这一段原文发给 AI，不会发送整章。</p>
          </div>
        </div>
      )}

      {total > 1 && (
        <footer className="sr-reader-footer">
          <button
            type="button"
            className="sr-icon-btn"
            onClick={() => setChapterIndex((i) => Math.max(0, i - 1))}
            disabled={chapterIndex <= 0}
            aria-label="上一章"
          >
            <ChevronLeft size={20} strokeWidth={1.7} />
          </button>
          <div className="sr-progress">
            <i style={{ width: `${progressPct}%` }} />
          </div>
          <span className="sr-progress-label">
            {chapterIndex + 1}/{total}
          </span>
          <button
            type="button"
            className="sr-icon-btn"
            onClick={() => setChapterIndex((i) => Math.min(total - 1, i + 1))}
            disabled={chapterIndex >= total - 1}
            aria-label="下一章"
          >
            <ChevronRight size={20} strokeWidth={1.7} />
          </button>
        </footer>
      )}

      {coreadOpen && (
        <StudyRoomCoread
          book={book}
          chapter={chapter}
          chapterIndex={chapterIndex}
          readParagraphIndex={coreadAnchor}
          selectedText={selection?.text}
          onClose={() => setCoreadOpen(false)}
        />
      )}
    </div>
  );
}
