// scripts/sync-app-version.mjs — 把 android-shell/version.properties 的版本号
// 同步进 public/app-version.json（versionCode / versionName / apkUrl 三项）。
// 版本号唯一来源是 version.properties；本脚本只改这三个字段，
// summary 与 changes 仍由人工维护。在 npm run build 前自动执行，也可单独跑：
//   npm run sync:version
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const propsPath = path.join(root, "android-shell", "version.properties");
const jsonPath = path.join(root, "public", "app-version.json");

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

const json = JSON.parse(readFileSync(jsonPath, "utf8"));
json.versionName = versionName;
json.versionCode = versionCode;
json.apkUrl = `https://github.com/linhlinsiyi217/float-0217/releases/download/v${versionName}/app-release.apk`;
writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n");
console.log(`[sync-app-version] app-version.json 已对齐 ${versionName}(${versionCode})`);
