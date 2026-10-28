"use client";

import { useEffect, useRef, useState } from "react";

import { AccountGate } from "@/components/auth/account-gate";
import { CloudBackupScheduler } from "@/components/cloud-backup-scheduler";
import { RealityBridgeScheduler } from "@/components/reality-bridge-scheduler";
import { WidgetScheduler } from "@/components/widget/widget-scheduler";
import { CheckInScheduler } from "@/components/screenshot/checkin-scheduler";
import { MediaMaintenanceScheduler } from "@/components/media-maintenance-scheduler";
import { ShellPushRegistrar } from "@/components/shell-push-registrar";
import { DesktopShell } from "./desktop-shell";
import { UpdateNotice } from "./update-log/update-notice";
import { SplashFirstFrame, SplashSequence } from "./splash-sequence";
import { MusicProvider } from "@/lib/music-context";
import { hydrateKvDb, isKvHydrated } from "@/lib/kv-db";
import { getThemeAssetMap, readThemeProfile } from "@/lib/theme-storage";
import { resolveActiveIconSkins, type ThemeProfile } from "@/lib/theme-types";
import { hasPendingMcpOAuthCallback } from "@/lib/tool-executor";
import { shouldRequestPwaFullscreen } from "@/lib/pwa-display-mode";

// 开机编排（真进度）：
//   字体预热（大项）→ 55%，主题/壁纸准备 → 92%，开屏字体就绪 → 98%，全部到齐 → 100。
//   每一步都包超时兜底，另有总闸：无论卡在哪，10 秒到点一律放行 —— 绝不能卡在开屏。
//   进度走完时主屏已经在背后渲染成最终的样子，开屏淡出只是揭开它，不会跳。
//
// 开屏结束后直接进主屏（锁屏与密码流程已移除）。

const BUILTIN_FONT_URLS = [
  "/fonts/huiwen.woff2",
  "/fonts/huiwen.woff2",
  "/fonts/special-elite.woff2",
  "/fonts/splash/inter-300.woff2",
  "/fonts/splash/inter-400.woff2",
  "/fonts/splash/inter-500.woff2",
  "/fonts/splash/major-mono-display-400.woff2",
  "/fonts/splash/jetbrains-mono-300.woff2",
  "/fonts/splash/jetbrains-mono-400.woff2",
  "/fonts/interview/noto-serif-sc.woff2",
  "/fonts/interview/bodoni-moda.woff2",
  "/fonts/interview/bodoni-moda-italic.woff2",
  "/fonts/interview/eb-garamond.woff2",
  "/fonts/interview/eb-garamond-italic.woff2",
  "/fonts/interview/long-cang.woff2",
  "/fonts/interview/cinzel.woff2",
  "/fonts/interview/press-start-2p.woff2",
  "/fonts/notewall/ximai.woff2",
  "/fonts/notewall/xiaozhitiao.woff2",
  "/fonts/notewall/huiwen-upload.woff2",
  "/fonts/notewall/chen-yuluoyan-thin.woff2",
  "/fonts/game-hall/fredoka-400.woff2",
  "/fonts/game-hall/fredoka-500.woff2",
  "/fonts/game-hall/fredoka-600.woff2",
  "/fonts/game-hall/fredoka-700.woff2",
  "/fonts/game-hall/caveat-500.woff2",
  "/fonts/game-hall/caveat-700.woff2",
  "/fonts/game-hall/zen-maru-gothic-500.woff2",
  "/fonts/game-hall/zen-maru-gothic-700.woff2",
  "/fonts/game-hall/zen-maru-gothic-900.woff2",
  "/fonts/\u5B57\u4F53/MISANS-REGULAR.woff2",
  "/fonts/\u5B57\u4F53/MISANS-MEDIUM.woff2",
  "/fonts/\u5B57\u4F53/MISANS-SEMIBOLD.woff2",
] as const;

const BUILTIN_FONT_LOAD_SPECS = [
  '300 1em "Inter"',
  '400 1em "Inter"',
  '500 1em "Inter"',
  '400 1em "Major Mono Display"',
  '300 1em "JetBrains Mono"',
  '400 1em "JetBrains Mono"',
  '400 1em "Huiwen"',
  '400 1em "Noto Serif SC"',
  '400 1em "Source Han Serif SC"',
  '400 1em "Bodoni Moda"',
  'italic 400 1em "Bodoni Moda"',
  '400 1em "EB Garamond"',
  'italic 400 1em "EB Garamond"',
  '400 1em "Long Cang"',
  '400 1em "Cinzel"',
  '400 1em "Press Start 2P"',
  '400 1em "Special Elite"',
  '400 1em "NoteWall Ximai"',
  '400 1em "NoteWall Xiaozhitiao"',
  '400 1em "NoteWall Huiwen"',
  '400 1em "Game Hall Fredoka"',
  '500 1em "Game Hall Fredoka"',
  '600 1em "Game Hall Fredoka"',
  '700 1em "Game Hall Fredoka"',
  '500 1em "Game Hall Caveat"',
  '700 1em "Game Hall Caveat"',
  '500 1em "Game Hall Zen Maru Gothic"',
  '700 1em "Game Hall Zen Maru Gothic"',
  '900 1em "Game Hall Zen Maru Gothic"',
  '400 1em "MiSans"',
  '500 1em "MiSans"',
  '600 1em "MiSans"',
] as const;

