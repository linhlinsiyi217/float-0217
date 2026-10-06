// 书城联网搜索探针：对指定站点的 /api/study-room/search 真实请求，打印状态、耗时、来源与失败原因。
// 用法：node scripts/study-room/probe-search.mjs [base] [词1] [词2] ...
const [base = "http://localhost:3001", ...rest] = process.argv.slice(2);
const queries = rest.length ? rest : ["简爱", "呐喊", "Jane Eyre", "不存在的书名七七八八"];
for (const q of queries) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/study-room/search?q=${encodeURIComponent(q)}&kind=all`);
  const ms = Date.now() - t0;
  let body;
  try { body = await res.json(); } catch { body = null; }
  console.log(`== ${q}  HTTP ${res.status}  ${ms}ms  results=${body?.results?.length ?? "?"}`);
  if (!body) continue;
  if (body.failed?.length) console.log("  failed:", body.failed.map((f) => `${f.label}:${f.reason}`).join(" / "));
  for (const r of body.results.slice(0, 8)) {
    console.log(`  [${r.sourceLabel}] ${r.title} | ${r.authors?.join(",") || "-"} | ${r.language ?? "-"} | ${r.readability}${r.importFile ? " | " + r.importFile.url.slice(0, 70) : ""}`);
  }
}
