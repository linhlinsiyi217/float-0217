// scripts/check-update-log.mjs — 发布检查：全项目更新日志、全局更新通知与发布标识（见 CLAUDE.md 第四节）。
//
// 直接读纯数据与纯函数（Node 24 能直接跑 .ts 的类型剥离），不启动服务、不改任何文件：
//   · lib/update-log/system-data.ts     总日志发布记录（设置「更新日志」与全局弹窗）
//   · lib/update-log/studyroom-data.ts  书房日志（同批条目经 includes.studyroom 并入总日志）
//   · lib/update-log/global.ts          总日志组合函数
//   · lib/update-log/seen.ts            已读规则
//
// 检查五块，任何一块不通过都以非零码退出：
//  1. 数据结构：版本号、发布标识、日期、概括、条目、最新一版 pending；releaseId 不重复。
//  2. 同步：书房最新一版必须被总日志某次发布 includes；includes 指向的书房版本必须存在。
//  3. 关联：全局弹窗与设置总日志读同一份组合数据、同一个当前发布；按钮是「查看完整日志」「知道了」，
//     且只有「知道了」写入已读。
//  4. 已读模拟：首次会弹、确认后（含刷新）不弹、未确认不记已读、新发布重新弹、旧已读挡不住新版。
//  5. 发布标识：与远端 main（默认 origin/main，可用 RELEASE_BASE 改）相比有产品改动时，
//     总日志最新的 version 与 releaseId 必须是新的，且总日志写到了这次改动涉及的模块；
//     改了书房时书房日志也必须是新版本并被本次发布 includes。
//
// 检查只是辅助：通过后仍要人工核对日志内容与实际改动一致。

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const system = await import("../lib/update-log/system-data.ts");
const studyroom = await import("../lib/update-log/studyroom-data.ts");
const types = await import("../lib/update-log/types.ts");
const global = await import("../lib/update-log/global.ts");
const seenRules = await import("../lib/update-log/seen.ts");

const CATEGORY_LABEL = types.CATEGORY_LABEL;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const problems = [];
const warnings = [];
const notes = [];

