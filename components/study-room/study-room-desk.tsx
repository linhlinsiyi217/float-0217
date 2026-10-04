"use client";

import { useEffect, useState } from "react";
import { Bookmark, StickyNote, NotebookPen } from "lucide-react";

import { CreativePanel } from "./study-room-creative-panel";

import { loadAllBookmarks, loadAllNotes, loadBooks } from "@/lib/reading-storage";
import type { Book, ReadingBookmark } from "@/lib/reading-types";

type StudyRoomDeskProps = {
  /** 打开某个创作草稿（写作界面在独立页面） */
  onOpenDraft: (draftId: string) => void;
  /** 资料盒里的两个入口 */
  onOpenNotes: () => void;
  onOpenWishlist: () => void;
};

export function StudyRoomDesk({ onOpenDraft, onOpenNotes, onOpenWishlist }: StudyRoomDeskProps) {
  const [bookmarks, setBookmarks] = useState<ReadingBookmark[] | null>(null);
  const [noteCount, setNoteCount] = useState(0);
  const [books, setBooks] = useState<Record<string, Book>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [marks, notes] = await Promise.all([loadAllBookmarks(), loadAllNotes()]);
      if (cancelled) return;
      const bookMap: Record<string, Book> = {};
      for (const book of loadBooks()) bookMap[book.id] = book;
      setBooks(bookMap);
      setBookmarks(marks);
      setNoteCount(notes.length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasContent = (bookmarks?.length ?? 0) > 0 || noteCount > 0;

  return (
    <div>
      <CreativePanel onOpenDraft={onOpenDraft} onOpenNotes={onOpenNotes} onOpenWishlist={onOpenWishlist} />

      <div className="sr-section-label" style={{ marginTop: 18 }}>阅读留下的东西</div>

      {!hasContent && (
        <div className="sr-empty" style={{ paddingTop: 24 }}>
          <NotebookPen size={42} strokeWidth={1} />
          <p>
            书桌整理阅读时留下的东西：
            <br />
            书签、书摘、批注与共读记录。
            <br />
            阅读中产生的内容会自动出现在这里。
          </p>
        </div>
      )}

      {hasContent && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div className="sr-note-card" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
            <StickyNote size={20} strokeWidth={1.5} color="var(--c-icon)" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{noteCount}</div>
              <div className="sr-note-meta">书摘与批注</div>
            </div>
          </div>
          <div className="sr-note-card" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
            <Bookmark size={20} strokeWidth={1.5} color="var(--c-icon)" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{bookmarks?.length ?? 0}</div>
              <div className="sr-note-meta">阅读书签</div>
            </div>
          </div>
        </div>
      )}

      {bookmarks && bookmarks.length > 0 && (
        <>
          <div className="sr-section-label">最近的阅读书签</div>
          {bookmarks.slice(0, 8).map((mark) => (
            <div key={mark.id} className="sr-note-card">
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--c-text-title)" }}>
                {books[mark.bookId]?.title ?? "未知书籍"} · 第 {mark.chapterIndex + 1} 章
              </div>
              <div className="sr-note-meta" style={{ marginTop: 4 }}>
                {new Date(mark.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
