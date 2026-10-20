Warning: truncated output (original token count: 60582)
Total output lines: 5425

"use client";

import { Component, memo, useCallback, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from "react";

import { updateStatusBarTone } from "@/lib/bg-tone";
import { startDiaryEntryTimerService, stopDiaryEntryTimerService } from "@/lib/diary-entry-timer-service";
import { startFollowUpService, stopFollowUpService } from "@/lib/follow-up-service";
import { startMomentsService, stopMomentsService } from "@/lib/moments-engine";
import { bgTimerCleanup } from "@/lib/bg-timer";
import { PhoneThemeApp } from "@/components/phone-theme-app";
import { PhoneCharacterApp } from "@/components/phone-character-app";
import { PhoneSettingsApp, type SettingsSubPage } from "@/components/phone-settings-app";
import { PhoneChatApp } from "@/components/chat/phone-chat-app";
import { PhonePlaceholderApp } from "@/components/phone-placeholder-app";
import MusicApp from "@/components/music/music-app";
import MusicPlayer from "@/components/music/music-player";
import MusicFloat from "@/components/music/music-float";
import MusicDynamicIsland from "@/components/music/music-dynamic-island";
import MiniAppWindow from "@/components/music/mini-app-window";
import { PhoneCalendarApp } from "@/components/calendar-app";
import { PhoneQaApp } from "@/components/phone-qa-app";
import { ChatPluginPageBoundary } from "@/components/chat/chat-plugin-page-boundary";
import { ResourceHubApp } from "@/components/resource-hub/resource-hub-app";
import "@/lib/qa-error-log";
import { RealityBridgeApp } from "@/components/reality-bridge-app";
import { REALITY_BRIDGE_APP_EVENT_NAME, REALITY_BRIDGE_DATA_EVENT } from "@/lib/reality-bridge/types";
import { DiaryApp } from "@/components/diary/diary-app";
import { XiaohongshuApp } from "@/components/xiaohongshu/xiaohongshu-app";
import { StoryApp } from "@/components/story/story-app";
import { VnApp } from "@/components/vn/vn-app";
import StudyRoomApp from "@/components/study-room/study-room-app";
import MapApp from "@/components/map/map-app";
import { DwellingApp } from "@/components/dwelling/dwelling-app";
import { MascotFloat } from "@/components/mascot/mascot-float";
import { PerceptionBootstrap } from "@/components/perception/perception-bootstrap";
import { MascotPreviewHost } from "@/components/mascot/mascot-preview-host";
import { useMusicControlsOptional } from "@/lib/music-context";
import { PhoneResourcesApp, type ResourceSubPage } from "@/components/phone-resources-app";
import { CheckPhoneApp } from "@/components/checkphone/checkphone-app";
import { ShoppingApp } from "@/components/shopping/shopping-app";
import { GameHubApp } from "@/components/game/game-hub-app";
import { MixologyApp } from "@/components/mixology/mixology-app";
import InterviewMagazineApp from "@/components/interview/interview-magazine-app";
import { CoCreateApp } from "@/components/cocreate/cocreate-app";
import { AppMarketApp } from "@/components/app-market/app-market-app";
import { CustomAppRunner } from "@/components/app-market/custom-app-runner";
import { CustomAppForegroundBoundary } from "@/components/app-market/custom-app-failure";
import { hydrateKvDb, kvGet, kvSet, kvRemove, kvKeysWithPrefix } from "@/lib/kv-db";
import { uninstallApp, restoreApp, loadUninstalledApps, isAppUninstalled, hasDataRule, dataLabelFor } from "@/lib/app-uninstall";
import { ConfirmDialog, BottomSheet } from "@/components/ui/modal";
import { deleteDatabase } from "@/lib/data-management/idb";
import { hydrateStoryStorage } from "@/lib/story-storage";
import { hydrateMomentsStorage } from "@/lib/moments-storage";
import { hydrateVnStorage } from "@/lib/vn-storage";
import { hydrateSettingsDb } from "@/lib/settings-db";
import { hydrateDwellingStorage } from "@/lib/dwelling-storage";
import { hydrateCheckPhoneStorage } from "@/lib/checkphone-storage";
import {
  DOCK_DEFAULT,
  ICONS,
  PAGE_1_DEFAULT,
  PAGE_2_DEFAULT,
  PAGE_3_DEFAULT,
  createFolderIconId,
  isFolderIconId,
  type DesktopIconId,
  type IconId,
  type IconPosition
} from "@/lib/desktop-config";
import { customAppIdFromIconId, isCustomAppIconId, toCustomAppIconId } from "@/lib/custom-app-types";
import type { InstalledCustomApp } from "@/lib/custom-app-types";
import {
  registerCustomAppBackgroundToolExecutor,
  type CustomAppToolExecutorPayload,
} from "@/lib/custom-app-tool-runtime";
import {
  CUSTOM_APPS_UPDATED_EVENT,
  CUSTOM_APP_PLACE_DESKTOP_EVENT,
  loadCustomAppIconStyles,
  loadInstalledCustomApps,
  type CustomAppIconStyle,
} from "@/lib/custom-app-storage";
import {
  isCustomAppMarketItemNewerThanInstalled,
  resolveCustomAppMarketItemForInstalled,
  updateInstalledCustomAppFromMarket,
} from "@/lib/custom-app-market-update";
import type { CustomAppMarketItem } from "@/lib/custom-app-market-types";
import {
  CUSTOM_APP_HOST_STATE_UPDATED_EVENT,
  loadCustomAppBadges,
  runDueCustomAppTasks,
} from "@/lib/custom-app-host-api";
import { CustomAppGlyph, IconGlyph } from "@/components/icon-glyph";
import { DesktopCustomizer } from "@/components/desktop-customizer";
import {
  collectThemeAssetIds,
  getThemeAssetMap,
  readThemeProfile,
  writeThemeProfile
} from "@/lib/theme-storage";
import { THEME_PACKAGE_INSTALLED_EVENT } from "@/lib/theme-package";
import {
  DEFAULT_THEME_PROFILE,
  DEFAULT_FONT_FAMILY,
  normalizeThemeProfile,
  resolveActiveIconSkins,
  type ThemeProfile
} from "@/lib/theme-types";
import { GRID_COLS, GRID_ROWS, WIDGET_SIZE_CELLS, WIDGET_CATALOG, type WidgetInstance, type WidgetType } from "@/lib/widget-types";
import { buildOccupancyGrid, canPlaceWidget, placeWidget, createDefaultWidgets, loadWidgets, saveWidgets, loadDIYTemplates, saveDIYTemplates } from "@/lib/widget-storage";
import {
  createDefaultDesktopIconLayout,
  getDesktopIconLayoutItems,
  getDesktopPageKey,
  getDesktopPageKeys,
  getDesktopPageNumber,
  loadDockLayout,
  normalizeDock,
  writeDockLayout,
  loadDesktopFolders,
  writeDesktopFolders,
  DOCK_LAYOUT_STORAGE_KEY,
  DOCK_MAX,
  type DesktopFolderMap,
  type DesktopIconLayout,
  type DesktopPageKey,
} from "@/lib/desktop-layout-storage";
import { WidgetRenderer } from "@/components/widgets/widget-renderer";
import type { DIYWidgetTemplate } from "@/lib/widget-types";
import { DebugPromptPanel } from "@/components/debug-prompt-panel";
import { QuickActionFloat } from "@/components/quick-action-float";
import { CHAT_MESSAGE_PUSHED_EVENT, CHAT_REQUEST_REPLY_EVENT, findChatSessionById, hydrateChatStorage, loadChatSessions, loadChatMessages, pushChatMessage, type ChatMessage, type ChatSession } from "@/lib/chat-storage";
import { ensureGlobalBindingDefaults, resolveUserIdentity } from "@/lib/settings-storage";
import { loadCharacters } from "@/lib/character-storage";
import { generateChatCompletion, flattenCompletionResult } from "@/lib/chat-engine";
import { parseAIResponse } from "@/lib/rich-message-parser";
import { requestBackgroundChatReply, scheduleFollowUp } from "@/lib/follow-up-service";
import { CHAT_MESSAGE_NOTICE_EVENT, CHAT_OPEN_SESSION_EVENT, type ChatMessageNoticeDetail } from "@/lib/chat-notification-events";
import { startIncomingCallVibration } from "@/lib/call-vibration";
import { CallLayer } from "@/components/chat/call-layer";
import { installChatSoundListener, playChatSoundOnce, setMiniChatSoundSessionId, startChatSoundLoop } from "@/lib/chat-sound";
import { setMascotContext } from "@/lib/mascot-context";
import { DESKTOP_WIDGETS_CHANGED_EVENT } from "@/lib/mascot-events";
import { useWeixinBridge } from "@/lib/use-weixin-bridge";
import { startWeixinCloudRealtimeSync } from "@/lib/weixin-cloud-sync";
import { WeixinSyncToast } from "@/components/weixin-sync-toast";
import { sendBrowserNotification } from "@/lib/browser-notification";
import { canSendShellNotification, sendShellNotification } from "@/lib/shell-notify";
import type { ChatSharePayload } from "@/lib/chat-share";
import { completePendingMcpOAuthCallback } from "@/lib/tool-executor";
import { LayoutGrid, LoaderCircle, RefreshCw } from "lucide-react";

const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla"';

const ICON_LAYOUT_STORAGE_KEY = "ai_phone_icon_layout_v2";
const ICON_LAYOUT_STORAGE_KEY_V1 = "ai_phone_icon_layout_v1";
// Sentinel "page" used by the drag engine to mean "the dock". getDesktopPageNumber
// returns 0 for it and getDesktopPageKeys filters it out, so page iteration never
// treats the dock as a real page.
const DOCK_PAGE_KEY = "dock" as const;
type DragPageKey = DesktopPageKey | typeof DOCK_PAGE_KEY;
const SWIPE_THRESHOLD_RATIO = 0.2;
const SWIPE_MIN_THRESHOLD = 60;

function parseColorAlpha(value: string): { hex: string; alpha: number } {
  const rgbaMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = Number(rgbaMatch[1]);
    const g = Number(rgbaMatch[2]);
    const b = Number(rgbaMatch[3]);
    const alpha = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;
    const hex = `#${[r, g, b].map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
    return { hex, alpha: Math.max(0, Math.min(1, alpha)) };
  }

  if (value.startsWith("#")) {
    if (value.length === 9) {
      const alpha = parseInt(value.slice(7, 9), 16) / 255;
      return { hex: value.slice(0, 7), alpha: Math.max(0, Math.min(1, alpha)) };
    }
    if (value.length === 4) {
      return {
        hex: `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`,
        alpha: 1
      };
    }
    return { hex: value, alpha: 1 };
  }

  return { hex: "#000000", alpha: 1 };
}

function buildRgbaColor(hex: string, alpha: number): string {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (safeAlpha >= 1) return hex;
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function toCssPx(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return /[a-z%]/i.test(value) ? value : `${value}px`;
}

const TEXT = {
  ariaDesktopIcons: "\u684C\u9762\u56FE\u6807",
  backDesktop: "\u8FD4\u56DE\u684C\u9762",
  placeholderTitle: "\u529F\u80FD\u5360\u4F4D",
  placeholderBody:
    "\u8BE5\u5165\u53E3\u5DF2\u5728\u4EFF\u771F\u624B\u673A\u5185\u9884\u7559\uff0C\u540E\u7EED\u5F00\u53D1\u65F6\u4F1A\u5728\u624B\u673A\u754C\u9762\u5185\u5B8C\u6210\u529F\u80FD\u3002"
};

type DesktopLayout = DesktopIconLayout;

type DesktopShellProps = {
  initialThemeProfile?: ThemeProfile | null;
  initialThemeAssets?: Record<string, string>;
};

type CustomAppReturnTarget = {
  appId: "chat";
  sessionId?: string;
};

type CustomAppLaunchState = {
  appId: string;
  context: Record<string, unknown>;
  returnTo?: CustomAppReturnTarget | null;
};

type CustomAppBackgroundEventRun = {
  id: string;
  app: InstalledCustomApp;
  eventName: string;
  payload: Record<string, unknown>;
  launchContext: Record<string, unknown>;
  timeoutMs?: number;
};

type CustomAppBackgroundToolRun = {
  id: string;
  app: InstalledCustomApp;
  payload: CustomAppToolExecutorPayload;
  launchContext: Record<string, unknown>;
  timeoutMs?: number;
};

type PendingCustomAppBackgroundTool = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

type PendingCustomAppUpdatePrompt = {
  app: InstalledCustomApp;
  item: CustomAppMarketItem;
  launchContext: Record<string, unknown>;
};

const CHAT_CUSTOM_APP_RETURN_SOURCES = new Set(["chat_plus_action", "chat_card", "chat_directive"]);
const CUSTOM_APP_BACKGROUND_RUNNER_TIMEOUT_MS = 5 * 60_000;

type CustomAppEventRecord = {
  event?: unknown;
  entry?: unknown;
  background?: unknown;
  timeoutMs?: unknown;
};

type CustomAppBackgroundRunnerBoundaryProps = {
  runId: string;
  kind: "event" | "tool";
  children: ReactNode;
  onEventError?: (runId: string, result: { ok: boolean; reason: string; errors?: string[] }) => void;
  onToolError?: (runId: string, result: { ok: boolean; reason: string; result?: unknown; error?: string }) => void;
};

type CustomAppBackgroundRunnerBoundaryState = {
  failed: boolean;
};

class CustomAppBackgroundRunnerBoundary extends Component<CustomAppBackgroundRunnerBoundaryProps, CustomAppBackgroundRunnerBoundaryState> {
  state: CustomAppBackgroundRunnerBoundaryState = { failed: false };

  static getDerivedStateFromError(): CustomAppBackgroundRunnerBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[CustomAppBackground] ${this.props.runId} runner crashed: ${message}`, info.componentStack);
    if (this.props.kind === "event") {
      this.props.onEventError?.(this.props.runId, {
        ok: false,
        reason: "runner_crashed",
        errors: [message],
      });
      return;
    }
    this.props.onToolError?.(this.props.runId, {
      ok: false,
      reason: "runner_crashed",
      error: message,
    });
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function customAppReturnTargetFromLaunchContext(context: Record<string, unknown>): CustomAppReturnTarget | null {
  const source = String(context.source ?? "");
  if (!CHAT_CUSTOM_APP_RETURN_SOURCES.has(source)) return null;
  const sessionId = typeof context.sessionId === "string" && context.sessionId.trim() ? context.sessionId.trim() : undefined;
  return { appId: "chat", sessionId };
}

function isCustomAppEventRecord(value: unknown): value is CustomAppEventRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function customAppBackgroundTimeoutMs(value: unknown): number {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.min(timeoutMs, 30 * 60_000)
    : CUSTOM_APP_BACKGROUND_RUNNER_TIMEOUT_MS;
}

function customAppEventSubscriptions(app: InstalledCustomApp): CustomAppEventRecord[] {
  const canonical = Array.isArray(app.manifest.extensions?.events) ? app.manifest.extensions.events : [];
  const legacy = Array.isArray(app.manifest.events) ? app.manifest.events : [];
  return (canonical.length > 0 ? canonical : legacy).filter(isCustomAppEventRecord);
}

function getBackgroundChatMessageSubscription(app: InstalledCustomApp) {
  return customAppEventSubscriptions(app).find(event => (
    event.background === true
    && (event.event === "chat.message.created" || event.event === "*")
  ));
}

function serializeCustomAppBackgroundMessage(message: ChatMessage): Record<string, unknown> {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: String(message.content ?? ""),
    createdAt: message.createdAt,
    status: message.status,
    senderName: message.senderName,
    mediaType: message.mediaType,
    mediaData: message.mediaData && typeof message.mediaData === "object" ? message.mediaData : undefined,
    isRetracted: message.isRetracted === true,
    origin: message.origin,
  };
}

