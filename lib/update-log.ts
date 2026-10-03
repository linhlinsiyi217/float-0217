// lib/update-log.ts — 全局更新日志与更新弹窗的唯一数据源。
//
// 约定（已写入 CLAUDE.md 的开发规则）：
//  - 每次推送都要在这里补一条记录，弹窗与设置里的「更新日志」都读这一份数据；
//  - 只写真实做过的事：代码检查通过 ≠ 实机验证，未实测的项目要写进 pending；
//  - 版本号与 releaseId 只在真正发布时更新，开发过程中的刷新不会反复弹通知；
//  - 同一个 releaseId 关掉一次就不再弹，但可以在设置里随时查看全部。

import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import { RELEASES, type Release } from "./update-log-data";

export {
  CATEGORY_LABEL,
  RELEASES,
  type Release,
  type UpdateCategory,
  type UpdateEntry,
} from "./update-log-data";

const SEEN_KEY = "ai_phone_update_log_seen_v1";
registerKvMigration(SEEN_KEY);


export function latestRelease(): Release {
  return RELEASES[0];
}

export function findRelease(releaseId: string): Release | null {
  return RELEASES.find((release) => release.releaseId === releaseId) ?? null;
}

type SeenMap = Record<string, string>;

function loadSeen(): SeenMap {
  try {
    const raw = kvGet(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

/** 这一版是否已经读过（只有主动关闭或确认才算读）。 */
export function hasSeenRelease(releaseId: string): boolean {
  return Boolean(loadSeen()[releaseId]);
}

export function markReleaseSeen(releaseId: string): void {
  const seen = loadSeen();
  if (seen[releaseId]) return;
  kvSet(SEEN_KEY, JSON.stringify({ ...seen, [releaseId]: new Date().toISOString() }));
}

/** 全部已读状态（设置里展示用）。 */
export function seenReleases(): SeenMap {
  return loadSeen();
}
