// lib/app-uninstall.ts — 模拟小手机的全局应用卸载。
//
// 设计原则：
// - 卸载只作用于「当前用户已安装的应用」，不动公开仓库源文件、不删全站后端、不替其他用户卸载。
// - 按应用归属删除数据，绝不用 clear() 清空整个数据库或整站存储。
// - 内置应用卸载后必须记住，否则 normalizeLayout 的默认兜底会把图标加回来。
// - 归属规则集中在 lib/app-uninstall-data.ts；没有独占数据或未登记的应用，
//   只移除图标与入口，并如实报告，不去乱删共享数据。

import { kvGet, kvSet, kvRemove, kvKeysWithPrefix } from "./kv-db";
import { customAppIdFromIconId } from "./custom-app-types";
import { uninstallCustomAppAsync } from "./custom-app-storage";
import { removeCustomAppRegistrationsAsync } from "./custom-app-registration";
import { deleteDatabase } from "./data-management/idb";
import { loadChatSessions, deleteChatSession } from "./chat-storage";
import { loadCoreadRefs, forgetCoreadRefs } from "./study-room-coread";
import { markAppUninstalled } from "./app-uninstall-state";
import { APP_DATA_SPEC } from "./app-uninstall-data";
import type { DesktopIconId, IconId } from "./desktop-config";

// 删除数据库前必须断开的 Dexie 连接
import { closeReadingStorage } from "./reading-storage";
import { closeCheckPhoneStorage } from "./checkphone-storage";
import { closeDwellingStorage } from "./dwelling-storage";
import { closeMapStorage } from "./map-storage";
import { closeStoryStorage } from "./story-storage";
import { closeVnStorage } from "./vn-storage";
import { closeMomentsStorage } from "./moments-db";
// 卸载时需要停掉的应用专属后台服务
import { stopDiaryEntryTimerService } from "./diary-entry-timer-service";
import { stopMomentsService } from "./moments-engine";

export { loadUninstalledApps, isAppUninstalled, markAppUninstalled, restoreApp } from "./app-uninstall-state";

/** 自定义 APP 在宿主侧按 appId 存的固定键（卸载时必须清理）。 */
const CUSTOM_APP_HOST_KEYS = [
  "ai_phone_custom_app_notifications_v1",
  "ai_phone_custom_app_badges_v1",
  "ai_phone_custom_app_tasks_v1",
  "ai_phone_custom_app_world_activations_v1",
  "ai_phone_custom_app_suggestions_v1",
];

const CLOSERS: Record<string, () => void> = {
  reading: closeReadingStorage,
  checkphone: closeCheckPhoneStorage,
  dwelling: closeDwellingStorage,
  map: closeMapStorage,
  story: closeStoryStorage,
  vn: closeVnStorage,
  moments: closeMomentsStorage,
};

const SERVICE_STOPPERS: Record<string, () => void> = {
  diary: stopDiaryEntryTimerService,
  moments: stopMomentsService,
};

/** 特殊清理：涉及跨会话/跨存储的处理。 */
function runSpecial(kind: string): void {
  if (kind === "chat-sessions-except-coread-and-group") {
    // 私聊会话可删；书房的共读会话与群聊共用同一存储，必须保留。
    for (const session of loadChatSessions()) {
      if (session.id.startsWith("coread_") || session.isGroup) continue;
      deleteChatSession(session.id);
    }
    return;
  }
  if (kind === "coread-sessions") {
    for (const ref of loadCoreadRefs()) deleteChatSession(ref.sessionId);
    forgetCoreadRefs(() => true);
  }
}

/** 某应用是否有需要清理的独占数据。 */
export function hasDataRule(iconId: string): boolean {
  const spec = APP_DATA_SPEC[iconId];
  return Boolean(spec && !spec.noOwnData);
}

export function dataLabelFor(iconId: string): string {
  return APP_DATA_SPEC[iconId]?.dataLabel ?? "";
}

/** 无独占数据时的说明（用于确认框与结果提示）。 */
export function sharedNoteFor(iconId: string): string {
  return APP_DATA_SPEC[iconId]?.note ?? "";
}

async function cleanBuiltinData(iconId: IconId): Promise<boolean> {
  const spec = APP_DATA_SPEC[iconId];
  if (!spec || spec.noOwnData) return false;

  for (const key of spec.kvKeys ?? []) kvRemove(key);
  for (const prefix of spec.kvPrefixes ?? []) {
    for (const key of kvKeysWithPrefix(prefix)) kvRemove(key);
  }
  for (const closer of spec.closers ?? []) CLOSERS[closer]?.();
  if (spec.special) runSpecial(spec.special);
  for (const service of spec.stopServices ?? []) SERVICE_STOPPERS[service]?.();
  for (const dbName of spec.databases ?? []) {
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
  /** 已删除内容的说明，或未删除时的原因 */
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
  if (removed) {
    return { iconId, dataRemoved: true, detail: dataLabelFor(builtinId) };
  }
  return {
    iconId,
    dataRemoved: false,
    detail: sharedNoteFor(builtinId) || "该应用没有独占数据，只移除了图标与入口。",
  };
}
