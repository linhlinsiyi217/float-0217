// lib/app-uninstall-state.ts — 已卸载应用清单（轻量模块）。
// 只依赖 kv-db，供布局归一化与卸载引擎共用，避免把重依赖带进布局模块。

import { kvGet, kvSet, registerKvMigration } from "./kv-db";

const UNINSTALLED_KEY = "ai_phone_uninstalled_apps_v1";
registerKvMigration(UNINSTALLED_KEY);

export function loadUninstalledApps(): Set<string> {
  try {
    const raw = kvGet(UNINSTALLED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

export function isAppUninstalled(iconId: string): boolean {
  return loadUninstalledApps().has(iconId);
}

export function markAppUninstalled(iconId: string): void {
  const set = loadUninstalledApps();
  set.add(iconId);
  kvSet(UNINSTALLED_KEY, JSON.stringify(Array.from(set)));
}

export function restoreApp(iconId: string): void {
  const set = loadUninstalledApps();
  if (!set.delete(iconId)) return;
  kvSet(UNINSTALLED_KEY, JSON.stringify(Array.from(set)));
}
