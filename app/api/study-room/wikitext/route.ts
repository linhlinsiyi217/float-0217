// app/api/study-room/wikitext/route.ts — 取中文维基文库某个页面的纯文本，供书房导入阅读。
//
// 只在书房内部使用：维基文库是公有领域文本，这里把页面正文转成纯文本交给导入流程，
// 让「全文可读」名副其实，而不是只给一个外链。请求目标固定为 zh.wikisource.org。

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "LinH-Float-StudyRoom/1.0 (book import; contact: site owner)";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "缺少页面标题" }, { status: 400 });
  }

  const url =
    `https://zh.wikisource.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json` +
    `&titles=${encodeURIComponent(title)}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "来源暂时不可用" }, { status: 502 });
    }
    const data = (await response.json()) as {
      query?: { pages?: Record<string, { title?: string; extract?: string; missing?: string }> };
    };
    const pages = Object.values(data.query?.pages ?? {});
    const page = pages[0];
    const text = page?.extract?.trim();
    if (!page || page.missing !== undefined || !text) {
      return NextResponse.json({ error: "这个页面没有可直接导入的正文" }, { status: 404 });
    }

    const clean = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();

    return new NextResponse(clean, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch {
    return NextResponse.json({ error: "取正文超时，请稍后再试" }, { status: 504 });
  }
}