/** Convert an IconId array into absolute positions (flow left-to-right, top-to-bottom) */
function flowIconsToPositions(icons: IconId[]): IconPosition[] {
  const result: IconPosition[] = [];
  let idx = 0;
  for (let r = 0; r < GRID_ROWS && idx < icons.length; r++) {
    for (let c = 0; c < GRID_COLS && idx < icons.length; c++) {
      result.push({ id: icons[idx], row: r + 1, col: c + 1 });
      idx++;
    }
  }
  return result;
}

const DEFAULT_LAYOUT: DesktopLayout = createDefaultDesktopIconLayout(createDefaultWidgets());

function getDesktopPageKeysForState(layout: DesktopLayout, widgets: WidgetInstance[] = []): DesktopPageKey[] {
  const maxPage = Math.max(
    2,
    ...getDesktopPageKeys(layout).map(getDesktopPageNumber),
    ...widgets.map((widget) => widget.page).filter((page) => Number.isInteger(page) && page >= 1)
  );
  return Array.from({ length: maxPage }, (_, index) => getDesktopPageKey(index + 1));
}

function cloneDesktopLayout(layout: DesktopLayout, widgets: WidgetInstance[] = []): DesktopLayout {
  const next = {} as DesktopLayout;
  for (const pageKey of getDesktopPageKeysForState(layout, widgets)) {
    next[pageKey] = [...(layout[pageKey] ?? [])];
  }
  return next;
}

