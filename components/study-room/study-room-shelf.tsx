"use client";

import { useEffect, useRef, useState } from "react";
import { BookPlus } from "lucide-react";

import {
  addBook,
  deleteBook,
  loadBooks,
  loadReadingInteractionConfig,
  saveChapters,
  saveRawFile,
} from "@/lib/reading-storage";
import {
  decodeTxtArrayBuffer,
  parseEpubFile,
  parseTxtContent,
  PDF_PAGES_PER_CHAPTER,
} from "@/lib/reading-parser";
import type { Book, BookChapter } from "@/lib/reading-types";
import { StudyRoomShelf3D } from "./study-room-shelf3d";

type StudyRoomShelfProps = {
  onOpenBook: (book: Book) => void;
};

type ImportState =
  | { status: "idle" }
  | { status: "running"; label: string }
  | { status: "error"; message: string };

export function StudyRoomShelf({ onOpenBook }: StudyRoomShelfProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setBooks(loadBooks());
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "txt" && ext !== "epub" && ext !== "pdf") {
      setImportState({ status: "error", message: "暂只支持 TXT / EPUB / PDF 文件。" });
      return;
    }

    setImportState({ status: "running", label: "正在解析文件…" });
    try {
      let parsed: { title: string; author?: string; chapters: Array<{ title: string; paragraphs: string[] }>; totalPages?: number };
      let format: Book["format"];
      let rawFile: Blob | null = null;

      if (ext === "txt") {
        const config = loadReadingInteractionConfig();
        const { text } = decodeTxtArrayBuffer(await file.arrayBuffer(), config.txtEncoding);
        parsed = parseTxtContent(text, file.name, config.paragraphMode);
        format = "txt";
      } else if (ext === "epub") {
        parsed = await parseEpubFile(await file.arrayBuffer(), file.name);
        format = "epub";
      } else {
        rawFile = file;
        parsed = {
          title: file.name.replace(/\.[^.]+$/, "") || "未命名",
          chapters: [{ title: `第1-${PDF_PAGES_PER_CHAPTER}页`, paragraphs: [] }],
          totalPages: 0,
        };
        format = "pdf";
      }

      const bookId = `book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const book: Book = {
        id: bookId,
        title: parsed.title || file.name,
        author: parsed.author,
        format,
        totalChapters: parsed.chapters.length,
        createdAt: new Date().toISOString(),
      };

      const chapters: BookChapter[] = parsed.chapters.map((chapter, index) => {
        if (format === "pdf") {
          const pageStart = index * PDF_PAGES_PER_CHAPTER + 1;
          const totalPages = parsed.totalPages ?? pageStart + PDF_PAGES_PER_CHAPTER - 1;
          return {
            id: `${bookId}_ch${index}`,
            bookId,
            index,
            title: chapter.title,
            paragraphs: [],
            pageStart,
            pageEnd: Math.min(pageStart + PDF_PAGES_PER_CHAPTER - 1, totalPages),
          };
        }
        return { id: `${bookId}_ch${index}`, bookId, index, title: chapter.title, paragraphs: chapter.paragraphs };
      });

      setImportState({ status: "running", label: "正在写入书架…" });
      await addBook(book);
      await saveChapters(bookId, chapters);
      if (rawFile) {
        try {
          await saveRawFile(bookId, rawFile);
        } catch (err) {
          await deleteBook(bookId).catch(() => undefined);
          throw err;
        }
      }

      setImportState({ status: "idle" });
      await refresh();
    } catch (err) {
      console.error("[StudyRoom] import failed:", err);
      setImportState({ status: "error", message: "导入失败，请确认文件未损坏后重试。" });
    }
  };

  const handleDelete = async (book: Book) => {
    if (!confirm(`确定从书架移除《${book.title}》吗？该书的阅读进度和批注会一并删除。`)) return;
    await deleteBook(book.id);
    await refresh();
  };

  return (
    <div>
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.epub,.pdf"
          hidden
          onChange={handleFile}
        />
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
        </div>
      ) : (
        <StudyRoomShelf3D books={books} onOpenBook={onOpenBook} onRemoveBook={handleDelete} />
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
