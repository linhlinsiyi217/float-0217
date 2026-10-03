// app/api/study-room/search/route.ts — 书房书城：统一联网搜书入口。
// 所有外部请求都在服务端发起（避免浏览器 CORS），不包含任何私钥。

import { NextResponse } from "next/server";

import { searchAllSources } from "@/lib/study-room/providers";
import { normalizeQuery, toSimplified, type BookKind, type BookSearchResult } from "@/lib/study-room/book-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: Array<BookKind | "all"> = ["all", "novel", "comic", "material"];

function dedupe(results: BookSearchResult[]): BookSearchResult[] {
  const seen = new Set<string>();
  const out: BookSearchResult[] = [];
  for (const item of results) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("q") ?? "").trim();
  const kindParam = searchParams.get("kind") ?? "all";
  const kind = (KINDS.includes(kindParam as BookKind | "all") ? kindParam : "all") as BookKind | "all";

  if (!raw) {
    return NextResponse.json({ results: [], failed: [], query: "" });
  }

  const query = normalizeQuery(raw) || raw;

  try {
    let { results, failed } = await searchAllSources({ query, kind, limit: 20 });

    // 繁简回退：没有结果时用简体再试一次，提高中文命中率。
    if (results.length === 0) {
      const simplified = toSimplified(query);
      if (simplified && simplified !== query) {
        const retry = await searchAllSources({ query: simplified, kind, limit: 20 });
        results = retry.results;
        failed = Array.from(new Set([...failed, ...retry.failed]));
      }
    }

    return NextResponse.json({ results: dedupe(results), failed, query });
  } catch (error) {
    console.error("[study-room/search]", error);
    return NextResponse.json({ results: [], failed: ["all"], error: "搜索服务暂时不可用" }, { status: 502 });
  }
}