function ensureDesktopPage(layout: DesktopLayout, pageKey: DesktopPageKey): void {
  if (!layout[pageKey]) layout[pageKey] = [];
}

function trimEmptyTrailingPages(layout: DesktopLayout, widgets: WidgetInstance[]): DesktopLayout {
  const next = cloneDesktopLayout(layout, widgets);
  let maxPage = Math.max(2, ...getDesktopPageKeysForState(next, widgets).map(getDesktopPageNumber));
  while (maxPage > 2) {
    const pageKey = getDesktopPageKey(maxPage);
    const hasIcons = (next[pageKey] ?? []).length > 0;
    const hasWidgets = widgets.some((widget) => widget.page === maxPage);
    if (hasIcons || hasWidgets) break;
    delete next[pageKey];
    maxPage -= 1;
  }
  return next;
}

function getInstalledCustomIconIds(): Set<string> {
  return new Set(loadInstalledCustomApps().map(app => toCustomAppIconId(app.id)));
}

function migrateLegacyDesktopIconId(id: string, customIconIds = getInstalledCustomIconIds()): DesktopIconId | null {
  if (id === "weibo") return "game";
  if (id === "fortune") return "interview_magazine";
  if (id === "forum") return "cocreate";
  if (isCustomAppIconId(id) && customIconIds.has(id)) return id;
  return id in ICONS ? id as IconId : null;
}

/** Validate an IconPosition[] page, dedup by id and position */
function normalizePageV2(raw: unknown, pageWidgets: WidgetInstance[], folderIds: Set<string> = new Set()): IconPosition[] {
  if (!Array.isArray(raw)) return [];

  const allKnown = new Set<string>(Object.keys(ICONS));
  const customIconIds = getInstalledCustomIconIds();
  const seenIds = new Set<DesktopIconId>();
  const seenCells = new Set<string>();
  const widgetOcc = buildWidgetOccupancy(pageWidgets);
  const result: IconPosition[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, row, col } = item as { id: string; row: number; col: number };
    if (typeof id !== "string" || typeof row !== "number" || typeof col !== "number") continue;
    // 文件夹 tile：只认内容表里真实存在的文件夹，防止幽灵 tile
    const iconId = isFolderIconId(id)
      ? (folderIds.has(id) ? id : null)
      : migrateLegacyDesktopIconId(id, customIconIds);
    if (!iconId || (!isFolderIconId(iconId) && !allKnown.has(iconId) && !customIconIds.has(iconId))) continue;
    if (!isFolderIconId(iconId) && isAppUninstalled(iconId)) continue;
    if (seenIds.has(iconId)) continue;
    if (row < 1 || row > GRID_ROWS || col < 1 || col > GRID_COLS) continue;
    const cellKey = `${row},${col}`;
    if (seenCells.has(cellKey)) continue;
    if (widgetOcc[row - 1][col - 1]) continue;
    seenIds.add(iconId);
    seenCells.add(cellKey);
    result.push({ id: iconId, row, col });
  }

  return result;
}

/** Migrate v1 (array of IconId|null) to v2 (IconPosition[]) */
function migratePageV1(raw: unknown, defaults: IconId[], pageWidgets: WidgetInstance[]): IconPosition[] {
  const allowed = new Set<IconId>(defaults);
  const seen = new Set<IconId>();
  const ordered: (IconId | null)[] = [];

  const rawItems = Array.isArray(raw) ? raw : [];
  for (const item of rawItems) {
    if (item === null) { ordered.push(null); continue; }
    if (typeof item !== "string") continue;
    const id = migrateLegacyDesktopIconId(item);
    if (!id || !(id in ICONS)) continue;
    const builtinId = id as IconId;
    if (!allowed.has(builtinId) || seen.has(builtinId)) continue;
    seen.add(builtinId);
    ordered.push(builtinId);
  }
  for (const id of defaults) {
    if (!seen.has(id)) ordered.push(id);
  }

  // Flow into absolute positions (same as old computeIconPositions)
  const widgetOcc = buildWidgetOccupancy(pageWidgets);
  const freeCells: { row: number; col: number }[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!widgetOcc[r][c]) freeCells.push({ row: r + 1, col: c + 1 });
    }
  }
  const result: IconPosition[] = [];
  let fi = 0;
  for (const slot of ordered) {
    if (fi >= freeCells.length) break;
    if (slot === null) { fi++; continue; }
    result.push({ id: slot, ...freeCells[fi] });
    fi++;
  }
  return result;
}

function normalizeLayout(raw: unknown, widgets: WidgetInstance[], dockIds: Set<DesktopIconId> = new Set(), folders: DesktopFolderMap = {}): DesktopLayout {
  if (!raw || typeof raw !== "object") return createDefaultDesktopIconLayout(widgets);
  const candidate = raw as Record<string, unknown>;
  const folderIds = new Set(Object.keys(folders));
  const maxPage = Math.max(
    2,
    ...Object.keys(candidate).map(getDesktopPageNumber),
    ...widgets.map((widget) => widget.page).filter((page) => Number.isInteger(page) && page >= 1)
  );
  const layout = {} as DesktopLayout;
  for (let page = 1; page <= maxPage; page += 1) {
    const pageKey = getDesktopPageKey(page);
    // Icons that live in the dock must never also appear on a page.
    layout[pageKey] = normalizePageV2(candidate[pageKey], widgets.filter(w => w.page === page), folderIds)
      .filter((ic) => !dockIds.has(ic.id));
  }

  // Ensure all default icons exist somewhere across desktop pages (but not ones
  // the user has moved into the dock). DOCK_DEFAULT 也纳入兜底：若某默认 dock
  // 图标（如设置）既不在任何页面也不在 dock（如恢复默认/导入主题后 dock 未含它），
  // 就近放回页面，防止图标彻底丢失。
  // 「已放置」包括藏在文件夹里的图标，否则重启后文件夹成员会被兜底复制一份铺回桌面。
  const allPlaced = new Set<DesktopIconId>(getDesktopIconLayoutItems(layout).map(ic => ic.id));
  for (const folder of Object.values(folders)) {
    for (const memberId of folder.icons) allPlaced.add(memberId);
  }
  const allDefaults = [...PAGE_1_DEFAULT, ...PAGE_2_DEFAULT, ...PAGE_3_DEFAULT, ...DOCK_DEFAULT];

  for (const id of allDefaults) {
    if (allPlaced.has(id) || dockIds.has(id) || isAppUninstalled(id)) continue;
    const primaryPage = PAGE_1_DEFAULT.includes(id) ? 1 : PAGE_2_DEFAULT.includes(id) ? 2 : PAGE_3_DEFAULT.includes(id) ? 3 : 1;
    // placeIconOnAvailablePage 页满会顺延到下一页乃至新开一页——
    // 曾经这里只在现有页里找空格，页面被图标和组件占满时就静默放弃，
    // 图标（如外观）从此永久丢失且每次重启都救不回
    placeIconOnAvailablePage(layout, widgets, { id, row: 1, col: 1 }, primaryPage);
    allPlaced.add(id);
  }

  return trimEmptyTrailingPages(layout, widgets);
}

/**
 * 文件夹与布局的一致性收拾：
 * - 成员若已经出现在页面/dock 上（以摆出来的为准），从文件夹里摘除；
 * - 卸载掉的自定义 APP 成员摘除（normalizeDesktopFolders 已管，这里兜底运行时变化）；
 * - 只剩 ≤1 个成员的文件夹解散：剩下的图标顶回 tile 原来的格子；
 * - 布局里指向不存在文件夹的 tile 由 normalizeLayout 过滤，这里不重复。
 * 返回新对象；changed=false 时引用原样返回，调用方可以跳过持久化。
 */
