// scripts/sync-app-version.mjs — 把 android-shell/version.properties 的版本号
// 同步进 public/app-version.json（versionCode / versionName / apkUrl 三项），
// 并为每次生产部署生成唯一的发布标识（releaseId / commitSha / releasedAt）。
//
// 版本号唯一来源是 version.properties；summary 与 changes 由人工维护。
// releaseId 规则（UPDATE_SYSTEM.md）：`${webVersion}-${commitSha}`——
// commitSha 每次部署必然不同，所以即使 versionName 没变也能检测为新版本。
// commitSha 取值顺序：VERCEL_GIT_COMMIT_SHA（Vercel 构建注入）→ 本地 git rev-parse → 空串降级。
// 同时把根目录 CHANGELOG.md 最新一节的 `<commit-sha>` 占位符替换成真实提交，
// 保证部署出去的清单与日志带同一个 releaseId。在 npm run build 前自动执行，也可单独跑：
//   npm run sync:version
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const propsPath = path.join(root, "android-shell", "version.properties");
const jsonPath = path.join(root, "public", "app-version.json");
const changelogPath = path.join(root, "CHANGELOG.md");

const props = Object.fromEntries(
  readFileSync(propsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const eq = line.indexOf("=");
      return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
    }),
);

const versionName = props.versionName;
const versionCode = Number(props.versionCode);
if (!versionName || !Number.isInteger(versionCode) || versionCode <= 0) {
  console.error(`[sync-app-version] version.properties 内容无效：${JSON.stringify(props)}`);
  process.exit(1);
}

function resolveCommitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.trim();
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const commitSha = resolveCommitSha();
const releasedAt = new Date().toISOString();

const json = JSON.parse(readFileSync(jsonPath, "utf8"));
json.versionName = versionName;
json.versionCode = versionCode;
json.apkUrl = `https://github.com/linhlinsiyi217/float-0217/releases/download/v${versionName}/app-release.apk`;

// ── 发布标识（机器读取，网页端比较用）────────────────
// releaseId 优先于 commitSha/webVersion/versionCode；webVersion 未人工升位时，
// commitSha 变化仍然生成新 releaseId，保证「每次部署都是一次发布」。
const webVersion = typeof json.webVersion === "string" && json.webVersion.trim()
  ? json.webVersion.trim()
  : releasedAt.slice(0, 10).replaceAll("-", "");
json.releaseId = `${webVersion}-${commitSha || releasedAt.replaceAll(/[:.]/g, "")}`;
json.commitSha = commitSha;
json.releasedAt = releasedAt;
json.changelogFile = "/CHANGELOG.md";
// summary / changes 从总日志最新一版生成（和网页公告、设置日志同一份数据），
// 不再人工维护第二份文案。只取用户可见字段：标题与第一条说明。
// 读不了 .ts（Node 版本不支持类型剥离）时保留原有内容，不影响构建。
try {
  const { SYSTEM_RELEASES } = await import("../lib/update-log/system-data.ts");
  const latest = SYSTEM_RELEASES[0];
  if (latest) {
    json.summary = latest.summary;
    json.changes = latest.entries.map((entry) => ({
      type: entry.scope === "prompt" ? "ai" : entry.scope || "content",
      category: entry.category,
      app: entry.app,
      title: entry.title,
      detail: entry.items[0] || "",
    }));
  }
} catch {
  console.warn("[sync-app-version] 读取 system-data.ts 失败，沿用 app-version.json 现有的 summary / changes");
}
// 规范要求的 entries 字段：与 changes 同构，直接镜像一份
json.entries = Array.isArray(json.changes) ? json.changes : [];

writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n");

// ── CHANGELOG.md 最新一节的占位符回填 ─────────────────
// 提交进仓库的文件里写 `Release ID: <webVersion>-<commit-sha>` 占位，
// 部署构建时替换成真实 releaseId，保证「CHANGELOG 与清单同一 releaseId」。
try {
  const changelog = readFileSync(changelogPath, "utf8");
  const fallbackId = releasedAt.replaceAll(/[:.]/g, "");
  // 容忍 Markdown 行内代码反引号：`2026-10-22-7-<commit-sha>`
  const updated = changelog.replaceAll(
    /Release ID:\s*`?([^\n`]*?)<commit-sha>`?/g,
    (_match, before) => `Release ID: \`${before}${commitSha || fallbackId}\``,
  );
  if (updated !== changelog) {
    writeFileSync(changelogPath, updated);
    console.log(`[sync-app-version] CHANGELOG.md 已回填 releaseId（commit ${commitSha ? commitSha.slice(0, 7) : "时间戳降级"}）`);
  } else if (changelog.includes("<commit-sha>")) {
    console.warn("[sync-app-version] CHANGELOG.md 仍含未回填的 <commit-sha> 占位符，请检查格式");
  }
} catch {
  console.warn("[sync-app-version] CHANGELOG.md 不存在或不可写，跳过回填");
}

// ── 把回填后的 CHANGELOG.md 部署出去 ─────────────────
// Next.js 只静态伺服 public/ 下的文件；根目录 CHANGELOG.md 是唯一权威源，
// 构建时复制一份到 public/ 供线上 /CHANGELOG.md 拉取与核对（next.config 已给它 no-store，
// sw.js 也已排除）。public 副本进 .gitignore，避免与根目录源文件漂移。
try {
  const changelog = readFileSync(changelogPath, "utf8");
  writeFileSync(path.join(root, "public", "CHANGELOG.md"), changelog);
  console.log("[sync-app-version] CHANGELOG.md 已复制到 public/ 供部署");
} catch {
  console.warn("[sync-app-version] CHANGELOG.md 复制到 public/ 失败（不影响构建）");
}

// ── 构建期自检：规范 §9 要求清单三要素非空 ─────────────
if (!json.releaseId) {
  console.error("[sync-app-version] releaseId 生成失败，部署出去的清单无法被检测为新版本");
  process.exit(1);
}
if (!commitSha) {
  console.warn("[sync-app-version] 未取到 commitSha（非 git 非 Vercel 环境），releaseId 已用时间戳降级");
}

console.log(`[sync-app-version] app-version.json 已对齐 ${versionName}(${versionCode})`);
console.log(`[sync-app-version] releaseId=${json.releaseId}`);