const FONT_CACHE_BATCH_SIZE = 3;
const FONT_CACHE_BATCH_DELAY_MS = 80;

// 真进度各步的超时兜底与总闸。少包一处，那一处卡住就是永远停在开屏
const BOOT_FONT_TIMEOUT = 8000;
const BOOT_THEME_TIMEOUT = 3000;
const BOOT_SPLASH_FONT_TIMEOUT = 1500;
const BOOT_MAX_MS = 10000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function cacheFontUrl(url: string): Promise<void> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) return;
  await response.arrayBuffer();
}

async function warmBuiltinFonts(shouldStop: () => boolean): Promise<void> {
  if (typeof window === "undefined") return;

  for (let index = 0; index < BUILTIN_FONT_URLS.length; index += FONT_CACHE_BATCH_SIZE) {
    if (shouldStop()) return;
    const batch = BUILTIN_FONT_URLS.slice(index, index + FONT_CACHE_BATCH_SIZE);
    await Promise.all(batch.map((url) => cacheFontUrl(url).catch(() => undefined)));
    if (shouldStop()) return;
    await wait(FONT_CACHE_BATCH_DELAY_MS);
  }

  if (shouldStop() || !document.fonts) return;
  await Promise.all(BUILTIN_FONT_LOAD_SPECS.map((spec) => document.fonts.load(spec).catch(() => [])));
}

type PreparedDesktopTheme = {
  profile: ThemeProfile;
  assets: Record<string, string>;
};

function collectFirstPaintThemeAssetIds(profile: ThemeProfile): string[] {
  const ids = [
    profile.wallpaperAssetId,
    profile.fontAssetId,
    profile.dockSkinAssetId,
    ...Object.values(resolveActiveIconSkins(profile))
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(ids));
}

function preloadImageDataUrl(url: string): Promise<void> {
  if (typeof window === "undefined" || !url.startsWith("data:image/")) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const image = new Image();
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (typeof image.decode === "function") {
        void image.decode().catch(() => undefined).finally(resolve);
        return;
      }
      resolve();
    };
    image.onload = finish;
    image.onerror = finish;
    image.src = url;
    if (image.complete) {
      finish();
    }
  });
}

async function prepareDesktopThemeForFirstPaint(): Promise<PreparedDesktopTheme> {
  const profile = readThemeProfile();
  const assetIds = collectFirstPaintThemeAssetIds(profile);
  const assets = assetIds.length ? await getThemeAssetMap(assetIds) : {};
  await Promise.all(Object.values(assets).map(preloadImageDataUrl));
  return { profile, assets };
}

// 给一步加超时兜底：先到的算数，另一个作废
function bootStep<T>(run: (done: (value: T) => void) => void, timeout: number): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    window.setTimeout(() => settle(undefined as T), timeout);
    run(settle);
  });
}

