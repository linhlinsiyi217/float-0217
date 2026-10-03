"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Search,
  StickyNote,
  Quote,
  PenLine,
  Trash2,
  ArrowDownUp,
  Layers,
  Image as ImageIcon,
} from "lucide-react";

import { loadAllNotes, loadBooks, loadChapters, deleteNote, saveNote } from "@/lib/reading-storage";
import type { Book, ReadingNote } from "@/lib/reading-types";

type StudyRoomNotesProps = {
  onBack: () => void;
  onOpenSource: (book: Book, chapterIndex: number, paragraphIndex: number) => void;
};

type EditingState = { note: ReadingNote; draft: string };

export function StudyRoomNotes({ onBack, onOpenSource }: StudyRoomNotesProps) {
  const [notes, setNotes] = useState<ReadingNote[] | null>(null);
  const [books, setBooks] = useState<Record<string, Book>>({});
  const [chapterTitles, setChapterTitles] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [groupByBook, setGroupByBook] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [editing, setEditing] = useState<EditingState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [allNotes] = await Promise.all([loadAllNotes()]);
      if (cancelled) return;
      const bookMap: Record<string, Book> = {};
      for (const book of loadBooks()) bookMap[book.id] = book;
      setBooks(bookMap);
      setNotes(allNotes);

      // 为有笔记的书补上章节标题（回跳与展示都需要）
      const bookIds = Array.from(new Set(allNotes.map((n) => n.bookId)));
      const titles: Record<string, string> = {};
      for (const bookId of bookIds) {
        const chapters = await loadChapters(bookId).catch(() => []);
        for (const chapter of chapters) titles[`${bookId}:${chapter.index}`] = chapter.title;
      }
      if (!cancelled) setChapterTitles(titles);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chapterLabel = (note: ReadingNote): string =>
    chapterTitles[`${note.bookId}:${note.chapterIndex}`] || `第 ${note.chapterIndex + 1} 章`;

  const filtered = useMemo(() => {
    if (!notes) return [];
    const q = query.trim().toLowerCase();
    const matched = q
      ? notes.filter((note) => {
          const bookTitle = books[note.bookId]?.title ?? "";
          return (
            note.quote.toLowerCase().includes(q) ||
            (note.content ?? "").toLowerCase().includes(q) ||
            bookTitle.toLowerCase().includes(q) ||
            chapterLabel(note).toLowerCase().includes(q)
          );
        })
      : notes;
    const sorted = [...matched].sort((a, b) => {
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      return sortDesc ? tb - ta : ta - tb;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, query, sortDesc, books, chapterTitles]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReadingNote[]>();
    for (const note of filtered) {
      const list = map.get(note.bookId) ?? [];
      list.push(note);
      map.set(note.bookId, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const handleDelete = async (note: ReadingNote) => {
    if (!confirm("删除这条笔记？原文上的标记也会一并移除。")) return;
    await deleteNote(note.id);
    setNotes((prev) => (prev ? prev.filter((n) => n.id !== note.id) : prev));
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const content = editing.draft.trim();
    const next: ReadingNote = {
      ...editing.note,
      kind: content ? "note" : "excerpt",
      content: content || undefined,
      updatedAt: new Date().toISOString(),
    };
    await saveNote(next);
    setNotes((prev) => (prev ? prev.map((n) => (n.id === next.id ? next : n)) : prev));
    setEditing(null);
  };

  const renderCard = (note: ReadingNote) => {
    const book = books[note.bookId];
    return (
      <div key={note.id} className="sr-note-card">
        <p className="sr-note-quote">{note.quote}</p>
        {note.content && <p className="sr-note-thought">{note.content}</p>}
        <div className="sr-note-foot">
          <span className="sr-note-meta">
            {book?.title ?? "未知书籍"} · {chapterLabel(note)} ·{" "}
            {new Date(note.updatedAt).toLocaleDateString("zh-CN")}
          </span>
          <span className="sr-note-tools">
            <button
              type="button"
              className="sr-note-tool"
              title="回到原文"
              disabled={!book}
              onClick={() => book && onOpenSource(book, note.chapterIndex, note.paragraphIndex)}
            >
              <Quote size={15} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              className="sr-note-tool"
              title="编辑想法"
              onClick={() => setEditing({ note, draft: note.content ?? "" })}
            >
              <PenLine size={15} strokeWidth={1.7} />
            </button>
            <button type="button" className="sr-note-tool" title="删除" onClick={() => handleDelete(note)}>
              <Trash2 size={15} strokeWidth={1.7} />
            </button>
          </span>
        </div>
      </div>
    );
  };

  return (
    <section className="sr-app">
      <header className="sr-header">
        <div className="sr-header-safe" />
        <div className="sr-header-row">
          <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回">
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <div>
            <div className="sr-header-title">笔记</div>
            <span className="sr-header-sub">
              {notes ? `${notes.length} 条 · 摘录与批注` : "摘录与批注"}
            </span>
          </div>
          <button
            type="button"
            className="sr-icon-btn"
            data-active={!showCover ? "true" : undefined}
            onClick={() => setShowCover((v) => !v)}
            aria-label={showCover ? "隐藏封面" : "显示封面"}
            title={showCover ? "隐藏封面" : "显示封面"}
          >
            <ImageIcon size={20} strokeWidth={1.6} />
          </button>
        </div>
      </header>

      <div className="sr-body">
        <div className="sr-tab-pane">
          <div className="sr-search">
            <Search size={18} strokeWidth={1.6} color="var(--c-icon)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索笔记、书摘、书名或章节"
              aria-label="搜索笔记"
            />
          </div>

          <div className="sr-chip-row">
            <button
              type="button"
              className="sr-chip"
              data-active={groupByBook ? "true" : undefined}
              onClick={() => setGroupByBook((v) => !v)}
            >
              <Layers size={13} strokeWidth={1.8} style={{ marginRight: 5 }} />
              {groupByBook ? "按书分组" : "全部笔记"}
            </button>
            <button type="button" className="sr-chip" onClick={() => setSortDesc((v) => !v)}>
              <ArrowDownUp size={13} strokeWidth={1.8} style={{ marginRight: 5 }} />
              {sortDesc ? "从新到旧" : "从旧到新"}
            </button>
          </div>

          {notes === null ? (
            <div className="sr-empty">
              <p>正在载入笔记…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sr-empty">
              <StickyNote size={42} strokeWidth={1} />
              <p>
                {query.trim() ? "没有匹配的笔记。" : (
                  <>
                    还没有笔记。
                    <br />
                    阅读时选中文字即可收藏书摘或写下批注。
                  </>
                )}
              </p>
            </div>
          ) : groupByBook ? (
            grouped.map(([bookId, list]) => {
              const book = books[bookId];
              return (
                <div key={bookId} className="sr-note-group">
                  <div className="sr-note-group-head">
                    {showCover && (
                      <span className="sr-note-cover" aria-hidden>
                        {(book?.title ?? "书").slice(0, 1)}
                      </span>
                    )}
                    <span className="sr-note-group-title">{book?.title ?? "未知书籍"}</span>
                    <span className="sr-note-group-count">{list.length}</span>
                  </div>
                  {list.map(renderCard)}
                </div>
              );
            })
          ) : (
            filtered.map(renderCard)
          )}
        </div>
      </div>

      {editing && (
        <div className="sr-sheet-mask" onClick={() => setEditing(null)}>
          <div className="sr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sr-sheet-quote">{editing.note.quote}</div>
            <textarea
              className="sr-sheet-input"
              placeholder="写下你的想法…"
              value={editing.draft}
              rows={3}
              autoFocus
              onChange={(e) => setEditing((prev) => (prev ? { ...prev, draft: e.target.value } : prev))}
            />
            <div className="sr-sheet-actions">
              <button type="button" className="sr-btn" onClick={() => setEditing(null)}>
                取消
              </button>
              <button type="button" className="sr-btn sr-btn-primary" onClick={handleSaveEdit}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
