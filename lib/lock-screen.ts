"use client";

// 锁屏数据层。
//
// kv 是唯一真值：lock.cfg（开关/密码/自动锁定/跳过开屏）与 lock.wallpaper.img（壁纸
// Data URL）分开存 —— 壁纸是几百 KB 的大串，不塞进轻量配置。
//
// 首帧的问题：IndexedDB 是异步的，而「关掉开屏动画时锁屏就是第一帧」要求在它
// 装载完之前就得决定第一帧画什么。所以每次保存配置时同步往 localStorage 镜像
// 一份（float.lock / float.lock.wall），layout 里的内联脚本用它同步决策。镜像可
// 能过期（云备份从别的设备恢复过来），水合完成后以 kv 为准纠回去。

import { kvGet, kvRemove, kvSet } from "./kv-db";

export const LOCK_KV_CFG = "lock.cfg";
export const LOCK_KV_WALLPAPER = "lock.wallpaper.img";

export const LOCK_LS_MIRROR = "float.lock";
export const LOCK_LS_WALL = "float.lock.wall";

export const LOCK_PIN_LEN = 4;
// 自动锁定：分钟。-1 = 从不（只有开机才锁，回前台一律放行）
export const LOCK_IDLE_OPTIONS = [0, 5, 15, -1] as const;
export const LOCK_IDLE_DEFAULT = 5;

export const LOCK_WALL_MAX = 1600;
export const LOCK_WALL_QUALITY = 0.86;

export type LockConfig = {
  on: boolean;
  pin: string;
  skipBoot: boolean;
  idle: number;
};

export function lockDefaults(): LockConfig {
  return { on: false, pin: "", skipBoot: false, idle: LOCK_IDLE_DEFAULT };
}

export function isLockPinShape(value: unknown): boolean {
  return typeof value === "string" && new RegExp(`^\\d{${LOCK_PIN_LEN}}$`).test(value);
}

// 存里那份可能是手改的 / 别的设备同步过来的，读回来一律洗一遍
export function normalizeLockConfig(value: unknown): LockConfig {
  const config = lockDefaults();
  if (!value || typeof value !== "object") return config;
  const raw = value as Record<string, unknown>;
  config.on = raw.on === true;
  config.skipBoot = raw.skipBoot === true;
  config.pin = isLockPinShape(raw.pin) ? (raw.pin as string) : "";
  const idle = Number(raw.idle);
  if ((LOCK_IDLE_OPTIONS as readonly number[]).includes(idle)) config.idle = idle;
  return config;
}

export function readLockConfig(): LockConfig {
  try {
    return normalizeLockConfig(JSON.parse(kvGet(LOCK_KV_CFG) ?? "null"));
  } catch {
    return lockDefaults();
  }
}

// 首帧镜像读出来的一份（不碰 kv，仅供挂载最早的同步决策用）
export type LockMirror = { on: boolean; skipBoot: boolean };

export function readLockMirror(): LockMirror {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOCK_LS_MIRROR) || "null");
    if (!raw || typeof raw !== "object") return { on: false, skipBoot: false };
    return { on: raw.on === true, skipBoot: raw.skipBoot === true };
  } catch {
    return { on: false, skipBoot: false };
  }
}

function syncLockMirror(config: LockConfig): void {
  try {
    window.localStorage.setItem(
      LOCK_LS_MIRROR,
      JSON.stringify({ on: config.on, skipBoot: config.skipBoot })
    );
  } catch {
    // 镜像写失败只影响下一次冷启动的第一帧，不影响功能
  }
}

export function saveLockConfig(next: LockConfig): void {
  kvSet(LOCK_KV_CFG, JSON.stringify(next));
  syncLockMirror(next);
}

export function setLockOn(on: boolean): LockConfig {
  const config = readLockConfig();
  config.on = on;
  // 关掉锁屏时「跳过开屏」跟着失去意义：跳过之后总得有东西挡在第一帧
  if (!on) config.skipBoot = false;
  saveLockConfig(config);
  return config;
}

export function setLockSkipBoot(skipBoot: boolean): LockConfig {
  const config = readLockConfig();
  config.skipBoot = skipBoot;
  saveLockConfig(config);
  return config;
}

export function setLockIdle(idle: number): LockConfig {
  const config = readLockConfig();
  if ((LOCK_IDLE_OPTIONS as readonly number[]).includes(idle)) config.idle = idle;
  saveLockConfig(config);
  return config;
}

export function setLockPin(pin: string): LockConfig {
  const config = readLockConfig();
  config.pin = isLockPinShape(pin) ? pin : "";
  saveLockConfig(config);
  return config;
}

// ===== 壁纸 =====

// 只认 data:image 的 base64 串：这串字要拼进 background-image: url("…")，
// 一个引号就能逃出去。localStorage 镜像与 kv 两处都得判
export function isSafeWallDataUrl(value: unknown): boolean {
  return typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(value);
}

export function readLockWallpaper(): string {
  const value = kvGet(LOCK_KV_WALLPAPER) ?? "";
  return isSafeWallDataUrl(value) ? value : "";
}

// 壁纸镜像单独写：几百 KB 的串，超配额是常态，失败只丢首帧那一下
function syncWallpaperMirror(dataUrl: string): void {
  try {
    if (dataUrl) window.localStorage.setItem(LOCK_LS_WALL, dataUrl);
    else window.localStorage.removeItem(LOCK_LS_WALL);
  } catch {
    // 首帧拿不到这张壁纸就回默认底色，功能不受影响
  }
}

export function saveLockWallpaper(dataUrl: string): void {
  if (!isSafeWallDataUrl(dataUrl)) return;
  kvSet(LOCK_KV_WALLPAPER, dataUrl);
  syncWallpaperMirror(dataUrl);
}

export function resetLockWallpaper(): void {
  kvRemove(LOCK_KV_WALLPAPER);
  syncWallpaperMirror("");
}

// 云备份恢复等场景：kv 被整包换掉后调一下，防止下一次冷启动的第一帧
// 认的还是旧镜像。抹掉最多让那一次先放开屏动画，绝不会锁错
export function syncLockMirrorFromKv(): void {
  syncLockMirror(readLockConfig());
  syncWallpaperMirror(readLockWallpaper());
}
