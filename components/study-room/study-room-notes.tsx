"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, StickyNote } from "lucide-react";

import { loadAllAnnotations, loadBooks } from "@/lib/reading-storage";
import type { ReadingAnnotation } from "@/lib/reading-types";

type StudyRoomNotesProps = {
  onBack: () => void;
};

export function StudyRoomNotes({ onBack }: StudyRoomNotesProps) {
  const [annotations, setAnnotations] = useState<ReadingAnnotation[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [annots] = await Promise.all([loadAllAnnotations()]);
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const book of loadBooks()) map[book.id] = book.title;
      setTitles(map);
      setAnnotations(annots);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
            <span className="sr-header-sub">摘录与批注</span>
          </div>
          <span style={{ width: 40 }} />
        </div>
      </header>

      <div className="sr-body">
        <div className="sr-tab-pane">
          {annotations === null ? (
            <div className="sr-empty">
              <p>正在载入笔记…</p>
            </div>
          ) : annotations.length === 0 ? (
            <div className="sr-empty">
              <StickyNote size={42} strokeWidth={1} />
              <p>
                还没有笔记。
                <br />
                阅读时留下的摘录与批注会汇总到这里，
                <br />
                并按书分组。
              </p>
            </div>
          ) : (
            annotations.map((note) => (
              <div key={note.id} className="sr-note-card">
                <p className="sr-note-quote">{note.content}</p>
                <div className="sr-note-meta">
                  {titles[note.bookId] ?? "未知书籍"} · 第 {note.chapterIndex + 1} 章
                  {note.characterName ? ` · ${note.characterName}` : ""} ·{" "}
                  {new Date(note.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
