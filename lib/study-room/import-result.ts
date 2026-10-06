// lib/study-room/import-result.ts — 把书城里的一条结果加入书架（详情页、抽一本共用）。
//
//  - 内置书库：读随应用部署的整理好的正文；
//  - 联网来源：书房自己的接口（维基文库正文）直接请求，外部文件走服务端代理；
//  - 去重：同一来源链接的书已经在书架上，就直接打开那一本，不再新建一份。

import { addBook, loadBooks, saveChapters } from "@/lib/reading-storage";
import type { Book } from "@/lib/reading-types";

import type { BookSearchResult } from "./book-source";
import { BUILTIN_SOURCE_LABEL, loadBuiltinBook, toBookChapters } from "./builtin-library";
import { importBookFromBlob } from "./import";

export class SourceImportError extends Error {}

function sameSource(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const norm = (url: string) => {
    try {
      return decodeURI(url).replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  };
  return norm(a) === norm(b);
}

/** 书架上来源相同的书（同一来源链接视为同一本）。 */
export function findShelfBookBySource(sourceUrl: string): Book | undefined {
  return loadBooks().find((book) => sameSource(book.sourceUrl, sourceUrl));
}

async function importBuiltin(item: BookSearchResult, onProgress?: (stage: string) => void): Promise<Book> {
  const { manifest, chapters } = await loadBuiltinBook(item.importFile!.url, onProgress);
  const bookId = `book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const book: Book = {
    id: bookId,
    title: manifest.title,
    author: manifest.author,
    format: "txt",
    totalChapters: chapters.length,
    createdAt: new Date().toISOString(),
    description: `${manifest.edition}。${manifest.license}`,
    tags: ["内置书库"],
    sourceLabel: `${BUILTIN_SOURCE_LABEL} · ${manifest.source.name}`,
    sourceUrl: manifest.source.url,
  };
  onProgress?.("正在写入书架…");
  await addBook(book);
  await saveChapters(bookId, toBookChapters(bookId, chapters));
  return book;
}

/** 联网接口失败时把服务端给的原因带出来（如维基文库限流、篇数太多），不统一说「没有这本书」。 */
async function responseError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (data?.error) return data.error;
  if (response.status === 429 || response.status === 503) return "来源暂时限流，请稍后再试";
  if (response.status === 504) return "来源响应超时，请稍后再试";
  return `来源返回错误（${response.status}），请稍后再试`;
}

async function importNetwork(item: BookSearchResult, onProgress?: (stage: string) => void): Promise<Book> {
  const file = item.importFile!;
  // 书房自己的接口（如维基文库正文）直接用相对地址；外部来源走服务端代理
  const url = file.url.startsWith("/") ? file.url : `/api/study-room/fetch?url=${encodeURIComponent(file.url)}`;
  onProgress?.("正在取正文…");
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new SourceImportError("网络连接失败，请检查网络后再试");
  }
  if (!response.ok) throw new SourceImportError(await responseError(response));
  const blob = await response.blob();
  return importBookFromBlob(blob, `${item.title}.${file.format}`, onProgress, item.cover, {
    sourceLabel: item.sourceLabel,
    sourceUrl: item.externalUrl,
    description: item.description,
  });
}

/**
 * 加入书架。已在书架（同一来源）时返回原来那本，existed=true。
 * 失败时抛 SourceImportError（带可直接展示的原因）或 UnsupportedBookFormatError。
 */
export async function importSearchResult(
  item: BookSearchResult,
  onProgress?: (stage: string) => void,
): Promise<{ book: Book; existed: boolean }> {
  if (!item.importFile) throw new SourceImportError("这本书没有可导入的正文");
  const existing = findShelfBookBySource(item.externalUrl);
  if (existing) return { book: existing, existed: true };
  if (item.importFile.format === "builtin") {
    try {
      return { book: await importBuiltin(item, onProgress), existed: false };
    } catch (error) {
      throw new SourceImportError(error instanceof Error ? error.message : "内置书库读取失败");
    }
  }
  return { book: await importNetwork(item, onProgress), existed: false };
}
