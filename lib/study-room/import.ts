// lib/study-room/import.ts — 书房统一的书籍导入：本地文件与联网下载共用同一条路径。

import {
  addBook,
  deleteBook,
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

export class UnsupportedBookFormatError extends Error {
  constructor() {
    super("暂只支持 TXT / EPUB / PDF 文件");
  }
}

type ParsedLike = {
  title: string;
  author?: string;
  chapters: Array<{ title: string; paragraphs: string[] }>;
  totalPages?: number;
};

/** 从任意 Blob/File 导入一本书到书架，返回落库后的书。cover 为在线来源提供的真实封面。 */
export async function importBookFromBlob(
  blob: Blob,
  fileName: string,
  onProgress?: (stage: string) => void,
  cover?: string,
): Promise<Book> {
  const ext = fileName.split(".").pop()?.toLowerCase();
  let parsed: ParsedLike;
  let format: Book["format"];
  let rawFile: Blob | null = null;

  if (ext === "txt") {
    onProgress?.("正在解析 TXT…");
    const config = loadReadingInteractionConfig();
    const { text } = decodeTxtArrayBuffer(await blob.arrayBuffer(), config.txtEncoding);
    parsed = parseTxtContent(text, fileName, config.paragraphMode);
    format = "txt";
  } else if (ext === "epub") {
    onProgress?.("正在解析 EPUB…");
    parsed = await parseEpubFile(await blob.arrayBuffer(), fileName);
    format = "epub";
  } else if (ext === "pdf") {
    rawFile = blob;
    parsed = {
      title: fileName.replace(/\.[^.]+$/, "") || "未命名",
      chapters: [{ title: `第1-${PDF_PAGES_PER_CHAPTER}页`, paragraphs: [] }],
      totalPages: 0,
    };
    format = "pdf";
  } else {
    throw new UnsupportedBookFormatError();
  }

  const bookId = `book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const book: Book = {
    id: bookId,
    title: parsed.title || fileName,
    author: parsed.author,
    format,
    totalChapters: parsed.chapters.length,
    createdAt: new Date().toISOString(),
    cover: cover || undefined,
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

  onProgress?.("正在写入书架…");
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
  return book;
}
