// lib/app-uninstall.ts — 模拟小手机的全局应用卸载。
//
// 设计原则：
// - 卸载只作用于「当前用户已安装的应用」，不动公开仓库源文件、不删全站后端、不替其他用户卸载。
// - 按应用归属删除数据，绝不用 clear() 清空整个数据库或整站存储。
// - 内置应用卸载后必须记住，否则 normalizeLayout 的默认兜底会把图标加回来。
// - 数据清理规则集中在 APP_DATA 登记表；没有登记的应保持图标移除但如实报告。

import { kvGet, kvSet, kvRemove, kvKeysWithPrefix } from "./kv-db";
import { customAppIdFromIconId } from "./custom-app-types";
import { uninstallCustomAppAsync } from "./custom-app-storage";
import { removeCustomAppRegistrationsAsync } from "./custom-app-registration";
import { deleteDatabase } from "./data-management/idb";
import { closeReadingStorage } from "./reading-storage";
import { loadCoreadRefs, forgetCoreadRefs } from "./study-room-coread";
import { deleteChatSession } from "./chat-storage";
import { markAppUninstalled } from "./app-uninstall-state";
import type { DesktopIconId, IconId } from "./desktop-config";

export { loadUninstalledApps, isAppUninstalled, markAppUninstalled, restoreApp } from "./app-uninstall-state";

/** 自定义 APP 在宿主侧按 appId 存的固定键（卸载时之前不会清理）。 */
const CUSTOM_APP_HOST_KEYS = [
  "ai_phone_custom_app_notifications_v1",
  "ai_phone_custom_app_badges_v1",
  "ai_phone_custom_app_tasks_v1",
  "ai_phone_custom_app_world_activations_v1",
  "ai_phone_custom_app_suggestions_v1",
];

// ── 数据归属登记表 ──

export type AppDataDescriptor = {
  /** 完整 kv 键 */
  kvKeys?: string[];
  /** kv 键前缀（会删除所有匹配键） */
  kvPrefixes?: string[];
  /** 需要整体删除的 IndexedDB 数据库 */
  databases?: string[];
  /** 额外清理（如关闭连接、删除该应用的会话） */
  cleanup?: () => void | Promise<void>;
  /** 面向用户的说明：卸载会删掉什么 */
  dataLabel: string;
};

export const APP_DATA: Partial<Record<IconId, AppDataDescriptor>> = {
  studyroom: {
    kvKeys: [
      "ai_phone_reading_interaction_config_v1",
      "ai_phone_reading_appearance_v1",
      "ai_phone_studyroom_coread_sessions_v1",
    ],
    databases: ["reading-db", "reading-raw-files", "reading-appearance-assets"],
    cleanup: async () => {
      // 先断开 Dexie 连接，再删除该书的共读会话
      closeReadingStorage();
      for (const ref of loadCoreadRefs()) {
        deleteChatSession(ref.sessionId);
      }
      forgetCoreadRefs(() => true);
    },
    dataLabel: "书籍、阅读进度、书签、书摘、批注、共读记录与阅读设置",
  },
};

/** 某应用是否登记了数据清理规则。 */
export function hasDataRule(iconId: string): boolean {
  return Boolean(APP_DATA[iconId as IconId]);
}

export function dataLabelFor(iconId: string): string {
  return APP_DATA[iconId as IconId]?.dataLabel ?? "";
}

// ── 执行清理 ──

async function cleanBuiltinData(iconId: IconId): Promise<boolean> {
  const descriptor = APP_DATA[iconId];
  if (!descriptor) return false;

  for (const key of descriptor.kvKeys ?? []) kvRemove(key);
  for (const prefix of descriptor.kvPrefixes ?? []) {
    for (const key of kvKeysWithPrefix(prefix)) kvRemove(key);
  }
  if (descriptor.cleanup) await descriptor.cleanup();
  for (const dbName of descriptor.databases ?? []) {
    await deleteDatabase(dbName).catch((err) => {
      console.warn("[uninstall] 删除数据库失败:", dbName, err);
    });
  }
  return true;
}

/** 从自定义 APP 的宿主侧固定键里剔除该 appId（数组或 map 两种形状）。 */
function pruneAppFromHostKeys(appId: string): void {
  for (const key of CUSTOM_APP_HOST_KEYS) {
    const raw = kvGet(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const next = parsed.filter(
          (item) => !(item && typeof item === "object" && (item as { appId?: string }).appId === appId),
        );
        if (next.length !== parsed.length) kvSet(key, JSON.stringify(next));
      } else if (parsed && typeof parsed === "object") {
        if (Object.prototype.hasOwnProperty.call(parsed, appId)) {
          const next = { ...(parsed as Record<string, unknown>) };
          delete next[appId];
          kvSet(key, JSON.stringify(next));
        }
      }
    } catch {
      // 不是 JSON 就跳过
    }
  }
}

export type UninstallResult = {
  iconId: DesktopIconId;
  /** 是否执行了专属数据清理 */
  dataRemoved: boolean;
  /** 已删除内容的说明（未登记时为提示语） */
  detail: string;
};

/**
 * 真正卸载一个应用：解除安装注册、清理专属数据。
 * 桌面/Dock/文件夹的图标移除由调用方（desktop-shell）完成后持久化。
 */
export async function uninstallApp(iconId: DesktopIconId): Promise<UninstallResult> {
  const customAppId = customAppIdFromIconId(iconId);
  if (customAppId) {
    // 自定义 APP：沿用既有卸载链路（注册资源 + 安装记录 + 应用数据），
    // 再补上宿主侧固定键的清理。
    await removeCustomAppRegistrationsAsync(customAppId, { deleteResources: true });
    await uninstallCustomAppAsync(customAppId, { deleteData: true });
    pruneAppFromHostKeys(customAppId);
    return { iconId, dataRemoved: true, detail: "应用本体、其配置、记录与专属文件" };
  }

  const builtinId = iconId as IconId;
  markAppUninstalled(builtinId);

  const removed = await cleanBuiltinData(builtinId);
  return {
    iconId,
    dataRemoved: removed,
    detail: removed
      ? dataLabelFor(builtinId)
      : "该应用数据清理规则尚未登记，此次只移除了图标与入口，未删除其数据。",
  };
}
