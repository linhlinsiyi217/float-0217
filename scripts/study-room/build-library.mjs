// scripts/study-room/build-library.mjs — 整理书房内置书库（真实原文，脚本获取，不经模型生成）。
//
// 来源：中文维基文库（zh.wikisource.org）公有领域作品页面。
// 简体：使用维基文库自身的简繁转换（parse API 的 variant=zh-hans），不另做改写。
// 输出：public/study-room/library/<id>/manifest.json + part-NN.json（每卷若干章，按需加载）
//       lib/study-room/builtin-library.generated.ts（书目清单，供书城搜索与书架使用）
//
// 用法（需要能访问维基文库；本机走代理时加 NODE_USE_ENV_PROXY=1）：
//   node scripts/study-room/build-library.mjs            # 全部
//   node scripts/study-room/build-library.mjs nahan      # 只重建某几本
// 请求是串行且限速的（维基要求带联系方式的 User-Agent、避免并发打接口）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { wikiHtmlToSections, wikiIndexLinks } = await import(pathToFileURL(path.join(ROOT, "lib/study-room/wikisource-text.ts")).href);

const OUT_DIR = path.join(ROOT, "public/study-room/library");
const CATALOG_TS = path.join(ROOT, "lib/study-room/builtin-library.generated.ts");
const UA = "LinH-Float-StudyRoom/1.0 (https://float-0217.vercel.app; builtin library build)";
const GAP_MS = 1100;
const CHAPTERS_PER_PART = 20;

/**
 * 书目定义：每本书写明来源页、取哪些子篇、预期篇数（用于完整性校验）。
 * pick：从目录页链接里挑正文篇目；split：一个页面里按小标题拆成多章（聊斋每卷多篇）。
 */
