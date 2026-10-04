// scripts/check-update-log.mjs — 发布检查：两套更新日志的数据是否齐备。
//
// 两套日志各有一份纯数据（无运行时依赖），这里直接读它们（Node 24 能直接跑 .ts 的类型剥离）：
//   · lib/update-log/system-data.ts    小手机整体项目
//   · lib/update-log/studyroom-data.ts 书房应用
// 只做结构检查，不启动服务、不改任何文件。
//
// 缺版本号 / 日期 / 应用名 / 一句话概括 / 详细条目，或 releaseId 重复时以非零码退出，
// 用于「每次推送必须同步日志和弹窗文案」这条约定（见 CLAUDE.md 第四节）。

const system = await import("../lib/update-log/system-data.ts");
const studyroom = await import("../lib/update-log/studyroom-data.ts");
const types = await import("../lib/update-log/types.ts");

const CATEGORY_LABEL = types.CATEGORY_LABEL;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const problems = [];
const warnings = [];

function checkLog(label, releases) {
  if (!Array.isArray(releases) || releases.length === 0) {
    problems.push(`${label}：没有任何版本记录，更新弹窗会没有内容`);
    return;
  }
  const seenReleaseIds = new Set();
  const seenEntryIds = new Set();

  releases.forEach((release, index) => {
    const where = `${label}[${index}]`;
    if (!release.version || typeof release.version !== "string") problems.push(`${where} 缺少 version`);
    if (!release.releaseId || typeof release.releaseId !== "string") {
      problems.push(`${where} 缺少 releaseId`);
    } else if (seenReleaseIds.has(release.releaseId)) {
      problems.push(`${where} releaseId 重复：${release.releaseId}`);
    } else {
      seenReleaseIds.add(release.releaseId);
    }
    if (!release.date || !datePattern.test(release.date)) problems.push(`${where} date 需要是 YYYY-MM-DD`);
    if (!release.summary || typeof release.summary !== "string") {
      problems.push(`${where} 缺少 summary：收起时的一句话概括不能为空`);
    }
    if (!Array.isArray(release.entries) || release.entries.length === 0) {
      problems.push(`${where} 没有任何 entries：这一版改了什么必须写清楚`);
      return;
    }
    release.entries.forEach((entry, entryIndex) => {
      const at = `${where}.entries[${entryIndex}]`;
      if (!entry.id) problems.push(`${at} 缺少 id`);
      else if (seenEntryIds.has(`${label}:${entry.id}`)) problems.push(`${at} id 重复：${entry.id}`);
      else seenEntryIds.add(`${label}:${entry.id}`);
      if (!CATEGORY_LABEL[entry.category]) problems.push(`${at} category 非法：${entry.category}`);
      if (!entry.app) problems.push(`${at} 缺少 app（属于哪个应用/模块）`);
      if (!entry.title) problems.push(`${at} 缺少 title`);
      if (!Array.isArray(entry.items) || entry.items.length === 0) problems.push(`${at} items 为空`);
    });

    if (index === 0 && !Array.isArray(release.pending)) {
      problems.push(`${where} 最新一版必须带 pending 字段（没有就写空数组），避免把未完成写成已完成`);
    }
  });

  const latest = releases[0];
  const items = latest.entries.reduce((total, entry) => total + entry.items.length, 0);
  console.log(
    `[check:updates] ${label}：最新 ${latest.version}（${latest.releaseId}，${latest.date}）· ${releases.length} 个版本 · 本版 ${latest.entries.length} 条记录 / ${items} 条内容 · 待确认 ${latest.pending?.length ?? 0} 条`,
  );
}

checkLog("系统更新", system.SYSTEM_RELEASES);
checkLog("书房更新", studyroom.STUDYROOM_RELEASES);

for (const warning of warnings) console.warn(`[check:updates] 提醒：${warning}`);
if (problems.length > 0) {
  console.error("[check:updates] 不通过：");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("[check:updates] 通过：两套更新日志的数据齐备");
