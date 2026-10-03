"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { loadChapters, loadProgress, saveProgress } from "@/lib/reading-storage";
import type { Book, BookChapter } from "@/lib/reading-types";

type StudyRoomReaderProps = {
  book: Book;
  onBack: () => void;
};

export function StudyRoomReader({ book, onBack }: StudyRoomReaderProps) {
  const [chapters, setChapters] = useState<BookChapter[] | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [chs, progress] = await Promise.all([loadChapters(book.id), loadProgress(book.id)]);
      if (cancelled) return;
      setChapters(chs);
      const startIndex = Math.min(Math.max(progress?.chapterIndex ?? 0, 0), Math.max(chs.length - 1, 0));
      restoreRef.current = progress?.scrollPosition ?? 0;
      setChapterIndex(startIndex);
    })();
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  const chapter = chapters && chapters.length > 0 ? chapters[Math.min(chapterIndex, chapters.length - 1)] : null;

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !chapter) return;
    const target = restoreRef.current;
    restoreRef.current = null;
    if (target && chapterIndex > 0) {
      body.scrollTop = body.scrollHeight * target;
    } else {
      body.scrollTop = 0;
    }
  }, [chapterIndex, chapter]);

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

  const total = chapters?.length ?? 0;
  const progressPct = total > 0 ? ((chapterIndex + 1) / total) * 100 : 0;
  const isPdf = book.format === "pdf";

  const paragraphs = useMemo(() => (chapter && !isPdf ? chapter.paragraphs : []), [chapter, isPdf]);

  return (
    <div className="sr-reader">
      <header className="sr-reader-header">
        <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回书架">
          <ChevronLeft size={22} strokeWidth={1.6} />
        </button>
        <div className="sr-reader-title">{book.title}</div>
        <span style={{ width: 40 }} />
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
            <p>
              PDF 的原生分页阅读在后续阶段接入书房阅读器。
              <br />
              当前阶段书房只提供 TXT / EPUB 的正文阅读。
            </p>
          </div>
        ) : (
          <>
            {chapter && <h2 className="sr-chapter-title">{chapter.title}</h2>}
            {paragraphs.map((para, index) => (
              <p key={index} className="sr-para">
                {para}
              </p>
            ))}
          </>
        )}
      </div>

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