const BOOKS = [
  {
    id: "nahan", title: "呐喊", author: "鲁迅", era: "1923", page: "吶喊", expect: 15,
    edition: "通行本篇目（自序 + 14 篇；1930 年起作者抽出《不周山》）",
    pick: (links) => links.filter((l) => !["墳", "野草"].includes(l.title)),
    selfSections: ["自序"],
  },
  {
    id: "panghuang", title: "彷徨", author: "鲁迅", era: "1926", page: "彷徨", expect: 11,
    edition: "1926 年北新书局初版篇目（11 篇，按初版顺序）",
    // 维基目录页的排列与初版不同，这里按初版目录排序
    pick: (links) => {
      const order = ["祝福", "在酒樓上", "幸福的家庭", "肥皂", "長明燈", "示衆", "高老夫子", "孤獨者", "傷逝", "弟兄", "離婚"];
      const rank = (l) => order.findIndex((name) => l.label === name || l.title === name);
      return links.filter((l) => rank(l) >= 0).sort((a, b) => rank(a) - rank(b));
    },
  },
  {
    id: "zhaohuaxishi", title: "朝花夕拾", author: "鲁迅", era: "1928", page: "朝花夕拾", expect: 12,
    edition: "1928 年未名社初版篇目（小引 + 10 篇 + 后记）",
    pick: (links) => links.filter((l) => !["彷徨", "故事新編", "莽原"].includes(l.title)),
  },
  {
    id: "xiyouji", title: "西游记", author: "吴承恩", era: "明", page: "西遊記", expect: 100,
    edition: "维基文库百回本（世德堂本系统）",
    pick: (links) => links.filter((l) => /\/第\d+回$/.test(l.title)),
  },
  {
    id: "hongloumeng", title: "红楼梦", author: "曹雪芹 著；高鹗 续", era: "清", page: "紅樓夢", expect: 120,
    edition: "维基文库 120 回汇校本（前八十回庚辰本为底本，后四十回程甲本为底本，不含批语）",
    pick: (links) => links.filter((l) => /^紅樓夢\/第\d+回$/.test(l.title)),
  },
  {
    id: "sanguoyanyi", title: "三国演义", author: "罗贯中", era: "明", page: "三國演義", expect: 120,
    edition: "维基文库毛纶、毛宗岗评改本 120 回（正文）",
    pick: (links) => links.filter((l) => /^三國演義\/第\d+回$/.test(l.title)),
  },
  {
    id: "rulinwaishi", title: "儒林外史", author: "吴敬梓", era: "清", page: "儒林外史", expect: 56,
    edition: "维基文库 56 回本",
    pick: (links) => links.filter((l) => /\/第\d+回$/.test(l.title)),
  },
  {
    id: "liaozhaizhiyi", title: "聊斋志异", author: "蒲松龄", era: "清", page: "聊齋志異", expectMin: 480,
    edition: "维基文库十二卷本（会校会注会评本系统）；已去除〈〉内的清人旧评，保留「一作」异文小注",
    pick: (links) => links.filter((l) => /\/(作者自志|第\d+卷)$/.test(l.title)),
    split: true,
    clean: (p) => p.replace(/〈〔[^〕]{1,6}评〕[^〉]*〉/g, "").trim(),
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function api(params, tries = 4) {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  // 参数太长（如一次转换 120 个章名）用 POST，避免 414 URI Too Long
  const body = new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params });
  const long = body.toString().length > 1500;
  const url = `https://zh.wikisource.org/w/api.php${long ? "" : `?${body}`}`;
  const res = await fetch(url, long
    ? { method: "POST", body, headers: { "User-Agent": UA, Accept: "application/json" } }
    : { headers: { "User-Agent": UA, Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok || !text.startsWith("{")) {
    if (tries > 1) {
      console.warn(`  · ${res.status} 重试：${params.page ?? ""}`);
      await sleep(8000);
      return api(params, tries - 1);
    }
    throw new Error(`请求失败 ${res.status}: ${text.slice(0, 120)}`);
  }
  const data = JSON.parse(text);
  if (data.error) {
    if (data.error.code === "maxlag" && tries > 1) { await sleep(6000); return api(params, tries - 1); }
    throw new Error(`${data.error.code}: ${data.error.info}`);
  }
  return data;
}

/** 目录链接常写繁体而页面标题是简体（站点靠标题转换匹配），先解析出真实标题 */
async function resolveTitle(title) {
  const d = await api({ action: "query", titles: title, converttitles: 1, redirects: 1 });
  const page = d.query?.pages?.[0];
  if (!page || page.missing) throw new Error(`页面不存在：${title}`);
  return page.title;
}

async function pageHtml(title) {
  try {
    return await pageHtmlExact(title);
  } catch (error) {
    if (!/missingtitle/.test(String(error.message))) throw error;
    return pageHtmlExact(await resolveTitle(title));
  }
}

async function pageHtmlExact(title) {
  const d = await api({ action: "parse", page: title, prop: "text|revid", redirects: 1, variant: "zh-hans", disableeditsection: 1, disablelimitreport: 1 });
  return { html: d.parse.text, revid: d.parse.revid, title: d.parse.title };
}

async function pageWikitext(title) {
  const d = await api({ action: "parse", page: title, prop: "wikitext", redirects: 1 });
  return { wikitext: d.parse.wikitext, title: d.parse.title };
}

/** 简体章名：子页标题取最后一段，交给维基的简繁转换 */
async function simplifiedLabels(labels) {
  // 用一次 parse 把所有章名做简繁转换，避免逐篇请求
  const marker = labels.map((l, i) => `<p id="l${i}">${l}</p>`).join("");
  const d = await api({ action: "parse", text: marker, contentmodel: "wikitext", variant: "zh-hans", disablelimitreport: 1 });
  return labels.map((_, i) => {
    const m = new RegExp(`id="l${i}">([\\s\\S]*?)</p>`).exec(d.parse.text);
    return (m?.[1] ?? labels[i]).replace(/<[^>]+>/g, "").trim();
  });
}

function chapterTitleFromLabel(label) {
  return label.replace(/^.*\//, "").replace(/\s+/g, " ").trim();
}

async function buildBook(def) {
  console.log(`\n== ${def.title}（${def.page}）`);
  const index = await pageWikitext(def.page);
  const links = def.pick(wikiIndexLinks(index.wikitext, index.title));
  console.log(`  目录链接 ${links.length} 条`);

  const chapters = [];
  const revisions = {};

  if (def.selfSections?.length) {
    const self = await pageHtml(index.title);
    revisions[self.title] = self.revid;
    for (const name of def.selfSections) {
      const section = wikiHtmlToSections(self.html).find((s) => s.heading === name);
      if (!section) throw new Error(`目录页里没有「${name}」一节`);
      chapters.push({ title: name, paragraphs: section.paragraphs, src: self.title });
    }
  }

  const labels = await simplifiedLabels(links.map((l) => chapterTitleFromLabel(l.label)));
  for (const [i, link] of links.entries()) {
    const page = await pageHtml(link.title);
    revisions[page.title] = page.revid;
    const sections = wikiHtmlToSections(page.html);
    if (def.split) {
      const volume = labels[i];
      for (const s of sections) {
        if (!s.heading) continue;
        const paragraphs = s.paragraphs.map(def.clean ?? ((p) => p)).filter(Boolean);
        if (paragraphs.length) chapters.push({ title: `${volume} · ${s.heading}`, paragraphs, src: page.title });
      }
      // 「作者自志」这类没有小标题的单篇
      if (!sections.some((s) => s.heading)) {
        chapters.push({ title: volume, paragraphs: sections.flatMap((s) => s.paragraphs).map(def.clean ?? ((p) => p)).filter(Boolean), src: page.title });
      }
    } else {
      // 单篇内部的小节（如狂人日记的一、二、三）保留成段落里的小标题行
      const paragraphs = sections.flatMap((s) => (s.heading ? [s.heading, ...s.paragraphs] : s.paragraphs));
      chapters.push({ title: labels[i], paragraphs, src: page.title });
    }
    process.stdout.write(`\r  已取 ${i + 1}/${links.length}`);
  }
  process.stdout.write("\n");

  // ── 完整性校验 ──
  const problems = [];
  if (def.expect && chapters.length !== def.expect) problems.push(`章数 ${chapters.length} ≠ 预期 ${def.expect}`);
  if (def.expectMin && chapters.length < def.expectMin) problems.push(`章数 ${chapters.length} < 预期下限 ${def.expectMin}`);
  for (const [i, ch] of chapters.entries()) {
    const chars = ch.paragraphs.join("").length;
    // 聊斋里《赤字》《瓜异》等原文本来就只有三十来字，单篇下限放到 20 字
    if (chars < (def.split ? 20 : 300)) problems.push(`第 ${i + 1} 章「${ch.title}」只有 ${chars} 字`);
    if (ch.paragraphs.some((p) => /此页面|本作品在全世界都属于公有领域|Wikisource|维基文库/.test(p))) problems.push(`第 ${i + 1} 章「${ch.title}」混入站点说明`);
  }
  const totalChars = chapters.reduce((n, ch) => n + ch.paragraphs.join("").length, 0);
  if (problems.length) {
    console.log("  !! 校验问题：\n   - " + problems.slice(0, 20).join("\n   - "));
    throw new Error(`${def.title} 校验未通过`);
  }

  // ── 写文件 ──
  const dir = path.join(OUT_DIR, def.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const parts = Math.ceil(chapters.length / CHAPTERS_PER_PART);
  for (let p = 0; p < parts; p += 1) {
    const slice = chapters.slice(p * CHAPTERS_PER_PART, (p + 1) * CHAPTERS_PER_PART).map(({ title, paragraphs }) => ({ title, paragraphs }));
    fs.writeFileSync(path.join(dir, `part-${String(p + 1).padStart(2, "0")}.json`), JSON.stringify(slice));
  }
  const manifest = {
    id: def.id,
    title: def.title,
    author: def.author,
    era: def.era,
    language: "zh",
    script: "简体（维基文库 zh-hans 自动转换）",
    edition: def.edition,
    source: { name: "中文维基文库", url: `https://zh.wikisource.org/wiki/${encodeURIComponent(index.title)}` },
    license: "原作属公有领域；文本取自维基文库，版面整理部分依 CC BY-SA 4.0，保留来源链接。",
    builtAt: new Date().toISOString().slice(0, 10),
    totalChars,
    chaptersPerPart: CHAPTERS_PER_PART,
    parts,
    chapters: chapters.map((ch) => ch.title),
    revisions,
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 1));

  const first = chapters[0];
  const mid = chapters[Math.floor(chapters.length / 2)];
  const end = chapters[chapters.length - 1];
  console.log(`  ✓ ${chapters.length} 章 · ${totalChars} 字 · ${parts} 卷文件`);
  console.log(`    开头「${first.title}」${first.paragraphs[0].slice(0, 40)}`);
  console.log(`    中间「${mid.title}」${mid.paragraphs[0].slice(0, 40)}`);
  console.log(`    末尾「${end.title}」…${end.paragraphs.at(-1).slice(-40)}`);
  return manifest;
}

function writeCatalog() {
  const entries = fs
    .readdirSync(OUT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(OUT_DIR, d.name, "manifest.json")))
    .map((d) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, d.name, "manifest.json"), "utf8")))
    .sort((a, b) => BOOKS.findIndex((x) => x.id === a.id) - BOOKS.findIndex((x) => x.id === b.id))
    .map((m) => ({
      id: m.id,
      title: m.title,
      author: m.author,
      era: m.era,
      edition: m.edition,
      chapters: m.chapters.length,
      totalChars: m.totalChars,
      sourceUrl: m.source.url,
      aliases: [BOOKS.find((b) => b.id === m.id)?.page].filter((v) => v && v !== m.title),
    }));
  const body = `// 由 scripts/study-room/build-library.mjs 生成，请勿手改。正文在 public/study-room/library/<id>/。\n\nexport const BUILTIN_LIBRARY = ${JSON.stringify(entries, null, 2)} as const;\n`;
  fs.writeFileSync(CATALOG_TS, body);
  console.log(`\n书目清单已写入 ${path.relative(ROOT, CATALOG_TS)}（${entries.length} 本）`);
}

const only = process.argv.slice(2);
fs.mkdirSync(OUT_DIR, { recursive: true });
const failed = [];
for (const def of BOOKS) {
  if (only.length && !only.includes(def.id)) continue;
  try {
    await buildBook(def);
  } catch (error) {
    console.error(`  ✗ ${def.title}：${error.message}`);
    failed.push(def.id);
  }
}
writeCatalog();
if (failed.length) {
  console.error(`未完成：${failed.join(", ")}`);
  process.exitCode = 1;
}
