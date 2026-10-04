// lib/update-log/studyroom.ts — 书房应用自己的更新记录（读取与已读状态）。
//
// 与系统更新分开：书房只在自己有新版本时弹便签，系统更新不会触发书房弹窗。

import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import { STUDYROOM_RELEASES } from "./studyroom-data";
import type { Release } from "./types";

const SEEN_KEY = "ai_phone_studyroom_update_seen_v1";
registerKvMigration(SEEN_KEY);

export const STUDYROOM_RELEASE_LIST: Release[] = STUDYROOM_RELEASES;

export function latestStudyRoomRelease(): Release {
  return STUDYROOM_RELEASES[0];
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

export function hasSeenStudyRoomRelease(releaseId: string): boolean {
  return Boolean(loadSeen()[releaseId]);
}

export function markStudyRoomReleaseSeen(releaseId: string): void {
  const seen = loadSeen();
  if (seen[releaseId]) return;
  kvSet(SEEN_KEY, JSON.stringify({ ...seen, [releaseId]: new Date().toISOString() }));
}

export function seenStudyRoomReleases(): SeenMap {
  return loadSeen();
}