function sanitizeDesktopFolders(
  folders: DesktopFolderMap,
  layout: DesktopLayout,
  dock: DesktopIconId[],
  widgets: WidgetInstance[],
): { folders: DesktopFolderMap; layout: DesktopLayout; changed: boolean } {
  const placedOutside = new Set<DesktopIconId>([
    ...getDesktopIconLayoutItems(layout).map(ic => ic.id),
    ...dock,
  ]);
  const customIconIds = getInstalledCustomIconIds();
  let changed = false;
  const nextFolders: DesktopFolderMap = {};
  let nextLayout = layout;

  const removeTile = (folderId: string): { pageKey: DesktopPageKey; row: number; col: number } | null => {
    for (const pageKey of getDesktopPageKeysForState(nextLayout, widgets)) {
      const tile = (nextLayout[pageKey] ?? []).find(ic => ic.id === folderId);
      if (!tile) continue;
      if (nextLayout === layout) nextLayout = cloneDesktopLayout(layout, widgets);
      nextLayout[pageKey] = nextLayout[pageKey].filter(ic => ic.id !== folderId);
      return { pageKey, row: tile.row, col: tile.col };
    }
    return null;
  };

  for (const [folderId, folder] of Object.entries(folders)) {
    const members = folder.icons.filter(id =>
      !placedOutside.has(id)
      && !isFolderIconId(id)
      && (id in ICONS || customIconIds.has(id)));
    if (members.length !== folder.icons.length) changed = true;
    if (members.length <= 1) {
      // 解散：tile 换成剩下的那个图标（若有）
      changed = true;
      const spot = removeTile(folderId);
      const remaining = members[0];
      if (remaining) {
        if (nextLayout === layout) nextLayout = cloneDesktopLayout(layout, widgets);
        if (spot) {
          nextLayout[spot.pageKey] = [...(nextLayout[spot.pageKey] ?? []), { id: remaining, row: spot.row, col: spot.col }];
        } else {
          placeIconOnAvailablePage(nextLayout, widgets, { id: remaining, row: 1, col: 1 }, 1);
        }
      }
      continue;
    }
    nextFolders[folderId] = members.length === folder.icons.length ? folder : { ...folder, icons: members };
    // 崩溃等意外可能造成"文件夹记录在、格子却不在任何页面"：成员被文件夹托管着，
    // 桌面上却什么都不渲染，默认图标兜底又把成员算作"已放置"——图标就永久隐身了
    //（用户表现：某图标凭空消失，恢复默认布局才回来）。这里把格子就近放回页面自愈。
    const tilePlaced = getDesktopIconLayoutItems(nextLayout).some(ic => ic.id === folderId);
    if (!tilePlaced) {
      if (nextLayout === layout) nextLayout = cloneDesktopLayout(layout, widgets);
      placeIconOnAvailablePage(nextLayout, widgets, { id: folderId as DesktopIconId, row: 1, col: 1 }, 1);
      changed = true;
    }
  }
  if (!changed) return { folders, layout, changed: false };
  return { folders: nextFolders, layout: trimEmptyTrailingPages(nextLayout, widgets), changed: true };
}

function StatusClock() {
  const [label, setLabel] = useState("--:--");

  useEffect(() => {
    const update = () => {
      setLabel(
        new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
      );
    };
    update();
    const timer = window.setInterval(update, 10000);
    return () => window.clearInterval(timer);
  }, []);

  return <span className="status-time">{label}</span>;
}

function collectCssOverrides(profile: ThemeProfile): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile.cssOverrides)) {
    if (!key.startsWith("--")) continue;
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    overrides[key] = normalized;
  }
  return overrides;
}

function readInitialThemeProfile(): ThemeProfile {
  if (typeof window === "undefined") {
    return normalizeThemeProfile(DEFAULT_THEME_PROFILE);
  }
  return readThemeProfile();
}

/** Build a boolean grid marking cells occupied by widgets on one page */
function buildWidgetOccupancy(pageWidgets: WidgetInstance[]): boolean[][] {
  const grid: boolean[][] = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => false)
  );
  for (const w of pageWidgets) {
    const [rows, cols] = WIDGET_SIZE_CELLS[w.size];
    for (let dr = 0; dr < rows; dr++) {
      for (let dc = 0; dc < cols; dc++) {
        const r = w.row - 1 + dr;
        const c = w.col - 1 + dc;
        if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
          grid[r][c] = true;
        }
      }
    }
  }
  return grid;
}

/** Convert IconPosition[] to the Map the renderer consumes */
function computeIconPositions(
  pageIcons: IconPosition[],
  _pageWidgets: WidgetInstance[]
): Map<DesktopIconId, { row: number; col: number }> {
  const positions = new Map<DesktopIconId, { row: number; col: number }>();
  for (const icon of pageIcons) {
    positions.set(icon.id, { row: icon.row, col: icon.col });
  }
  return positions;
}

/** Find nearest free cell to (fromRow, fromCol). Returns 1-based coords. */
function findNearestFreeCell(
  fromRow: number, fromCol: number,
  widgetOcc: boolean[][],
  usedCells: Set<string>,
): { row: number; col: number } | null {
  let bestDist = Infinity;
  let best: { row: number; col: number } | null = null;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (widgetOcc[r][c]) continue;
      const key = `${r + 1},${c + 1}`;
      if (usedCells.has(key)) continue;
      const dist = Math.abs(r + 1 - fromRow) * GRID_COLS + Math.abs(c + 1 - fromCol);
      if (dist < bestDist) { bestDist = dist; best = { row: r + 1, col: c + 1 }; }
    }
  }
  return best;
}

/** Displace only icons that overlap with widgets. Others stay put.
 *  Returns { placed, overflow } — overflow icons had no room on this page. */
function displaceIconsForWidgets(
  icons: IconPosition[],
  pageWidgets: WidgetInstance[],
): { placed: IconPosition[]; overflow: IconPosition[] } {
  const widgetOcc = buildWidgetOccupancy(pageWidgets);
  const placed: IconPosition[] = [];
  const usedCells = new Set<string>();
  const displaced: IconPosition[] = [];

  for (const icon of icons) {
    if (widgetOcc[icon.row - 1]?.[icon.col - 1]) {
      displaced.push(icon);
    } else {
      placed.push(icon);
      usedCells.add(`${icon.row},${icon.col}`);
    }
  }

  const overflow: IconPosition[] = [];
  for (const icon of displaced) {
    const free = findNearestFreeCell(icon.row, icon.col, widgetOcc, usedCells);
    if (free) {
      placed.push({ id: icon.id, row: free.row, col: free.col });
      usedCells.add(`${free.row},${free.col}`);
    } else {
      overflow.push(icon);
    }
  }

  return { placed, overflow };
}

function placeIconOnAvailablePage(
  layout: DesktopLayout,
  widgets: WidgetInstance[],
  icon: IconPosition,
  startPage: number,
): void {
  const maxPage = Math.max(
    2,
    startPage,
    ...getDesktopPageKeysForState(layout, widgets).map(getDesktopPageNumber)
  );
  for (let page = Math.max(1, startPage); page <= maxPage + 1; page += 1) {
    const pageKey = getDesktopPageKey(page);
    ensureDesktopPage(layout, pageKey);
    const widgetOcc = buildWidgetOccupancy(widgets.filter(w => w.page === page));
    const usedCells = new Set(layout[pageKey].map(ic => `${ic.row},${ic.col}`));
    const free = findNearestFreeCell(icon.row, icon.col, widgetOcc, usedCells);
    if (!free) continue;
    layout[pageKey] = [...layout[pageKey], { id: icon.id, row: free.row, col: free.col }];
    return;
  }
}

/** 网格几何：格子原点/步距/内容尺寸（屏幕像素）。指针→格子换算和
 *  图标矩形碰撞检测共用同一份，保证两套判定不会各说各话。 */
type GridGeometry = {
  originX: number;
  originY: number;
  colStep: number;
  rowStep: number;
  colWidth: number;
  rowHeight: number;
};

function getGridGeometry(gridEl: HTMLElement): GridGeometry {
  const rect = gridEl.getBoundingClientRect();
  const computed = getComputedStyle(gridEl);
  const colWidths = computed.gridTemplateColumns.split(/\s+/).map(parseFloat);
  const colWidth = colWidths[0] || 66;
  const colGap = parseFloat(computed.columnGap) || 20;
  const rowGap = parseFloat(computed.rowGap) || 0;
  /* rect 高度是 border-box（含 padding），网格行轨道只占内容盒。 */
  const padY = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
  const contentWidth = colWidths.length * colWidth + (colWidths.length - 1) * colGap;
  const originX = rect.left + (rect.width - contentWidth) / 2;
  const originY = rect.top + (parseFloat(computed.paddingTop) || 0);
  const totalRowGap = (GRID_ROWS - 1) * rowGap;
  const rowHeight = (rect.height - padY - totalRowGap) / GRID_ROWS;
  return { originX, originY, colStep: colWidth + colGap, rowStep: rowHeight + rowGap, colWidth, rowHeight };
}

