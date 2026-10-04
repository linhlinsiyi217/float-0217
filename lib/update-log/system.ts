// lib/update-log/system.ts — 小手机整体项目的更新记录（读取与已读状态）。
//
// 与书房自己的更新记录（./studyroom.ts）完全分开：各自版本号、各自已读标记、各自存储键。

import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import { SYSTEM_RELEASES } from "./system-data";
import type { Release } from "./types";

const SEEN_KEY = "ai_phone_update_log_seen_v1";
registerKvMigration(SEEN_KEY);

export {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  popupEntries,
  releaseApps,
  releaseCounts,
  type Release,
  type UpdateCategory,
  type UpdateEntry,
} from "./types";

export const SYSTEM_RELEASE_LIST: Release[] = SYSTEM_RELEASES;

export function latestSystemRelease(): Release {
  return SYSTEM_RELEASES[0];
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

export function hasSeenSystemRelease(releaseId: string): boolean {
  return Boolean(loadSeen()[releaseId]);
}

export function markSystemReleaseSeen(releaseId: string): void {
  const seen = loadSeen();
  if (seen[releaseId]) return;
  kvSet(SEEN_KEY, JSON.stringify({ ...seen, [releaseId]: new Date().toISOString() }));
}

export function seenSystemReleases(): SeenMap {
  return loadSeen();
}
