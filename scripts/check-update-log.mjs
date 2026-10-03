// scripts/check-update-log.mjs — 发布检查：更新日志与更新弹窗的数据是否齐备。
//
// 数据只有一份：lib/update-log-data.ts。这里直接读它（Node 24 能直接跑 .ts 的类型剥离），
// 只做结构检查，不启动服务、不改任何文件。
//
// 缺记录、缺字段、版本号与 releaseId 不匹配、同类检查不通过时以非零码退出，
// 用于「每次推送必须同步日志和弹窗文案」这条约定。

const {
  RELEASES,
  CATEGORY_LABEL,
} = await import("../lib/update-log-data.ts");

const problems = [];
const warnings = [];

if (!Array.isArray(RELEASES) || RELEASES.length === 0) {
  problems.push("RELEASES 为空：至少要有一版记录，否则更新弹窗没有内容可展示");
} else {
  const seenReleaseIds = new Set();
  const seenEntryIds = new Set();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  RELEASES.forEach((release, releaseIndex) => {
    const where = `RELEASES[${releaseIndex}]`;
    if (!release.version || typeof release.version !== "string") problems.push(`${where} 缺少 version`);
    if (!release.releaseId || typeof release.releaseId !== "string") problems.push(`${where} 缺少 releaseId`);
    else {
      if (seenReleaseIds.has(release.releaseId)) problems.push(`${where} releaseId 重复：${release.releaseId}`);
      seenReleaseIds.add(release.releaseId);
      if (/^0\.1\.0$/.test(release.version) === false && release.releaseId.includes("unknown")) {
        problems.push(`${where} releaseId 需要能对应到具体版本`);
      }
    }
    if (!release.date || !datePattern.test(release.date)) problems.push(`${where} date 需要是 YYYY-MM-DD`);

    if (!Array.isArray(release.entries) || release.entries.length === 0) {
      problems.push(`${where} 没有任何 entries：这一版改了什么必须写清楚`);
      return;
    }
    release.entries.forEach((entry, entryIndex) => {
      const at = `${where}.entries[${entryIndex}]`;
      if (!entry.id) problems.push(`${at} 缺少 id`);
      else if (seenEntryIds.has(entry.id)) problems.push(`${at} id 重复：${entry.id}`);
      else seenEntryIds.add(entry.id);
      if (!CATEGORY_LABEL[entry.category]) problems.push(`${at} category 非法：${entry.category}`);
      if (!entry.app) problems.push(`${at} 缺少 app（属于哪个应用/模块）`);
      if (!entry.title) problems.push(`${at} 缺少 title`);
      if (!Array.isArray(entry.items) || entry.items.length === 0) problems.push(`${at} items 为空`);
    });

    if (releaseIndex === 0) {
      // 最新一版必须交代「还没做完/还没实测」的部分，哪怕写成空数组
      if (!Array.isArray(release.pending)) {
        problems.push(`${where} 最新一版必须带 pending 字段（没有就写空数组），避免把未完成写成已完成`);
      }
      if (!release.name) warnings.push(`${where} 建议给这一版起个名字，弹窗标题更好读`);
    }
  });
}

const latest = RELEASES?.[0];
if (latest) {
  const entryCount = latest.entries.reduce((total, entry) => total + entry.items.length, 0);
  console.log(`[check:updates] 最新版本 ${latest.version}（${latest.releaseId}，${latest.date}）`);
  console.log(`[check:updates] 共 ${RELEASES.length} 个版本、本版 ${latest.entries.length} 条记录 / ${entryCount} 条具体内容`);
  console.log(`[check:updates] 待完成或待实机确认 ${latest.pending?.length ?? 0} 条`);
}

for (const warning of warnings) console.warn(`[check:updates] 提醒：${warning}`);
if (problems.length > 0) {
  console.error("[check:updates] 不通过：");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("[check:updates] 通过：更新日志与弹窗数据齐备");
