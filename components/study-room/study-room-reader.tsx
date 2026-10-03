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
} from "lucide-react";

import {
  loadChapters,
  loadProgress,
  saveProgress,
  loadChapterNotes,
  saveNote,
  loadBookmarks,
  saveBookmark,
  deleteBookmark,
} from "@/lib/reading-storage";
import type { Book, BookChapter, ReadingBookmark, ReadingNote } from "@/lib/reading-types";

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
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function StudyRoomReader({ book, initialChapterIndex, initialParagraphIndex, onBack }: StudyRoomReaderProps) {
  const [chapters, setChapters] = useState<BookChapter[] | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterNotes, setChapterNotes] = useState<ReadingNote[]>([]);
  const [bookmarks, setBookmarks] = useState<ReadingBookmark[]>([]);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [annotate, setAnnotate] = useState<AnnotateState | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<number | null>(null);
  const pendingAnchorRef = useRef<number | null>(initialParagraphIndex ?? null);

  const isPdf = book.format === "pdf";
  const chapter = chapters && chapters.length > 0 ? chapters[Math.min(chapterIndex, chapters.length - 1)] : null;
  const paragraphs = useMemo(() => (chapter && !isPdf ? chapter.paragraphs : []), [chapter, isPdf]);
  const total = chapters?.length ?? 0;

  const notesByParagraph = useMemo(() => {
    const map = new Map<number, ReadingNote[]>();
    for (const note of chapterNotes) {
      const list = map.get(note.paragraphIndex) ?? [];
      list.push(note);
      map.set(note.paragraphIndex, list);
    }
    return map;
  }, [chapterNotes]);

  const currentBookmark = bookmarks.find((b) => b.chapterIndex === chapterIndex) ?? null;

  const showFlash = useCallback((message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash((prev) => (prev === message ? null : prev)), 1600);
  }, []);

  const refreshChapterNotes = useCallback(async () => {
    const notes = await loadChapterNotes(book.id, chapterIndex);
    setChapterNotes(notes);
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
      restoreRef.current = progress?.scrollPosition ?? 0;
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
    body.scrollTop = target && chapterIndex > 0 ? body.scrollHeight * target : 0;
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
      void saveProgress({
        bookId: book.id,
        chapterIndex,
        scrollPosition: Math.min(Math.max(fraction, 0), 1),
        readingMode: "scroll",
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
    const now = new Date().toISOString();
    await saveNote({
      id: makeId("note"),
      bookId: book.id,
      chapterIndex,
      paragraphIndex: selection.paragraphIndex,
      kind: "excerpt",
      quote: selection.text,
      createdAt: now,
      updatedAt: now,
    });
    await refreshChapterNotes();
    showFlash("已收藏书摘");
    clearSelection();
  };

  const handleSaveAnnotate = async () => {
    if (!annotate) return;
    const content = annotate.draft.trim();
    if (!content) return;
    const now = new Date().toISOString();
    await saveNote({
      id: makeId("note"),
      bookId: book.id,
      chapterIndex,
      paragraphIndex: annotate.paragraphIndex,
      kind: "note",
      quote: annotate.quote,
      content,
      createdAt: now,
      updatedAt: now,
    });
    await refreshChapterNotes();
    setAnnotate(null);
    showFlash("已保存批注");
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
    <div className="sr-reader">
      <header className="sr-reader-header">
        <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回书架">
          <ChevronLeft size={22} strokeWidth={1.6} />
        </button>
        <div className="sr-reader-title">{book.title}</div>
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
      </header>

      <div ref={bodyRef} className="sr-reader-body">
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
            {paragraphs.map((para, index) => (
              <p
                key={index}
                className={notesByParagraph.has(index) ? "sr-para sr-para--marked" : "sr-para"}
                data-pi={index}
              >
                {para}
              </p>
            ))}
          </>
        )}
      </div>

      {flash && <div className="sr-flash">{flash}</div>}

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
            <textarea
              className="sr-sheet-input"
              placeholder="写下你的想法…"
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
                disabled={!annotate.draft.trim()}
              >
                保存
              </button>
            </div>
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
    </div>
  );
}
