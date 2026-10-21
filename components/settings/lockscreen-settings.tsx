"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, RefreshCw, Trash2 } from "lucide-react";

import {
  LOCK_IDLE_OPTIONS,
  LOCK_PIN_LEN,
  LOCK_WALL_MAX,
  LOCK_WALL_QUALITY,
  readLockConfig,
  readLockWallpaper,
  resetLockWallpaper,
  saveLockWallpaper,
  setLockIdle,
  setLockOn,
  setLockPin,
  setLockSkipBoot,
  type LockConfig,
} from "@/lib/lock-screen";
import { fileToCompressedDataUrl } from "@/lib/music-bg";
import { Toggle } from "@/components/ui/form";
import { LockPinPad } from "../lock-pin-pad";

// 锁屏与开屏设置。每一项都是即时生效、即时落盘，所以没有「保存」按钮。
//
// 这是模拟锁屏，只为开机的仪式感，不是安全功能 —— 界面上也只这么描述，
// 不宣传能保护隐私；密码明文存本机，也没有任何隐藏的万能密码。

const IDLE_LABELS: Record<number, string> = {
  0: "立即",
  5: "5 分钟",
  15: "15 分钟",
  [-1]: "从不",
};

export function LockScreenSettings({ onNotice }: { onNotice?: (msg: string) => void }) {
  const [config, setConfig] = useState<LockConfig>(() =>
    typeof window === "undefined" ? { on: false, pin: "", skipBoot: false, idle: 5 } : readLockConfig()
  );
  const [wall, setWall] = useState(() => (typeof window === "undefined" ? "" : readLockWallpaper()));
  const [padOpen, setPadOpen] = useState(false);
  const [padStep, setPadStep] = useState(0); // 0 = 第一遍，1 = 再输一遍
  const [firstPin, setFirstPin] = useState("");
  const [wallBusy, setWallBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setConfig(readLockConfig());
    setWall(readLockWallpaper());
  }, []);

  const refresh = useCallback(() => {
    setConfig(readLockConfig());
    setWall(readLockWallpaper());
  }, []);

  const patch = useCallback((next: LockConfig) => {
    setConfig(next);
  }, []);

  // ── 密码 ──
  const openPinPad = useCallback(() => {
    setFirstPin("");
    setPadStep(0);
    setPadOpen(true);
  }, []);

  // ── 壁纸 ──
  const pickWallpaper = useCallback(
    async (file: File) => {
      setWallBusy(true);
      try {
        const dataUrl = await fileToCompressedDataUrl(file, LOCK_WALL_MAX, LOCK_WALL_QUALITY);
        if (!dataUrl) {
          onNotice?.("图片读取失败，请换一张");
          return;
        }
        saveLockWallpaper(dataUrl);
        setWall(readLockWallpaper());
        onNotice?.("锁屏壁纸已应用");
      } catch {
        onNotice?.("图片读取失败，请换一张");
      } finally {
        setWallBusy(false);
      }
    },
    [onNotice]
  );

  const sectionTitle = "text-[13px] font-semibold text-gray-500 tracking-wide";

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* 开关 */}
      <div className="flex flex-col gap-2">
        <p className={sectionTitle}>开关</p>
        <div className="flex flex-col gap-2">
          <div className="ui-group-card !flex-row !items-center justify-between">
            <div className="flex flex-col gap-0.5 min-w-0 pr-3">
              <span className="menu-label">开启锁屏</span>
              <span className="menu-desc">开机或切回前台时先经过锁屏页。</span>
            </div>
            <Toggle
              checked={config.on}
              onChange={value => patch(setLockOn(value))}
              className="shrink-0"
            />
          </div>
          <div
            className="ui-group-card !flex-row !items-center justify-between"
            style={{ opacity: config.on ? 1 : 0.5 }}
          >
            <div className="flex flex-col gap-0.5 min-w-0 pr-3">
              <span className="menu-label">跳过开屏动画</span>
              <span className="menu-desc">开机直接显示锁屏页（需要先开启锁屏）。</span>
            </div>
            <Toggle
              checked={config.on && config.skipBoot}
              disabled={!config.on}
              onChange={value => patch(setLockSkipBoot(value))}
              className="shrink-0"
            />
          </div>
        </div>
      </div>

      {/* 密码 */}
      <div className="flex flex-col gap-2">
        <p className={sectionTitle}>密码</p>
        <div className="flex flex-col gap-2">
          <div className="ui-group-card !flex-row !items-center justify-between">
            <div className="flex flex-col gap-0.5 min-w-0 pr-3">
              <span className="menu-label">{config.pin ? "已设置 4 位数字密码" : "未设置密码"}</span>
              <span className="menu-desc">
                {config.pin ? "上滑后输入密码才能解锁。" : "只设上滑也能解锁，密码是可选的。"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={openPinPad}
                className="inline-flex h-9 items-center justify-center rounded-[18px] border border-black/10 bg-white px-3.5 text-xs font-bold text-gray-800 shadow-sm transition-all hover:bg-gray-50 active:scale-95 focus:outline-none"
              >
                {config.pin ? "更改密码" : "设置密码"}
              </button>
              {config.pin ? (
                <button
                  type="button"
                  onClick={() => {
                    patch(setLockPin(""));
                    onNotice?.("已关闭密码，上滑即可解锁");
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-[18px] border border-black/10 bg-white px-3.5 text-xs font-bold text-gray-500 shadow-sm transition-all hover:bg-gray-50 active:scale-95 focus:outline-none"
                >
                  关闭
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* 自动锁定 */}
      <div className="flex flex-col gap-2">
        <p className={sectionTitle}>自动锁定</p>
        <div className="flex flex-wrap gap-2">
          {LOCK_IDLE_OPTIONS.map(idle => (
            <button
              key={idle}
              type="button"
              onClick={() => patch(setLockIdle(idle))}
              className="inline-flex h-9 items-center justify-center rounded-[18px] border px-4 text-xs font-bold transition-all active:scale-95 focus:outline-none"
              style={
                config.idle === idle
                  ? { background: "#1A1A1A", color: "#fff", borderColor: "#1A1A1A" }
                  : { background: "#fff", color: "#4b5563", borderColor: "rgba(0,0,0,0.1)" }
              }
            >
              {IDLE_LABELS[idle] ?? String(idle)}
            </button>
          ))}
        </div>
        <span className="menu-desc">切到后台超出所选时间后，回来需要重新解锁。</span>
      </div>

      {/* 壁纸 */}
      <div className="flex flex-col gap-2">
        <p className={sectionTitle}>壁纸</p>
        <div className="ui-group-card">
          <div className="flex items-center gap-4">
            <div
              className="h-[92px] w-[56px] shrink-0 overflow-hidden rounded-[14px] border border-black/10 bg-gray-100"
              style={
                wall
                  ? { backgroundImage: `url("${wall}")`, backgroundSize: "cover", backgroundPosition: "center" }
                  : {
                      background:
                        "radial-gradient(120% 90% at 50% 0%, #f6f7fa 0%, #edeff5 52%, #e2e6f0 100%)",
                    }
              }
            >
              {!wall ? (
                <div className="flex h-full items-center justify-center">
                  <ImageIcon size={18} className="text-gray-300" />
                </div>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="menu-label">{wall ? "自定义壁纸" : "默认样式"}</span>
              <span className="menu-desc">图片会压缩到 {LOCK_WALL_MAX}px 内保存，只用于锁屏。</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={wallBusy}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[18px] bg-black px-3.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-95 focus:outline-none disabled:opacity-50"
                >
                  <RefreshCw size={13} className={wallBusy ? "animate-spin" : ""} />
                  {wallBusy ? "处理中" : "更换壁纸"}
                </button>
                {wall ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetLockWallpaper();
                      setWall("");
                      onNotice?.("已恢复默认样式");
                    }}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[18px] border border-black/10 bg-white px-3.5 text-xs font-bold text-gray-500 shadow-sm transition-all hover:bg-gray-50 active:scale-95 focus:outline-none"
                  >
                    <Trash2 size={13} />
                    恢复默认
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void pickWallpaper(file);
            }}
          />
        </div>
      </div>

      <div className="ui-group-card">
        <span className="menu-desc">
          这是模拟锁屏，只为开机的仪式感，不是安全功能；密码保存在本机。
        </span>
      </div>

      {padOpen ? (
        <LockPinPad
          mode="overlay"
          title={padStep === 0 ? (config.pin ? "输入新密码" : "设置密码") : "再次输入"}
          sub={padStep === 0 ? `${LOCK_PIN_LEN} 位数字` : "确认一遍，防止手滑"}
          step={padStep}
          onVerify={value => (padStep === 0 ? true : value === firstPin)}
          onDone={value => {
            if (padStep === 0) {
              setFirstPin(value);
              setPadStep(1);
              return;
            }
            patch(setLockPin(value));
            setPadOpen(false);
            onNotice?.("密码已设置");
          }}
          onCancel={() => {
            if (padStep === 1) {
              // 回到第一遍重设，而不是直接关掉
              setFirstPin("");
              setPadStep(0);
              return;
            }
            setPadOpen(false);
          }}
        />
      ) : null}

      {/* kv 可能在别处被整包换掉（云恢复等）：设置页打开期间贴着真值 */}
      <RefreshOnChange onChange={refresh} />
    </div>
  );
}

// kv 恢复事件不针对单页广播，这里用 visibility 兜底：切回设置页时重新读一次
function RefreshOnChange({ onChange }: { onChange: () => void }) {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") onChange();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onChange]);
  return null;
}