/** Convert pointer screen position to a grid cell (0-based) */
function pointerToGridCell(
  px: number,
  py: number,
  gridEl: HTMLElement
): { row: number; col: number } | null {
  const geom = getGridGeometry(gridEl);
  const col = Math.floor((px - geom.originX) / geom.colStep);
  const row = Math.floor((py - geom.originY) / geom.rowStep);
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
  return { row, col };
}

function sanitizeWidgetsForLayout(_layout: DesktopLayout, widgets: WidgetInstance[]): WidgetInstance[] {
  const normalized: WidgetInstance[] = [];
  const pageNumbers = getDesktopPageKeysForState(_layout, widgets).map(getDesktopPageNumber);

  for (const page of pageNumbers) {
    for (const w of widgets.filter((widget) => widget.page === page)) {
      // Widget-only collision: pass empty icons so icons don't block widget placement
      const grid = buildOccupancyGrid([], normalized, page);
      if (canPlaceWidget(grid, w.size, w.row, w.col)) {
        normalized.push(w);
      }
    }
  }

  return normalized;
}

function sameWidgetOrder(a: WidgetInstance[], b: WidgetInstance[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.page !== y.page ||
      x.row !== y.row ||
      x.col !== y.col ||
      x.size !== y.size ||
      x.type !== y.type
    ) {
      return false;
    }
  }
  return true;
}

type KeyboardTargetRect = {
  top: number;
  bottom: number;
};

function isKeyboardEditableElement(element: EventTarget | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;

  const type = element.type.toLowerCase();
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
}

function shouldBypassDesktopItemPointerCapture(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[data-ui='modal'], .modal-overlay, .modal-dialog, .modal-sheet, .modal-expand")) return true;
  return isKeyboardEditableElement(target);
}

function parseCssPixels(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function measureTextareaCaretRect(textarea: HTMLTextAreaElement): KeyboardTargetRect {
  const selectionStart = textarea.selectionStart ?? textarea.value.length;
  const computed = window.getComputedStyle(textarea);
  const rect = textarea.getBoundingClientRect();
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const fontSize = parseCssPixels(computed.fontSize, 14);
  const lineHeight = computed.lineHeight === "normal" ? fontSize * 1.2 : parseCssPixels(computed.lineHeight, fontSize * 1.2);
  const mirrorProperties = [
    "font-family",
    "font-size",
    "font-style",
    "font-variant",
    "font-weight",
    "letter-spacing",
    "text-align",
    "text-indent",
    "text-transform",
    "word-spacing",
    "tab-size",
    "direction",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
  ];

  for (const property of mirrorProperties) {
    mirror.style.setProperty(property, computed.getPropertyValue(property));
  }

  mirror.style.position = "fixed";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.left = "-10000px";
  mirror.style.top = "0";
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.boxSizing = "border-box";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.wordBreak = computed.getPropertyValue("word-break");
  mirror.style.lineHeight = `${lineHeight}px`;
  mirror.textContent = textarea.value.slice(0, selectionStart);
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  const top = rect.top + markerRect.top - mirrorRect.top - textarea.scrollTop;
  return {
    top,
    bottom: top + lineHeight,
  };
}

function getKeyboardTargetRect(element: HTMLElement): KeyboardTargetRect {
  // 聊天输入栏 / 多选栏是“上输入框、下发送按钮”的竖向结构。
  // 抬高的目标必须是整条栏子的 bottom（含发送按钮），而不是文字光标那一行，
  // 否则只把输入框顶部抬到键盘上方、发送按钮仍被键盘盖住。
  const inputBar = element.closest<HTMLElement>("[data-ui='input'], [data-ui='multi-select']");
  if (inputBar) {
    const rect = inputBar.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  }

  // 其它独立输入框（设置项、文件夹重命名等）没有底部按钮，仍按原逻辑抬光标。
  if (element instanceof HTMLTextAreaElement) {
    return measureTextareaCaretRect(element);
  }

  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
  };
}