export function MainApp() {
  const [preparedDesktopTheme, setPreparedDesktopTheme] = useState<PreparedDesktopTheme | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [kvHydrateFailed, setKvHydrateFailed] = useState(false);
  const [initAttempt, setInitAttempt] = useState(0);
  // 开机覆盖层：splash = 开屏动画进行中；none = 已进主屏
  const [overlay, setOverlay] = useState<"splash" | "none">("none");
  const [bootPct, setBootPct] = useState(0);
  const [splashGone, setSplashGone] = useState(false);

  const overlayRef = useRef<"splash" | "none">("none");
  overlayRef.current = overlay;

  useEffect(() => {
    let cancelled = false;

    // 申请持久化存储：批准后 iOS/安卓不会再因存储压力擅自回收 IndexedDB
    // （摊主钥匙、聊天记录等都存在里面）。静默尽力而为，被拒也无碍。
    void navigator.storage?.persist?.().catch(() => {});

    void (async () => {
      await hydrateKvDb();
      if (cancelled) return;
      // 水合失败绝不放行：此时所有 KV 数据（设置/绑定/线下记录等）在内存里都是
      // 空的，进入后任何一次保存都会拿空数据整包覆盖 IndexedDB 里的真实历史。
      if (!isKvHydrated()) {
        setKvHydrateFailed(true);
        return;
      }
      setKvHydrateFailed(false);

      setOverlay("splash");

      const pushPct = (pct: number) => {
        if (!cancelled) setBootPct(pct);
      };

      // 总闸：无论卡在哪一步，到点一律放行进主屏
      const bootDeadline = window.setTimeout(() => {
        if (cancelled) return;
        setPreparedDesktopTheme(null);
        setHydrated(true);
        setBootPct(100);
      }, BOOT_MAX_MS);

      // ① 字体预热（分批缓存，最大的一步）
      await bootStep<void>(
        (done) => {
          void warmBuiltinFonts(() => cancelled).finally(() => done());
        },
        BOOT_FONT_TIMEOUT
      );
      pushPct(55);

      // ② 主题、壁纸与图标皮肤的读回与解码
      let nextPreparedTheme: PreparedDesktopTheme | null = null;
      try {
        nextPreparedTheme = await bootStep<PreparedDesktopTheme | null>(
          (done) => {
            void prepareDesktopThemeForFirstPaint().then(done, () => done(null));
          },
          BOOT_THEME_TIMEOUT
        );
      } catch (error) {
        console.warn("[MainApp] desktop theme preload failed:", error);
      }
      pushPct(92);

      // ③ 开屏标题那款字体就绪
      await bootStep<void>(
        (done) => {
          if (document.fonts?.ready) {
            document.fonts.ready.then(() => done(), () => done());
          } else {
            done();
          }
        },
        BOOT_SPLASH_FONT_TIMEOUT
      );
      pushPct(98);

      if (cancelled) return;
      window.clearTimeout(bootDeadline);
      setPreparedDesktopTheme(nextPreparedTheme);
      setHydrated(true);
      pushPct(100);

      if (hasPendingMcpOAuthCallback()) {
        // OAuth 回调等着跳：开屏都不要挡
        setOverlay("none");
        setSplashGone(true);
      }
      // 正常开屏的淡出与后续由 SplashSequence 的回调驱动
    })();

    // 安卓全屏兜底。是否请求全屏在每次点击时读取，设置切换后无需重载。
    const isMobile = window.matchMedia("(max-width: 500px) and (hover: none) and (pointer: coarse)").matches;
    if (!isMobile) {
      return () => {
        cancelled = true;
      };
    }

    function tryFullscreen() {
      if (!shouldRequestPwaFullscreen()) return;
      const doc = document.documentElement;
      if (document.fullscreenElement) return;
      doc.requestFullscreen?.().catch(() => { });
    }
    document.addEventListener("click", tryFullscreen);
    return () => {
      cancelled = true;
      document.removeEventListener("click", tryFullscreen);
    };
  }, [initAttempt]);

  if (kvHydrateFailed) {
    return (
      <main className="app-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: "0 28px", background: "#0c0c12", color: "#e8e8ef" }}>
        <div style={{ maxWidth: 340, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>本机数据暂时读取失败</div>
          <div style={{ fontSize: 13, lineHeight: 1.8, opacity: 0.75, marginBottom: 20 }}>
            浏览器的本地数据库（IndexedDB）没能打开。数据本身还在，为了避免在读不到数据的状态下继续使用把历史记录覆盖掉，应用先暂停进入。
            <br />可以先重试；仍然不行的话，试试关掉本站的其他标签页、重启浏览器，或确认没有开无痕/隐私模式。
          </div>
          <button
            type="button"
            onClick={() => { setKvHydrateFailed(false); setInitAttempt((n) => n + 1); }}
            style={{ padding: "10px 32px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            重试
          </button>
        </div>
      </main>
    );
  }

  // 水合前的静态第一帧：与开屏「标题静止」同一副面孔；跳过开屏时被锁屏
  // 首帧（layout 内联脚本注入）整个盖住，什么都看不见
  if (!hydrated) {
    return (
      <main className="app-root" style={{ minHeight: "100dvh" }}>
        <SplashFirstFrame />
      </main>
    );
  }

  return (
    <AccountGate>
      <main className="app-root">
        <MusicProvider>
          <DesktopShell
            initialThemeProfile={preparedDesktopTheme?.profile}
            initialThemeAssets={preparedDesktopTheme?.assets}
          />
          <UpdateNotice />
          <CloudBackupScheduler />
          <RealityBridgeScheduler />
          <WidgetScheduler />
          {/* 查岗轮询 + 主动截屏接收端。必须挂在桌面壳这种「一直在跑」的地方：
              角色查岗时用户多半正在别的 App 里，设置页根本没开着。 */}
          <CheckInScheduler />
          <MediaMaintenanceScheduler />
          {/* 壳推送订阅的兜底注册：壳原生那次失败是静默的，这里可验证地补一次 */}
          <ShellPushRegistrar />
        </MusicProvider>
      </main>
      {overlay === "splash" && !splashGone ? (
        <SplashSequence
          progress={bootPct}
          onReveal={() => {
            // 淡出开始：开屏揭开的就是主屏（锁屏与密码流程已移除）
            setOverlay("none");
          }}
          onGone={() => setSplashGone(true)}
        />
      ) : null}
    </AccountGate>
  );
}
