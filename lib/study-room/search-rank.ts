// lib/study-room/search-rank.ts — 搜索结果的去噪、分类约束与排序（纯函数，便于验证）。
//
// 书城搜索的口径都收在这里：
//  - 只有标题或作者命中关键词的条目才算「搜到了这本书」，正文里碰巧出现关键词的不进列表；
//  - 分类真正约束来源（选「小说」时法律判决、公告等资料类不出现在结果里）；
//  - 排序先看匹配强度，再看可读性（能直接在书房读的排前面）。

import {
  authorMatchScore,
  titleMatchScore,
  type BookKind,
  type BookSearchResult,
  type SearchFailure,
} from "./book-source";

/**
 * 结果与检索词列表的最佳匹配。terms[0] 是用户原词，后面是别名扩展词；
 * 别名命中的结果（如「简爱」→ Jane Eyre）同样要保留，但排在原词命中之后。
 */
function bestMatch(result: BookSearchResult, terms: string[]): { match: "title" | "author"; score: number } | null {
  if (result.match) {
    const score = result.match === "author" ? 40 : 45;
    return { match: result.match, score };
  }
  let best: { match: "title" | "author"; score: number } | null = null;
  terms.forEach((term, index) => {
    // 直接用用户原词命中的排在别名命中之前
    const priority = index === 0 ? 4 : 0;
    const title = titleMatchScore(result.title, term);
    const author = authorMatchScore(result.authors, term);
    if (title > 0 && (!best || title + priority > best.score)) best = { match: "title", score: title + priority };
    if (author > 0 && (!best || author + priority > best.score)) best = { match: "author", score: author + priority };
  });
  return best;
}

/** 同一 id 只出现一次；不同来源的同名书保留（可读性与跳转不同）。 */
export function dedupeById(results: BookSearchResult[]): BookSearchResult[] {
  const seen = new Set<string>();
  const out: BookSearchResult[] = [];
  for (const item of results) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * 类别约束：
 *  - 小说：剔除被判为资料的条目（法律判决、公告等不再占据小说结果）
 *  - 漫画：只保留漫画来源
 *  - 资料：全部保留
 */
export function filterByKind(results: BookSearchResult[], kind: BookKind | "all"): BookSearchResult[] {
  if (kind === "novel") return results.filter((r) => r.kind !== "material");
  if (kind === "comic") return results.filter((r) => r.kind === "comic");
  return results;
}

function scoreOf(result: BookSearchResult, terms: string[]): number {
  const best = bestMatch(result, terms);
  if (!best) return 0;
  // 能直接读的排前面：这是用户下一步最想点的
  const readability = result.readability === "readable" ? 8 : result.readability === "preview" ? 4 : 0;
  return best.score + readability;
}

/** 去噪 → 分类约束 → 排序 → 去重限量。terms[0] 为用户原词，其后为别名扩展词。 */
export function rankResults(
  results: BookSearchResult[],
  terms: string[],
  kind: BookKind | "all",
  max = 40,
): BookSearchResult[] {
  const ordered = filterByKind(results, kind)
    .map((item, index) => ({ item, index, score: scoreOf(item, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
  return dedupeById(ordered).slice(0, max);
}

/** 同一来源只报一条失败原因。 */
export function dedupeFailures(failed: SearchFailure[]): SearchFailure[] {
  const seen = new Map<string, SearchFailure>();
  for (const item of failed) if (!seen.has(item.id)) seen.set(item.id, item);
  return Array.from(seen.values());
}