function useAndroidCaretKeyboardLift() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const root = document.documentElement;
    if (!/Android/i.test(navigator.userAgent)) {
      root.style.removeProperty("--mobile-keyboard-lift");
      return;
    }

    const mobileMq = window.matchMedia("(max-width: 500px) and (hover: none) and (pointer: coarse)");
    const viewport = window.visualViewport;
    let focusedElement: HTMLElement | null = null;
    let raf = 0;
    let currentLift = 0;

    const applyLift = (nextLift: number) => {
      const rounded = Math.max(0, Math.round(nextLift));
      if (Math.abs(rounded - currentLift) < 2) return;
      currentLift = rounded;
      if (rounded > 0) {
        root.style.setProperty("--mobile-keyboard-lift", `${rounded}px`);
      } else {
        root.style.removeProperty("--mobile-keyboard-lift");
      }
    };

    const update = () => {
      raf = 0;
      const element = focusedElement;
      if (!element || document.activeElement !== element || !mobileMq.matches || !viewport) {
        applyLift(0);
        return;
      }

      // interactive-widget=resizes-content 生效时（布局视口被键盘原生压缩、innerHeight 变小），
      // 键盘避让已由原生布局完成；此时再叠加手动 lift 会把输入栏顶离键盘，
      // 在输入栏和键盘之间产生一条空白。检测到原生压缩标记时彻底关闭手动抬升。
      if (document.documentElement.dataset.nativeKbResize === "1") {
        applyLift(0);
        return;
      }

      const keyboardTop = viewport.offsetTop + viewport.height;
      const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const targetRect = getKeyboardTargetRect(element);
      const gap = 36;

      if (keyboardInset < 80) {
        applyLift(0);
        return;
      }

      const naturalBottom = targetRect.bottom + currentLift;
      const neededLift = Math.max(0, naturalBottom + gap - keyboardTop);
      applyLift(Math.min(keyboardInset, neededLift));
    };

    const requestUpdate = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(update);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (…40582 tokens truncated…tton>
              ) : null}

              {/* Music custom CSS — injected at shell level so it persists across apps */}
              {musicCustomCss && <style dangerouslySetInnerHTML={{ __html: musicCustomCss }} />}

              {/* Music overlays are isolated so playback progress does not rerender the desktop shell. */}
              <MusicShellOverlays
                activeApp={activeApp}
                onControllerChange={handleMusicOverlayControllerChange}
              />

              {/* Mini chat window — persists across music pages */}
              <MiniAppWindow
                title="聊天"
                visible={showMiniChat}
                onClose={handleMiniChatClose}
                onExpand={handleMiniChatExpand}
              >
                <PhoneChatApp
                  onClose={handleMiniChatClose}
                  onSessionChange={handleMiniChatSessionChange}
                  sharePayload={miniSharePayload}
                  onShareDone={handleMiniShareDone}
                />
              </MiniAppWindow>

              <div
                ref={workspaceRef}
                className={
                  activeApp
                    ? "phone-workspace app-open"
                    : editMode
                      ? "phone-workspace edit-mode"
                      : "phone-workspace"
                }
                style={{
                  touchAction: activeApp ? undefined : editMode ? "none" : "pan-y",
                  ...(!desktopReady && !activeApp ? { visibility: "hidden" } : {}),
                }}
                onPointerDown={handleSwipeStart}
                onPointerMove={handleSwipeMove}
                onPointerUp={handleSwipeEnd}
                onPointerCancel={handleSwipeEnd}
              >
                {/* Edit mode Done button */}
                {editMode && !activeApp && (
                  <>
                    <button type="button" className="edit-mode-edit" style={{ left: 16 }} onPointerDown={e => e.stopPropagation()} onClick={() => { setShowWidgetPicker(true); setShowDesktopCustomizer(false); }}>
                      添加
                    </button>
                    <button type="button" className="edit-mode-edit" style={{ left: "50%", transform: "translateX(-50%)" }} onPointerDown={e => e.stopPropagation()} onClick={() => { setShowDesktopCustomizer(true); setShowWidgetPicker(false); }}>
                      装扮
                    </button>
                    <button type="button" className="edit-mode-done" onClick={exitEditMode}>
                      完成
                    </button>
                    {loadUninstalledApps().size > 0 && (
                      <button
                        type="button"
                        className="edit-mode-edit"
                        style={{ left: "50%", transform: "translateX(-50%)", top: 108 }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => setShowUninstalledSheet(true)}
                      >
                        已卸载 {loadUninstalledApps().size}
                      </button>
                    )}
                  </>
                )}

                {/* 桌面被清空时仍要能恢复应用（否则没有图标可长按进入编辑模式） */}
                {!activeApp && !editMode && getDesktopIconLayoutItems(layout).length + dock.length === 0 && (
                  <button
                    type="button"
                    className="edit-mode-edit"
                    style={{ left: "50%", transform: "translateX(-50%)", top: "40%" }}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setShowUninstalledSheet(true)}
                  >
                    {loadUninstalledApps().size > 0 ? "已卸载应用 · 恢复" : "桌面已清空"}
                  </button>
                )}


                {!activeApp ? (
                  <>
                    <div
                      ref={swipeLayerRef}
                      className="phone-swipe-layer"
                      style={{ "--swipe-page": boundedCurrentPageIndex } as CSSProperties}
                    >
                      {pageKeys.map((pageKey, pageIndex) => {
                        const pageNum = getDesktopPageNumber(pageKey) || pageIndex + 1;
                        const pageIcons = layout[pageKey] ?? [];
                        const pageWidgets = widgets.filter((w) => w.page === pageNum);
                        const pageIconPositions = computeIconPositions(pageIcons, pageWidgets);

                        return (
                          <section
                            key={pageKey}
                            ref={(el) => {
                              gridRefs.current[pageKey] = el;
                              if (pageIndex === 0) iconGridRef.current = el;
                            }}
                            className={`icon-grid icon-grid-explicit icon-grid-${pageKey}`}
                            aria-label={pageIndex === 0 ? TEXT.ariaDesktopIcons : undefined}
                            style={
                              slotIconWidth || slotIconHeight || slotRowStep
                                ? ({
                                  ...(slotIconWidth ? { "--slot-icon-width": `${slotIconWidth}px` } : {}),
                                  ...(slotIconHeight ? { "--slot-icon-height": `${slotIconHeight}px` } : {}),
                                  ...(slotRowStep ? { "--slot-row-step": `${slotRowStep}px` } : {})
                                } as CSSProperties)
                                : undefined
                            }
                          >
                            {/* Render widgets for this page */}
                            {pageWidgets.map((widget) => {
                              const wDragging = dragItem?.type === "widget" && dragItem.id === widget.id;
                              return (
                                <div
                                  key={widget.id}
                                  className={wDragging ? "widget-drag-wrap dragging" : "widget-drag-wrap"}
                                  onPointerDownCapture={(e) => handleItemPointerDown(e, "widget", widget.id, pageKey)}
                                >
                                  <WidgetRenderer widget={widget} onConfigChange={handleWidgetConfigChange} />
                                  {editMode && !wDragging && (
                                    <button
                                      type="button"
                                      className="widget-delete-btn"
                                      style={{
                                        gridRow: widget.row,
                                        gridColumn: `${widget.col + WIDGET_SIZE_CELLS[widget.size][1] - 1}`,
                                      }}
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleWidgetsChange(widgetsRef.current.filter((w) => w.id !== widget.id));
                                      }}
                                      aria-label="删除组件"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              );
                            })}

                            {/* Drop target indicator */}
                            {editMode && dropTarget && dropTarget.page === pageKey && (() => {
                              if (dragItem?.type === "widget") {
                                const w = widgets.find((ww) => ww.id === dragItem.id);
                                if (!w) return null;
                                const [wr, wc] = WIDGET_SIZE_CELLS[w.size];
                                return (
                                  <div
                                    className={`drop-indicator widget-${w.size}`}
                                    style={{
                                      gridRow: `${dropTarget.row} / span ${wr}`,
                                      gridColumn: `${dropTarget.col} / span ${wc}`,
                                      justifySelf: "start",
                                      alignSelf: "start",
                                      marginLeft: "var(--slot-icon-offset-x)",
                                    }}
                                  />
                                );
                              }
                              return (
                                <div
                                  className="drop-indicator"
                                  style={{ gridRow: dropTarget.row, gridColumn: dropTarget.col }}
                                />
                              );
                            })()}

                            {/* Render icons with explicit positions for this page */}
                            {pageIcons.map((iconPos) => {
                              const iconId = iconPos.id;
                              const pos = pageIconPositions.get(iconId);
                              if (!pos) return null;
                              const isDragging = dragItem?.type === "icon" && dragItem.id === iconId;
                              const isMergeTarget = mergeTargetId === iconId;
                              const itemClass = `icon-item${isDragging ? " dragging" : ""}${isMergeTarget ? " merge-target" : ""}`;
                              if (isFolderIconId(iconId)) {
                                const folder = folders[iconId];
                                if (!folder) return null;
                                // 聊天图标不再聚合未读红点：未读提醒只保留在聊天会话列表内
                                const folderBadge = folder.icons.reduce((sum, memberId) => {
                                  const appId = customAppIdFromIconId(memberId);
                                  if (appId) return sum + (customAppBadges[appId] ?? 0);
                                  return sum;
                                }, 0);
                                return (
                                  <button
                                    key={iconId}
                                    data-flip-id={`icon:${iconId}`}
                                    className={itemClass}
                                    style={{ gridRow: pos.row, gridColumn: pos.col }}
                                    onClick={() => { if (!editMode) { setFolderPageIndex(0); setOpenFolderId(iconId); } }}
                                    onPointerDown={(e) => handleItemPointerDown(e, "icon", iconId, pageKey)}
                                  >
                                    <span className="icon-glyph-box folder-glyph-box" aria-hidden>
                                      <span className="folder-mini-grid">
                                        {folder.icons.slice(0, 4).map(memberId => renderFolderMini(memberId))}
                                      </span>
                                      {folderBadge > 0 ? (
                                        <span className="desktop-icon-badge" aria-label={`${folderBadge} 条未读`}>
                                          {folderBadge > 99 ? "99+" : folderBadge}
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className="icon-label">{folder.name}</span>
                                  </button>
                                );
                              }
                              const icon = getDesktopIconMeta(iconId);
                              if (!icon) return null;
                              const customApp = icon.customApp;
                              const builtinIconId = customApp ? null : icon.id as IconId;
                              const iconSkinId = activeIconSkins[iconId];
                              const iconSkinUrl = iconSkinId ? themeAssets[iconSkinId] ?? null : null;
                              const customIconUrl = customApp && customAppIconStyles[customApp.id] !== "global"
                                ? customApp.iconDataUrl ?? null
                                : null;
                              const iconImageUrl = iconSkinUrl || customIconUrl;
                              const hasImageIcon = Boolean(iconImageUrl);
                              // 聊天图标右上角不显示未读红点（用户偏好）：未读只在聊天会话列表内以红点展示
                              const badgeCount = customApp ? customAppBadges[customApp.id] ?? 0 : 0;
                              return (
                                <button
                                  key={iconId}
                                  data-flip-id={`icon:${iconId}`}
                                  className={itemClass}
                                  style={{ gridRow: pos.row, gridColumn: pos.col }}
                                  onClick={() => { if (!editMode) openApp(iconId); }}
                                  onPointerDown={(e) => handleItemPointerDown(e, "icon", iconId, pageKey)}
                                >
                                  <span
                                    className={hasImageIcon ? "icon-glyph-box icon-glyph-box-skin" : "icon-glyph-box"}
                                    style={hasImageIcon ? undefined : { "--icon-tone": icon.tone } as React.CSSProperties}
                                    aria-hidden
                                  >
                                    {iconImageUrl ? (
                                      <span
                                        className="icon-skin-layer"
                                        style={{ backgroundImage: `url("${iconImageUrl}")` }}
                                      />
                                    ) : null}
                                    {builtinIconId ? (
                                      <IconGlyph
                                        id={builtinIconId}
                                        className={
                                          builtinIconId === "music"
                                            ? iconSkinUrl
                                              ? "icon-glyph icon-glyph-music icon-glyph-hidden"
                                              : "icon-glyph icon-glyph-music"
                                            : iconSkinUrl
                                              ? "icon-glyph icon-glyph-hidden"
                                              : "icon-glyph"
                                        }
                                      />
                                    ) : customIconUrl ? null : (
                                      <CustomAppGlyph seed={customApp?.name || icon.label} className="icon-glyph" />
                                    )}
                                    {badgeCount > 0 ? (
                                      <span className="desktop-icon-badge" aria-label={`${badgeCount} 条未读`}>
                                        {badgeCount > 99 ? "99+" : badgeCount}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="icon-label">{icon.label}</span>
                                  {editMode && (
                                    <span
                                      className="icon-uninstall-btn"
                                      role="button"
                                      aria-label={`卸载 ${icon.label}`}
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setUninstallTarget({ id: iconId, label: icon.label, isCustom: Boolean(customApp) });
                                      }}
                                    >
                                      ×
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </section>
                        );
                      })}
                    </div>

                    <div className="page-controls">
                      {pageKeys.map((pageKey, pageIndex) => (
                        <button
                          key={pageKey}
                          type="button"
                          className={boundedCurrentPageIndex === pageIndex ? "dot active dot-btn" : "dot dot-btn"}
                          aria-label={`第${pageIndex + 1}页`}
                          onClick={() => setCurrentPageIndex(pageIndex)}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <section className="phone-app-pane" style={activeApp === "dwelling" || activeApp === "xiaohongshu" || activeApp === "shopping" ? { display: "none" } : undefined}>
                      {renderAppBody()}
                    </section>
                    {/* DwellingApp stays mounted while generating — auto-unmounts when idle */}
                    {dwellingMounted && (
                      <section className="phone-app-pane" style={activeApp !== "dwelling" ? { display: "none" } : undefined}>
                        <DwellingApp
                          onClose={() => setActiveApp(null)}
                          visible={activeApp === "dwelling"}
                          onIdle={() => { if (activeApp !== "dwelling") setDwellingMounted(false); }}
                        />
                      </section>
                    )}
                  </>
                )}
                {xiaohongshuMounted && (
                  <section className="phone-app-pane" style={activeApp !== "xiaohongshu" ? { display: "none" } : undefined}>
                    <XiaohongshuApp
                      onClose={handleCloseXiaohongshu}
                      onNotice={setNotice}
                      visible={activeApp === "xiaohongshu"}
                      onBusyChange={setXiaohongshuBusy}
                      onIdle={() => {
                        if (activeApp !== "xiaohongshu") {
                          setXiaohongshuBusy(false);
                          setXiaohongshuMounted(false);
                        }
                      }}
                    />
                  </section>
                )}
                {shoppingMounted && (
                  <section className="phone-app-pane" style={activeApp !== "shopping" ? { display: "none" } : undefined}>
                    <ShoppingApp
                      onClose={handleCloseShopping}
                      visible={activeApp === "shopping"}
                      onBusyChange={setShoppingBusy}
                      onIdle={() => {
                        if (activeApp !== "shopping") {
                          setShoppingBusy(false);
                          setShoppingMounted(false);
                        }
                      }}
                    />
                  </section>
                )}
              </div>

              {!activeApp ? (
                <footer
                  ref={dockElRef}
                  className={editMode ? "dock edit-mode" : "dock"}
                  {...(dockSkinUrl ? { "data-skinned": "" } : {})}
                  style={{ "--dock-count": Math.max(1, dock.length) } as CSSProperties}
                  onPointerMove={handleSwipeMove}
                  onPointerUp={handleSwipeEnd}
                  onPointerCancel={handleSwipeEnd}
                >
                  {dockSkinUrl && (
                    <span className="dock-skin-layer" style={{ backgroundImage: `url("${dockSkinUrl}")` }} />
                  )}
                  {dock.map((iconId) => {
                    const icon = getDesktopIconMeta(iconId);
                    if (!icon) return null;
                    const customApp = icon.customApp;
                    const builtinIconId = customApp ? null : (icon.id as IconId);
                    const iconSkinId = activeIconSkins[iconId];
                    const iconSkinUrl = iconSkinId ? themeAssets[iconSkinId] ?? null : null;
                    const customIconUrl = customApp && customAppIconStyles[customApp.id] !== "global"
                      ? customApp.iconDataUrl ?? null
                      : null;
                    const iconImageUrl = iconSkinUrl || customIconUrl;
                    const hasImageIcon = Boolean(iconImageUrl);
                    const isDragging = dragItem?.type === "icon" && dragItem.id === iconId;
                    return (
                      <button
                        key={iconId}
                        type="button"
                        data-flip-id={`icon:${iconId}`}
                        className={isDragging ? "dock-item dragging" : "dock-item"}
                        onClick={() => { if (!editMode) openApp(iconId); }}
                        onPointerDown={(e) => handleItemPointerDown(e, "icon", iconId, DOCK_PAGE_KEY)}
                      >
                        <span
                          className={
                            hasImageIcon
                              ? "icon-glyph-box dock-glyph-box icon-glyph-box-skin"
                              : "icon-glyph-box dock-glyph-box"
                          }
                          style={hasImageIcon ? undefined : { "--icon-tone": icon.tone } as React.CSSProperties}
                          aria-hidden
                        >
                          {iconImageUrl ? (
                            <span className="icon-skin-layer" style={{ backgroundImage: `url("${iconImageUrl}")` }} />
                          ) : null}
                          {builtinIconId ? (
                            <IconGlyph
                              id={builtinIconId}
                              className={
                                builtinIconId === "music"
                                  ? iconSkinUrl
                                    ? "icon-glyph icon-glyph-music icon-glyph-hidden"
                                    : "icon-glyph icon-glyph-music"
                                  : iconSkinUrl
                                    ? "icon-glyph icon-glyph-hidden"
                                    : "icon-glyph"
                              }
                            />
                          ) : customIconUrl ? null : (
                            <CustomAppGlyph seed={customApp?.name || icon.label} className="icon-glyph" />
                          )}
                        </span>
                        <span className="icon-label">{icon.label}</span>
                        {editMode && (
                          <span
                            className="icon-uninstall-btn"
                            role="button"
                            aria-label={`卸载 ${icon.label}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setUninstallTarget({ id: iconId, label: icon.label, isCustom: Boolean(customApp) });
                            }}
                          >
                            ×
                          </span>
                        )}
                      </button>
                    );
                  })}
                </footer>
              ) : null}
              <DebugPromptPanel />
              <QuickActionFloat />
              <MascotFloat />
              {/* 预览弹窗宿主：独立于桌宠的展开/收起状态，否则桌宠收成小球时弹不出来 */}
              <MascotPreviewHost />

              {/* 全局通话层：常驻桌面壳，切会话 / 回桌面 / 开别的 App 都不中断通话 */}
              <CallLayer />

              {/* Widget Picker Bottom Sheet */}
              {showWidgetPicker && (
                <div className="widget-picker-sheet" onClick={e => e.stopPropagation()}>
                  <div className="wm-header" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="ts-16 font-medium text-[var(--c-text-title)] flex items-center gap-2">
                      <LayoutGrid size={18} /> 添加组件
                    </span>
                    <button className="ui-bare-btn text-[var(--c-icon)]" onClick={() => setShowWidgetPicker(false)}>✕</button>
                  </div>

                  <div className="px-4 py-3 flex gap-2 w-full">
                    {[
                      { id: "standard", label: "全局套件" },
                      { id: "freestyle", label: "自由艺术" },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setWidgetPickerTab(tab.id as "standard" | "freestyle")}
                        className={`flex-1 flex justify-center py-1.5 rounded-full text-[calc(13px*var(--app-text-scale,1))] font-medium transition-colors ${widgetPickerTab === tab.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="wm-catalog-list" style={{ overflow: "auto", maxHeight: "calc(65vh - 120px)", paddingTop: 10 }}>
                    {widgetPickerTab === "standard" && mergedCatalog.filter(e => e.track !== "freestyle").map(entry => {
                      const sizeClass = `wm-cat-size-${entry.size}`;
                      const dummyWidget: WidgetInstance = { id: `pick-${entry.type}`, type: entry.type, size: entry.size, page: 1, row: 1, col: 1 };
                      return (
                        <div
                          key={entry.type}
                          className={`wm-cat-item ${sizeClass}`}
                          role="button"
                          onClick={() => {
                            const page = currentPage;
                            const pageKey = currentPageKey;
                            const currentWidgets = widgetsRef.current;
                            const grid = buildOccupancyGrid(layoutRef.current[pageKey] ?? [], currentWidgets, page);
                            let placed = false;
                            for (let r = 1; r <= GRID_ROWS && !placed; r++) {
                              for (let c = 1; c <= GRID_COLS && !placed; c++) {
                                if (canPlaceWidget(grid, entry.size, r, c)) {
                                  const next = placeWidget(currentWidgets, { type: entry.type, size: entry.size, page, row: r, col: c });
                                  handleWidgetsChange(next);
                                  placed = true;
                                }
                              }
                            }
                            if (!placed) setNotice("当前页面没有足够空间");
                            setShowWidgetPicker(false);
                          }}
                        >
                          <WidgetRenderer widget={dummyWidget} preview />
                          <span className="wm-cat-name">{entry.name}</span>
                        </div>
                      );
                    })}
                    
                    {widgetPickerTab === "freestyle" && mergedCatalog.filter(e => e.track === "freestyle").map(entry => {
                      const sizeClass = `wm-cat-size-${entry.size}`;
                      const dummyWidget: WidgetInstance = { id: `pick-${entry.type}`, type: entry.type, size: entry.size, page: 1, row: 1, col: 1 };
                      const isDIY = entry.type.startsWith("diy-");
                      return (
                        <div
                          key={entry.type}
                          className={`wm-cat-item ${sizeClass} relative`}
                          style={{ overflow: "visible" }}
                        >
                          {/* Delete button removed from desktop picker layout per user request */}
                          <div
                            role="button"
                            className="w-full h-full flex flex-col items-center gap-2"
                            onClick={() => {
                            const page = currentPage;
                            const pageKey = currentPageKey;
                            const currentWidgets = widgetsRef.current;
                            const grid = buildOccupancyGrid(layoutRef.current[pageKey] ?? [], currentWidgets, page);
                            let placed = false;
                            for (let r = 1; r <= GRID_ROWS && !placed; r++) {
                              for (let c = 1; c <= GRID_COLS && !placed; c++) {
                                if (canPlaceWidget(grid, entry.size, r, c)) {
                                  const next = placeWidget(currentWidgets, { type: entry.type, size: entry.size, page, row: r, col: c });
                                  handleWidgetsChange(next);
                                  placed = true;
                                }
                              }
                            }
                            if (!placed) setNotice("当前页面没有足够空间");
                            setShowWidgetPicker(false);
                          }}
                        >
                          <WidgetRenderer widget={dummyWidget} preview />
                          <span className="wm-cat-name" style={{ color: "var(--c-home-pink)" }}>{entry.name}</span>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
              {showDesktopCustomizer && (
                <DesktopCustomizer
                  draft={draftTheme}
                  onDraftChange={setDraftTheme}
                  onApply={applyTheme}
                  onClose={() => setShowDesktopCustomizer(false)}
                />
              )}

              {/* 文件夹面板：整屏压暗 + 毛玻璃，材质随 data-icon-effect 和图标底色走 */}
              {!activeApp && openFolderId && folders[openFolderId] && (() => {
                const folder = folders[openFolderId];
                const memberPages: DesktopIconId[][] = [];
                for (let i = 0; i < folder.icons.length; i += 4) {
                  memberPages.push(folder.icons.slice(i, i + 4));
                }
                if (memberPages.length === 0) memberPages.push([]);
                const boundedFolderPage = Math.min(folderPageIndex, memberPages.length - 1);
                return (
                  <div className="folder-overlay" onClick={() => setOpenFolderId(null)}>
                    <input
                      key={openFolderId}
                      className="folder-name-input"
                      defaultValue={folder.name}
                      maxLength={24}
                      aria-label="文件夹名称"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onBlur={(e) => renameFolder(openFolderId, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    <div className="folder-panel" onClick={(e) => e.stopPropagation()}>
                      <div
                        className="folder-pages"
                        onScroll={(e) => {
                          const el = e.currentTarget;
                          const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                          if (idx !== folderPageIndex) setFolderPageIndex(idx);
                        }}
                      >
                        {memberPages.map((members, pageIdx) => (
                          <div key={pageIdx} className="folder-page">
                            {members.map((memberId) => {
                              const meta = getDesktopIconMeta(memberId);
                              if (!meta) return null;
                              const memberCustomApp = meta.customApp;
                              const memberBuiltinId = memberCustomApp ? null : meta.id as IconId;
                              const memberSkinId = activeIconSkins[memberId];
                              const memberSkinUrl = memberSkinId ? themeAssets[memberSkinId] ?? null : null;
                              const memberCustomUrl = memberCustomApp && customAppIconStyles[memberCustomApp.id] !== "global"
                                ? memberCustomApp.iconDataUrl ?? null
                                : null;
                              const memberImageUrl = memberSkinUrl || memberCustomUrl;
                              const memberBadge = memberCustomApp ? customAppBadges[memberCustomApp.id] ?? 0 : 0;
                              return (
                                <button
                                  key={memberId}
                                  type="button"
                                  className="folder-app"
                                  onClick={() => { setOpenFolderId(null); openApp(memberId); }}
                                  onPointerDown={(e) => handleFolderIconPointerDown(e, memberId)}
                                  onPointerMove={handleFolderIconPointerMove}
                                  onPointerUp={cancelFolderIconPress}
                                  onPointerCancel={cancelFolderIconPress}
                                >
                                  <span
                                    className={memberImageUrl ? "icon-glyph-box icon-glyph-box-skin" : "icon-glyph-box"}
                                    style={memberImageUrl ? undefined : { "--icon-tone": meta.tone } as CSSProperties}
                                    aria-hidden
                                  >
                                    {memberImageUrl ? (
                                      <span className="icon-skin-layer" style={{ backgroundImage: `url("${memberImageUrl}")` }} />
                                    ) : null}
                                    {memberBuiltinId ? (
                                      <IconGlyph
                                        id={memberBuiltinId}
                                        className={memberSkinUrl ? "icon-glyph icon-glyph-hidden" : "icon-glyph"}
                                      />
                                    ) : memberCustomUrl ? null : (
                                      <CustomAppGlyph seed={memberCustomApp?.name || ""} className="icon-glyph" />
                                    )}
                                    {memberBadge > 0 ? (
                                      <span className="desktop-icon-badge" aria-label={`${memberBadge} 条未读`}>
                                        {memberBadge > 99 ? "99+" : memberBadge}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="icon-label">{meta.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      {memberPages.length > 1 && (
                        <div className="folder-dots">
                          {memberPages.map((_, pageIdx) => (
                            <span key={pageIdx} className={pageIdx === boundedFolderPage ? "dot active" : "dot"} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Drag ghost — absolutely positioned INSIDE .phone-shell so the
                  clone keeps theme variables + glass effect selectors
                  (.phone-shell[data-icon-effect] etc.); follows pointer via ref */}
              <div ref={ghostRef} className="drag-ghost" />

              {/* 应用卸载：确认框与已卸载恢复面板 */}
              {uninstallTarget && (
                <ConfirmDialog
                  title={`卸载「${uninstallTarget.label}」`}
                  message={
                    uninstallTarget.isCustom
                      ? "卸载将同时删除该应用的数据（配置、记录与专属文件）。此操作不可撤销。"
                      : hasDataRule(uninstallTarget.id)
                        ? `卸载将同时删除：${dataLabelFor(uninstallTarget.id)}。此操作不可撤销。`
                        : `「${uninstallTarget.label}」的数据是全局共享的（角色、账号、API 配置等），卸载只移除图标与入口，不会删除它们。`
                  }
                  confirmLabel={uninstalling ? "正在卸载…" : "卸载"}
                  cancelLabel="取消"
                  variant="danger"
                  onConfirm={handleConfirmUninstall}
                  onCancel={() => { if (!uninstalling) setUninstallTarget(null); }}
                />
              )}

              {showUninstalledSheet && (
                <BottomSheet
                  key={uninstalledVersion}
                  title="已卸载的应用"
                  onClose={() => setShowUninstalledSheet(false)}
                >
                  {Array.from(loadUninstalledApps()).length === 0 ? (
                    <p style={{ textAlign: "center", color: "var(--c-text)", fontSize: 14, padding: "20px 0" }}>
                      没有已卸载的应用。
                    </p>
                  ) : (
                    Array.from(loadUninstalledApps()).map((id) => {
                      const meta = ICONS[id as IconId];
                      if (!meta) return null;
                      return (
                        <div
                          key={id}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 4px" }}
                        >
                          <span style={{ fontSize: 15, color: "var(--c-text-title)" }}>{meta.label}</span>
                          <button type="button" className="ui-btn ui-btn-primary" onClick={() => handleRestoreApp(id as DesktopIconId)}>
                            恢复
                          </button>
                        </div>
                      );
                    })
                  )}
                </BottomSheet>
              )}
            </div>
          </div>
        </div>
      </section>
      {/* 感知引擎：挂载即开始采样，卸载即停止。非壳环境自动空转 */}
      <PerceptionBootstrap />
      {/* 微信云同步过程可视化：拉取/上传/运行包同步与失败都在这里冒 toast */}
      <WeixinSyncToast />
    </>
  );
}
