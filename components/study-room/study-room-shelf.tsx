"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookPlus } from "lucide-react";

import { deleteBook, loadAllProgress, loadBooks } from "@/lib/reading-storage";
import { importBookFromBlob, UnsupportedBookFormatError } from "@/lib/study-room/import";
import { moveInOrder, sortShelfBooks, type ShelfSort } from "@/lib/study-room/shelf-layout";
import { loadShelfPrefs, saveShelfPrefs, type ShelfPrefs } from "@/lib/study-room/shelf-prefs";
import type { Book } from "@/lib/reading-types";
import { StudyRoomShelf3D } from "./study-room-shelf3d";
import { StudyRoomBookDetail } from "./study-room-book-detail";

type StudyRoomShelfProps = {
  onOpenBook: (book: Book, chapterIndex?: number, paragraphIndex?: number) => void;
  onOpenMessages: () => void;
  returnFromBookId?: string | null;
};

type ImportState =
  | { status: "idle" }
  | { status: "running"; label: string }
  | { status: "error"; message: string };

const SORT_OPTIONS: Array<{ value: ShelfSort; label: string }> = [
  { value: "import", label: "导入顺序" },
  { value: "recent", label: "最近阅读" },
  { value: "manual", label: "手动排序" },
];

/** 从阅读器回来后，书先以抽出姿态停留片刻再放回架上 */
const RETURN_HOLD_MS = 420;

export function StudyRoomShelf({ onOpenBook, onOpenMessages, returnFromBookId }: StudyRoomShelfProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [lastReadAt, setLastReadAt] = useState<Record<string, string>>({});
  const [prefs, setPrefs] = useState<ShelfPrefs>(() => loadShelfPrefs());
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const [activeId, setActiveId] = useState<string | null>(returnFromBookId ?? null);
  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setBooks(loadBooks());
    const all = await loadAllProgress().catch(() => []);
    setLastReadAt(Object.fromEntries(all.filter((p) => p.lastReadAt).map((p) => [p.bookId, p.lastReadAt])));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 从阅读器返回：保持抽出一小会儿，然后归位
  useEffect(() => {
    if (!returnFromBookId) return;
    // 先把这本书设为「已抽出」，停留一小会儿后自然归位（书架的抽出/归位动画本身由 transitionend 驱动）
    setActiveId((id) => (id === returnFromBookId ? id : returnFromBookId));
    const timer = window.setTimeout(() => setActiveId((id) => (id === returnFromBookId ? null : id)), RETURN_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [returnFromBookId]);

  const sorted = useMemo(
    () => sortShelfBooks(books, prefs.sort, { manualOrder: prefs.manualOrder, lastReadAt }),
    [books, prefs, lastReadAt],
  );

  const updatePrefs = (next: ShelfPrefs) => {
    setPrefs(next);
    saveShelfPrefs(next);
  };

  const changeSort = (sort: ShelfSort) => {
    // 切到手动时以当前看到的顺序为起点，避免书突然跳位
    const manualOrder = sort === "manual" ? sorted.map((b) => b.id) : prefs.manualOrder;
    updatePrefs({ sort, manualOrder });
  };

  const moveBook = (book: Book, delta: -1 | 1) => {
    const base = sorted.map((b) => b.id);
    updatePrefs({ ...prefs, manualOrder: moveInOrder(base, book.id, delta) });
  };

  const closeDetail = () => {
    setDetailBook(null);
    setActiveId(null);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportState({ status: "running", label: "正在解析文件…" });
    try {
      await importBookFromBlob(file, file.name, (stage) => setImportState({ status: "running", label: stage }));
      setImportState({ status: "idle" });
      await refresh();
    } catch (err) {
      console.error("[StudyRoom] import failed:", err);
      setImportState({
        status: "error",
        message: err instanceof UnsupportedBookFormatError ? err.message : "导入失败，请确认文件未损坏后重试。",
      });
    }
  };

  const handleDelete = async (book: Book) => {
    if (!confirm(`确定从书架移除《${book.title}》吗？该书的阅读进度、书签与笔记会一并删除。`)) return;
    closeDetail();
    await deleteBook(book.id);
    await refresh();
  };

  return (
    <div className="sr-shelf-root">
      <div className="sr-actions">
        <button
          type="button"
          className="sr-btn sr-btn-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={importState.status === "running"}
        >
          <BookPlus size={18} strokeWidth={1.7} />
          {importState.status === "running" ? importState.label : "导入本地书"}
        </button>
        <input ref={fileInputRef} type="file" accept=".txt,.epub,.pdf" hidden onChange={handleFile} />
        {books.length > 1 && (
          <div className="sr-sort" role="radiogroup" aria-label="书架排序">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={prefs.sort === opt.value}
                data-active={prefs.sort === opt.value ? "true" : undefined}
                onClick={() => changeSort(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {importState.status === "error" && (
        <div className="sr-note-card" style={{ borderColor: "var(--c-danger)" }}>
          <div className="sr-note-meta" style={{ color: "var(--c-danger)" }}>{importState.message}</div>
        </div>
      )}

      {books.length === 0 ? (
        <div className="sr-empty">
          <Library3D />
          <p>
            书架还是空的。
            <br />
            导入一本本地 TXT / EPUB / PDF 开始阅读；
            <br />
            联网找书在「书城」中提供。
          </p>
          <button type="button" className="sr-btn sr-btn-primary" onClick={() => fileInputRef.current?.click()}>
            <BookPlus size={16} strokeWidth={1.8} />
            导入书籍
          </button>
        </div>
      ) : (
        <StudyRoomShelf3D
          books={sorted}
          activeId={activeId}
          restoreOutId={returnFromBookId}
          onSelect={(book) => {
            // 再点已抽出的书：放回去
            if (activeId === book.id) closeDetail();
            else {
              setDetailBook(null);
              setActiveId(book.id);
            }
          }}
          onPulled={(book) => setDetailBook(book)}
        />
      )}

      {detailBook && (
        <StudyRoomBookDetail
          book={detailBook}
          onClose={closeDetail}
          onRead={(book, chapterIndex, paragraphIndex) => onOpenBook(book, chapterIndex, paragraphIndex)}
          onOpenMessages={onOpenMessages}
          onRemove={handleDelete}
          onMove={prefs.sort === "manual" ? (delta) => moveBook(detailBook, delta) : undefined}
        />
      )}
    </div>
  );
}

function Library3D() {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
      <rect x="3" y="3" width="4.5" height="18" rx="0.8" />
      <rect x="8.5" y="6" width="4.5" height="15" rx="0.8" />
      <rect x="14" y="3.6" width="4.5" height="17.4" rx="0.8" />
      <path d="M3 21h18" />
    </svg>
  );
}
