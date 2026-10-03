// lib/study-room/providers.ts — 服务端书源提供者（仅服务器运行）。
// 通过站点自己的路由调用，避免浏览器 CORS 与密钥泄露；不包含任何私有密钥。

import type { BookSearchResult, BookKind, SourceSearchParams } from "./book-source";
import { hasCJK } from "./book-source";

const UA = "LinH-Float-StudyRoom/1.0 (book search; contact: site owner)";

type Provider = {
  id: string;
  label: string;
  search: (params: SourceSearchParams, signal: AbortSignal) => Promise<BookSearchResult[]>;
};

async function getJson(url: string, signal: AbortSignal, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": UA, Accept: "application/json", ...headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// ── Open Library ──

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  language?: string[];
};

const openLibrary: Provider = {
  id: "openlibrary",
  label: "Open Library",
  async search({ query, kind, limit }, signal) {
    if (kind === "comic") return [];
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=key,title,author_name,first_publish_year,cover_i,language`;
    const data = (await getJson(url, signal)) as { docs?: OpenLibraryDoc[] };
    const docs = Array.isArray(data.docs) ? data.docs : [];
    return docs
      .filter((doc) => doc.key && doc.title)
      .map<BookSearchResult>((doc) => ({
        id: `openlibrary:${doc.key}`,
        sourceId: "openlibrary",
        sourceLabel: "Open Library",
        title: doc.title as string,
        authors: doc.author_name ?? [],
        cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
        year: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        language: doc.language?.[0],
        kind: "novel",
        readability: "external",
        externalUrl: `https://openlibrary.org${doc.key}`,
        workKey: doc.title ? `ol:${doc.title.toLowerCase()}` : undefined,
      }));
  },
};

// ── Google Books ──

type GoogleVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    language?: string;
    description?: string;
    imageLinks?: { thumbnail?: string };
  };
  accessInfo?: { viewability?: string; previewLink?: string; webReaderLink?: string };
};

const googleBooks: Provider = {
  id: "googlebooks",
  label: "Google Books",
  async search({ query, limit }, signal) {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${Math.min(limit, 40)}&printType=books`;
    const data = (await getJson(url, signal)) as { items?: GoogleVolume[] };
    const items = Array.isArray(data.items) ? data.items : [];
    return items
      .filter((item) => item.id && item.volumeInfo?.title)
      .map<BookSearchResult>((item) => {
        const info = item.volumeInfo!;
        const access = item.accessInfo ?? {};
        const viewable = access.viewability === "ALL_PAGES" || access.viewability === "PARTIAL";
        const thumb = info.imageLinks?.thumbnail?.replace(/^http:/, "https:");
        return {
          id: `googlebooks:${item.id}`,
          sourceId: "googlebooks",
          sourceLabel: "Google Books",
          title: info.title as string,
          authors: info.authors ?? [],
          cover: thumb,
          year: info.publishedDate?.slice(0, 4),
          language: info.language,
          kind: "novel",
          readability: viewable ? "preview" : "external",
          externalUrl: access.webReaderLink || access.previewLink || `https://books.google.com/books?id=${item.id}`,
          description: info.description?.slice(0, 180),
          workKey: info.title ? `gb:${info.title.toLowerCase()}` : undefined,
        };
      });
  },
};

// ── Project Gutenberg（可下载，导入书房后离线阅读）──

type GutendexBook = {
  id?: number;
  title?: string;
  authors?: { name?: string }[];
  languages?: string[];
  subjects?: string[];
  formats?: Record<string, string>;
};

const gutendex: Provider = {
  id: "gutenberg",
  label: "Project Gutenberg",
  async search({ query, kind, limit }, signal) {
    if (kind === "comic") return [];
    const url = `https://gutendex.com/books/?search=${encodeURIComponent(query)}`;
    const data = (await getJson(url, signal)) as { results?: GutendexBook[] };
    const results = Array.isArray(data.results) ? data.results : [];
    return results
      .filter((book) => book.id && book.title)
      .slice(0, limit)
      .map<BookSearchResult>((book) => {
        const formats = book.formats ?? {};
        const epub = formats["application/epub+zip"];
        const txt = Object.entries(formats).find(([type]) => type.startsWith("text/plain"))?.[1];
        const importFile = epub
          ? { url: epub, format: "epub" as const }
          : txt
            ? { url: txt, format: "txt" as const }
            : undefined;
        return {
          id: `gutenberg:${book.id}`,
          sourceId: "gutenberg",
          sourceLabel: "Project Gutenberg",
          title: book.title as string,
          authors: (book.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
          cover: formats["image/jpeg"],
          language: book.languages?.[0],
          kind: "novel",
          readability: importFile ? "readable" : "external",
          externalUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
          description: book.subjects?.slice(0, 3).join(" · "),
          importFile,
          workKey: book.title ? `gut:${book.title.toLowerCase()}` : undefined,
        };
      });
  },
};

// ── 中文维基文库（公版中文文本，跳转原站阅读）──

type WikiSearchItem = { title?: string; snippet?: string };

const wikisource: Provider = {
  id: "wikisource",
  label: "中文维基文库",
  async search({ query, limit }, signal) {
    const url = `https://zh.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
    const data = (await getJson(url, signal)) as { query?: { search?: WikiSearchItem[] } };
    const items = data.query?.search ?? [];
    return items
      .filter((item) => item.title)
      .map<BookSearchResult>((item) => ({
        id: `wikisource:${item.title}`,
        sourceId: "wikisource",
        sourceLabel: "中文维基文库",
        title: item.title as string,
        authors: [],
        kind: "material",
        readability: "external",
        externalUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(item.title as string)}`,
        description: item.snippet?.replace(/<[^>]+>/g, "").slice(0, 120),
      }));
  },
};

const ALL: Provider[] = [openLibrary, googleBooks, gutendex, wikisource];

/** 中文查询优先中文来源，避免英文来源占满结果。 */
function providersFor(query: string, kind: BookKind | "all"): Provider[] {
  if (!hasCJK(query)) return ALL;
  return kind === "material"
    ? [wikisource, googleBooks, openLibrary]
    : [wikisource, gutendex, googleBooks, openLibrary];
}

/**
 * 并行查询所有适用书源。单个来源失败不影响其他来源，
 * 每个来源的错误以 source 维度回报，便于前端提示。
 */
export async function searchAllSources(
  params: SourceSearchParams,
): Promise<{ results: BookSearchResult[]; failed: string[] }> {
  const providers = providersFor(params.query, params.kind);
  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const items = await provider.search(params, controller.signal);
        return { id: provider.id, items };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const results: BookSearchResult[] = [];
  const failed: string[] = [];
  settled.forEach((entry, index) => {
    if (entry.status === "fulfilled") {
      results.push(...entry.value.items);
    } else {
      failed.push(providers[index].id);
    }
  });

  return { results, failed };
}
