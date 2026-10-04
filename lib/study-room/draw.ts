// lib/study-room/draw.ts — 「抽一本」的分类与候选书来源。
//
// 只从「真的能读」的地方抽：用户书架里已导入的书，或者书城来源里确实可导入 /
// 可预览的书。抽不到可读的书时如实说明，不摆一堆只有封面的空结果。

import { loadBooks } from "@/lib/reading-storage";
import type { Book } from "@/lib/reading-types";
import type { BookSearchResult } from "./book-source";

export type DrawCategory = {
  id: string;
  label: string;
  /** 抽到之后用来检索的查询词 */
  queries: string[];
  /** 用来匹配书架藏书的标签 / 关键词 */
  tags: string[];
  /** 检索时偏好的分类 */
  kind: "novel" | "comic" | "all";
};

export const DRAW_CATEGORIES: DrawCategory[] = [
  { id: "mystery", label: "悬疑", queries: ["悬疑 推理", "侦探 小说"], tags: ["悬疑", "推理", "侦探", "犯罪"], kind: "novel" },
  { id: "healing", label: "治愈", queries: ["治愈 生活", "温情 随笔"], tags: ["治愈", "温情", "生活", "日常"], kind: "novel" },
  { id: "romance", label: "爱情", queries: ["爱情 小说", "言情"], tags: ["爱情", "言情", "恋爱"], kind: "novel" },
  { id: "fantasy", label: "奇幻", queries: ["奇幻 小说", "魔幻 冒险"], tags: ["奇幻", "魔幻", "冒险"], kind: "novel" },
  { id: "classic", label: "经典", queries: ["世界名著", "经典 文学"], tags: ["经典", "名著", "文学"], kind: "novel" },
  { id: "history", label: "历史", queries: ["历史", "中国历史"], tags: ["历史", "史书", "传记"], kind: "all" },
  { id: "scifi", label: "科幻", queries: ["科幻 小说", "科幻 短篇"], tags: ["科幻", "未来", "太空"], kind: "novel" },
  { id: "comic", label: "漫画", queries: ["漫画"], tags: ["漫画", "连环画"], kind: "comic" },
  { id: "short", label: "短篇", queries: ["短篇小说", "短篇集"], tags: ["短篇", "小说集", "散文"], kind: "novel" },
  { id: "nonfiction", label: "非虚构", queries: ["非虚构", "纪实 文学"], tags: ["非虚构", "纪实", "科普", "自然"], kind: "all" },
];

export function drawCategory(random = Math.random): DrawCategory {
  return DRAW_CATEGORIES[Math.floor(random() * DRAW_CATEGORIES.length)] ?? DRAW_CATEGORIES[0];
}

export function categoryById(id: string): DrawCategory | null {
  return DRAW_CATEGORIES.find((item) => item.id === id) ?? null;
}

/** 候选书：来源书架或书城，都必须真的能读（或能导入 / 能预览）。 */
export type DrawCandidate = {
  id: string;
  title: string;
  author?: string;
  cover?: string;
  description?: string;
  /** shelf = 已在书架；import = 可导入；preview = 可预览 */
  availability: "shelf" | "import" | "preview";
  sourceLabel?: string;
  year?: string;
  /** 书架藏书直接带着书本对象 */
  book?: Book;
  /** 书城结果带着导入文件信息 */
  importFile?: { url: string; format: "txt" | "epub" };
  externalUrl?: string;
  /** 原始来源结果：点「查看详情」时复用统一详情页 */
  raw?: BookSearchResult;
};

function matchesCategory(book: Book, category: DrawCategory): boolean {
  const haystack = [book.title, book.description ?? "", book.author ?? "", ...(book.tags ?? [])].join(" ").toLowerCase();
  return category.tags.some((tag) => haystack.includes(tag));
}

/** 书架里符合这一类别的藏书（含标签 / 简介匹配）。 */
export function shelfCandidates(category: DrawCategory): DrawCandidate[] {
  return loadBooks()
    .filter((book) => matchesCategory(book, category))
    .map<DrawCandidate>((book) => ({
      id: `shelf:${book.id}`,
      title: book.title,
      author: book.author,
      cover: book.cover,
      description: book.description,
      availability: "shelf",
      sourceLabel: "我的书架",
      book,
    }));
}

/** 把书城搜索结果转成候选（只留下可导入或可预览的）。 */
export function toCandidates(results: BookSearchResult[]): DrawCandidate[] {
  const out: DrawCandidate[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    const key = `${item.title}|${item.authors[0] ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    if (item.importFile) {
      seen.add(key);
      out.push({
        id: item.id,
        title: item.title,
        author: item.authors[0],
        cover: item.cover,
        description: item.description,
        availability: "import",
        sourceLabel: item.sourceLabel,
        year: item.year,
        importFile: item.importFile,
        externalUrl: item.externalUrl,
        raw: item,
      });
      continue;
    }
    if (item.readability === "preview" && item.kind !== "material") {
      seen.add(key);
      out.push({
        id: item.id,
        title: item.title,
        author: item.authors[0],
        cover: item.cover,
        description: item.description,
        availability: "preview",
        sourceLabel: item.sourceLabel,
        year: item.year,
        externalUrl: item.externalUrl,
        raw: item,
      });
    }
  }
  return out;
}

/** 调用书房自己的搜索接口取候选（服务端已做去噪、分类与缓存）。 */
export async function fetchCandidates(category: DrawCategory, signal?: AbortSignal): Promise<DrawCandidate[]> {
  const collected: DrawCandidate[] = [];
  for (const query of category.queries.slice(0, 2)) {
    try {
      const response = await fetch(
        `/api/study-room/search?q=${encodeURIComponent(query)}&kind=${category.kind}`,
        signal ? { signal } : undefined,
      );
      if (!response.ok) continue;
      const data = (await response.json()) as { results?: BookSearchResult[] };
      collected.push(...toCandidates(data.results ?? []));
    } catch {
      // 单个查询失败不影响其它查询；整体为空时由界面如实说明
    }
    if (collected.length >= 8) break;
  }
  const seen = new Set<string>();
  return collected.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true))).slice(0, 12);
}

/** 抽一本：书架优先，其次是可导入的，最后是可预览的。 */
export async function drawBooks(category: DrawCategory, count = 3, signal?: AbortSignal): Promise<DrawCandidate[]> {
  const shelf = shelfCandidates(category);
  const remote = await fetchCandidates(category, signal);
  const pool = [...shelf, ...remote.filter((item) => item.availability !== "shelf")];
  const seen = new Set<string>();
  const unique = pool.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // 洗牌但保留「书架优先」：先随机，再按可用性排序
  const shuffled = [...unique].sort(() => Math.random() - 0.5);
  const rank = { shelf: 0, import: 1, preview: 2 } as const;
  shuffled.sort((a, b) => rank[a.availability] - rank[b.availability]);
  return shuffled.slice(0, count);
}