// ── 1. 数据结构 ─────────────────────────────────────────────
function checkLog(label, releases) {
  if (!Array.isArray(releases) || releases.length === 0) {
    problems.push(`${label}：没有任何版本记录，更新弹窗会没有内容`);
    return;
  }
  const seenReleaseIds = new Set();
  const seenVersions = new Set();
  const seenEntryIds = new Set();

  releases.forEach((release, index) => {
    const where = `${label}[${index}]`;
    if (!release.version || typeof release.version !== "string") problems.push(`${where} 缺少 version`);
    else if (seenVersions.has(release.version)) problems.push(`${where} version 重复：${release.version}`);
    else seenVersions.add(release.version);
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
      else if (seenEntryIds.has(entry.id)) problems.push(`${at} id 重复：${entry.id}`);
      else seenEntryIds.add(entry.id);
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
  notes.push(
    `${label}：最新 ${latest.version}（${latest.releaseId}，${latest.date}）· ${releases.length} 个版本 · 本版 ${latest.entries.length} 条记录 / ${items} 条内容 · 待确认 ${latest.pending?.length ?? 0} 条`,
  );
}

const SYSTEM = system.SYSTEM_RELEASES;
const STUDYROOM = studyroom.STUDYROOM_RELEASES;
checkLog("总日志", SYSTEM);
checkLog("书房日志", STUDYROOM);

// ── 2. 书房同步进总日志 ─────────────────────────────────────
const studyIds = new Set(STUDYROOM.map((release) => release.releaseId));
const includedStudy = new Set();
for (const release of SYSTEM) {
  const linked = release.includes?.studyroom;
  if (!linked) continue;
  if (!studyIds.has(linked)) problems.push(`总日志 ${release.releaseId} 的 includes.studyroom 指向不存在的书房版本：${linked}`);
  else if (includedStudy.has(linked)) problems.push(`书房版本 ${linked} 被总日志重复 includes`);
  includedStudy.add(linked);
}
if (STUDYROOM[0] && !includedStudy.has(STUDYROOM[0].releaseId)) {
  problems.push(
    `书房最新一版 ${STUDYROOM[0].releaseId} 没有同步到总日志：在 system-data.ts 本次发布里写 includes: { studyroom: "${STUDYROOM[0].releaseId}" }`,
  );
}

const GLOBAL = global.composeGlobalReleases(SYSTEM, STUDYROOM);
const current = GLOBAL[0];
const currentRoots = new Set(current.entries.map((entry) => entry.app.split(" · ")[0].trim()));
if (current.includes?.studyroom) {
  const linked = STUDYROOM.find((release) => release.releaseId === current.includes.studyroom);
  const missing = linked?.entries.filter((entry) => !current.entries.some((e) => e.id === entry.id)) ?? [];
  if (missing.length) problems.push(`总日志当前发布没有并入书房条目：${missing.map((e) => e.id).join("、")}`);
}

// ── 3. 弹窗与总日志关联同一份数据 ───────────────────────────
function read(path) {
  try {
    return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  } catch {
    problems.push(`读不到 ${path}`);
    return "";
  }
}
const systemTs = read("lib/update-log/system.ts");
const noticeTsx = read("components/update-log/update-notice.tsx");
const logPageTsx = read("components/settings/update-log-page.tsx");
const popupTsx = read("components/update-log/update-note-popup.tsx");
const studyNoticeTsx = read("components/study-room/study-room-update-notice.tsx");

const expectWiring = (ok, message) => {
  if (!ok) problems.push(message);
};
expectWiring(
  /SYSTEM_RELEASE_LIST[^=]*=\s*composeGlobalReleases\(\s*SYSTEM_RELEASES\s*,\s*STUDYROOM_RELEASES\s*\)/.test(systemTs) &&
    /latestSystemRelease\(\)[^{]*\{\s*return SYSTEM_RELEASE_LIST\[0\]/.test(systemTs),
  "lib/update-log/system.ts：总日志与当前发布必须来自 composeGlobalReleases(SYSTEM_RELEASES, STUDYROOM_RELEASES)",
);
expectWiring(
  /from "@\/lib\/update-log\/system"/.test(noticeTsx) && /latestSystemRelease\(\)/.test(noticeTsx),
  "全局弹窗（update-notice.tsx）必须读 lib/update-log/system 的 latestSystemRelease()",
);
expectWiring(
  /from "@\/lib\/update-log\/system"/.test(logPageTsx) && /releases=\{SYSTEM_RELEASE_LIST\}/.test(logPageTsx),
  "设置更新日志页必须读 lib/update-log/system 的 SYSTEM_RELEASE_LIST",
);
expectWiring(popupTsx.includes("查看完整日志") && />\s*<Check[^>]*\/>\s*知道了\s*</.test(popupTsx), "更新弹窗必须有「查看完整日志」和「知道了」两个按钮");
expectWiring(
  /onClick=\{handleConfirm\}/.test(popupTsx) && (popupTsx.match(/handleConfirm\(\)|onClick=\{handleConfirm\}/g) ?? []).length === 1,
  "更新弹窗：只有「知道了」按钮能触发确认（handleConfirm 不能被 Esc 或其他入口调用）",
);

/** 已读写入只能出现在 confirm 里：调用次数恰好 1 次，且位于 `const confirm = () => { … }` 内 */
function onlyInConfirm(source, fn, file) {
  const calls = source.match(new RegExp(`${fn}\\(`, "g")) ?? [];
  const body = /const confirm = \(\) => \{([\s\S]*?)\n\s*\};/.exec(source)?.[1] ?? "";
  if (calls.length !== 1 || !body.includes(`${fn}(`) || !/onConfirm=\{confirm\}/.test(source)) {
    problems.push(`${file}：${fn} 只能在「知道了」（confirm → onConfirm）里调用一次，不能在显示、收起或看日志时提前标记已读`);
  }
}
onlyInConfirm(noticeTsx, "markSystemReleaseSeen", "update-notice.tsx");
onlyInConfirm(noticeTsx, "markStudyRoomReleaseSeen", "update-notice.tsx");
onlyInConfirm(studyNoticeTsx, "markStudyRoomReleaseSeen", "study-room-update-notice.tsx");

// ── 4. 已读规则模拟 ─────────────────────────────────────────
{
  const { shouldShowRelease, acknowledgeRelease, parseSeen } = seenRules;
  const id = current.releaseId;
  const steps = [];
  let store = null; // 模拟浏览器里存的字符串

  steps.push(["首次打开会弹", shouldShowRelease(parseSeen(store), id) === true]);
  // 弹出但没点「知道了」（看日志 / Esc / 关页面）：不写任何东西
  steps.push(["未确认前刷新仍会弹", shouldShowRelease(parseSeen(store), id) === true]);
  store = JSON.stringify(acknowledgeRelease(parseSeen(store), id, "2026-01-01T00:00:00.000Z"));
  steps.push(["点「知道了」后不再弹", shouldShowRelease(parseSeen(store), id) === false]);
  steps.push(["刷新/重开后仍不弹", shouldShowRelease(parseSeen(String(store)), id) === false]);
  const again = acknowledgeRelease(parseSeen(store), id, "2027-01-01T00:00:00.000Z");
  steps.push(["重复确认不改已读时间", again[id] === "2026-01-01T00:00:00.000Z"]);
  steps.push(["新发布重新弹", shouldShowRelease(parseSeen(store), `${id}-next`) === true]);

  // 用真实数据：以前所有发布都确认过（例如看过书房 0.7.0），当前发布仍然要弹
  const olderSeen = {};
  for (const release of [...SYSTEM.slice(1), ...STUDYROOM.slice(1)]) olderSeen[release.releaseId] = "x";
  steps.push(["看过旧版本挡不住当前发布", shouldShowRelease(olderSeen, id) === true]);
  if (current.includes?.studyroom) {
    steps.push(["看过旧书房版本挡不住书房当前版本", shouldShowRelease(olderSeen, current.includes.studyroom) === true]);
  }
  steps.push(["坏数据按未读处理", shouldShowRelease(parseSeen("not json"), id) === true]);

  const failed = steps.filter(([, ok]) => !ok);
  for (const [name] of failed) problems.push(`已读规则模拟失败：${name}`);
  notes.push(`已读模拟：${steps.length - failed.length}/${steps.length} 通过（${steps.map(([name]) => name).join("、")}）`);
}

// ── 5. 发布标识与改动模块 ───────────────────────────────────
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
const NON_PRODUCT = [/^docs\//, /\.md$/i, /^NOTICE$/, /^LICENSE/, /^\.claude\//, /^\.github\//, /^scripts\//, /^lib\/update-log\/[^/]+-data\.ts$/];
const MODULES = [
  { test: /(^|\/)study-room\//, module: "书房", roots: ["书房"] },
  { test: /^(lib|components)\/update-log\/|^components\/settings\/update-log-page\.tsx$/, module: "更新日志", roots: ["设置", "全局"] },
  { test: /^components\/(settings\/|phone-settings-app)/, module: "设置", roots: ["设置"] },
  { test: /^components\/(chat|wechat)|^lib\/chat/, module: "聊天", roots: ["聊天"] },
  { test: /^components\/desktop-shell|^components\/desktop\//, module: "桌面", roots: ["桌面"] },
];

const base = process.env.RELEASE_BASE || "origin/main";
let mergeBase = "";
try {
  mergeBase = git(["merge-base", base, "HEAD"]);
} catch {
  problems.push(`拿不到 ${base}，无法核对发布标识：先 git fetch，或用 RELEASE_BASE 指定已发布的提交`);
}
if (mergeBase) {
  const changed = new Set([
    ...git(["diff", "--name-only", mergeBase, "HEAD"]).split("\n"),
    ...git(["diff", "--name-only", "--cached"]).split("\n"),
  ]);
  changed.delete("");
  const product = [...changed].filter((file) => !NON_PRODUCT.some((re) => re.test(file)));
  if (product.length === 0) {
    notes.push(`发布核对：相对 ${base} 没有待发布的产品改动`);
  } else {
    const firstId = (text) => /releaseId:\s*"([^"]+)"/.exec(text)?.[1];
    const firstVersion = (text) => /version:\s*"([^"]+)"/.exec(text)?.[1];
    const show = (path) => {
      try {
        return git(["show", `${mergeBase}:${path}`]);
      } catch {
        return "";
      }
    };
    const baseSystem = show("lib/update-log/system-data.ts");
    const baseStudy = show("lib/update-log/studyroom-data.ts");
    if (firstId(baseSystem) === SYSTEM[0].releaseId) {
      problems.push(`有 ${product.length} 个产品文件改动，但总日志发布标识还是已发布的 ${SYSTEM[0].releaseId}：请在 system-data.ts 最上面加新的一版`);
    }
    if (firstVersion(baseSystem) === SYSTEM[0].version) {
      problems.push(`总日志版本号还是已发布的 ${SYSTEM[0].version}：发布新版本要同时换 version`);
    }

    const unmapped = [];
    const modules = new Map();
    for (const file of product) {
      const hit = MODULES.find((item) => item.test.test(file));
      if (!hit) unmapped.push(file);
      else modules.set(hit.module, hit);
    }
    for (const [name, hit] of modules) {
      if (!hit.roots.some((root) => currentRoots.has(root))) {
        problems.push(`这次改了「${name}」，但总日志当前发布没有对应模块的条目（app 以 ${hit.roots.join(" / ")} 开头）`);
      }
    }
    if (modules.has("书房")) {
      if (firstId(baseStudy) === STUDYROOM[0].releaseId) {
        problems.push(`这次改了书房，但书房日志发布标识还是已发布的 ${STUDYROOM[0].releaseId}`);
      }
      if (current.includes?.studyroom !== STUDYROOM[0].releaseId) {
        problems.push(`这次改了书房，总日志当前发布必须 includes 书房最新一版 ${STUDYROOM[0].releaseId}`);
      }
    }
    if (unmapped.length) {
      warnings.push(
        `这些改动没有自动对应的模块，请人工确认总日志写到了：${unmapped.slice(0, 8).join("、")}${unmapped.length > 8 ? ` 等 ${unmapped.length} 个` : ""}`,
      );
    }
    notes.push(
      `发布核对：相对 ${base} 有 ${product.length} 个产品文件改动；涉及模块 ${[...modules.keys()].join("、") || "（无自动映射）"}；` +
        `总日志 ${firstId(baseSystem) ?? "?"} → ${SYSTEM[0].releaseId}，书房 ${firstId(baseStudy) ?? "?"} → ${STUDYROOM[0].releaseId}`,
    );
  }
}

for (const note of notes) console.log(`[check:updates] ${note}`);
for (const warning of warnings) console.warn(`[check:updates] 提醒：${warning}`);
if (problems.length > 0) {
  console.error("[check:updates] 不通过：");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("[check:updates] 通过：总日志、全局通知与发布标识齐备（仍需人工核对日志内容与实际改动一致）");
