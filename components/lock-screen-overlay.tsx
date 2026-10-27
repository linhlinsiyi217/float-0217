"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, ChevronUp, Flashlight, LockKeyhole } from "lucide-react";

import { readLockConfig, readLockWallpaper } from "@/lib/lock-screen";
import { LockPinPad } from "./lock-pin-pad";

// 模拟锁屏层。
//
// 这是「模拟锁屏」，只为开机的仪式感，不是安全功能；界面上也只这么描述。
// 密码明文存本机 kv，没有任何隐藏的万能密码。
//
// 交互：按下 → 往上划过阈值（72px）→ 松手。没密码直接滑出；有密码时钟往上
// 让位、键盘从底下顶起来。输错圆点抖一下再清空。
// 滑出时「撤跟手的内联 transform」与「挂 is-gone」必须在同一帧：中间隔一帧
// 就会先弹回原位再滑走，正是要避免的那一下不丝滑。React 的事件回调里先做
// DOM 撤值再 setState，两者会在同一次绘制前生效。

const LOCK_SWIPE = 72;
const LOCK_OUT_MS = 380;

type LockScreenOverlayProps = {
  onUnlocked: () => void;
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function clockText(now: Date): { time: string; date: string } {
  return {
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    date: `${now.getMonth() + 1}月${now.getDate()}日 星期${"日一二三四五六".charAt(now.getDay())}`,
  };
}

export function LockScreenOverlay({ onUnlocked }: LockScreenOverlayProps) {
  // 只在主屏已水合后挂载，kv 此时已在内存缓存里，同步读就是真值
  const [wall, setWall] = useState(() => (typeof window !== "undefined" ? readLockWallpaper() : ""));
  const [pin, setPin] = useState(() => (typeof window !== "undefined" ? readLockConfig().pin : ""));
  const [padOpen, setPadOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [gone, setGone] = useState(false);
  const [clock, setClock] = useState(() => clockText(new Date()));

  const layerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const goneRef = useRef(false);

  // 静态首帧 DOM（内联脚本注入的那份）到这里就交班：同结构同分钟，摘掉不闪
  useLayoutEffect(() => {
    document.getElementById("lock-first-frame")?.remove();
  }, []);

  // 时钟对齐到整分再转成每分钟一跳：按 60s 定时会把跳变漂到分钟中间
  useEffect(() => {
    let interval: number | null = null;
    const first = window.setTimeout(() => {
      setClock(clockText(new Date()));
      interval = window.setInterval(() => setClock(clockText(new Date())), 60000);
    }, 60000 - (Date.now() % 60000));
    return () => {
      window.clearTimeout(first);
      if (interval !== null) window.clearInterval(interval);
    };
  }, []);

  // 跟手留下的内联 transform 只有这里知道，撤掉后 is-gone / 弹回才接得住
  const clearDragTransform = useCallback(() => {
    if (layerRef.current) layerRef.current.style.removeProperty("transform");
    if (bodyRef.current) bodyRef.current.style.removeProperty("transform");
  }, []);

  const slideOut = useCallback(() => {
    if (goneRef.current) return;
    goneRef.current = true;
    setDragging(false);
    clearDragTransform();
    setGone(true);
    window.setTimeout(onUnlocked, LOCK_OUT_MS);
  }, [onUnlocked, clearDragTransform]);

  const requestUnlock = useCallback(() => {
    if (goneRef.current) return;
    if (!pin) {
      slideOut();
      return;
    }
    setDragging(false);
    clearDragTransform();
    setPadOpen(true);
  }, [pin, slideOut, clearDragTransform]);

  const pointY = (event: React.TouchEvent | React.MouseEvent): number => {
    if ("touches" in event) {
      const touch = event.touches[0] ?? event.changedTouches?.[0];
      return touch?.clientY ?? 0;
    }
    return event.clientY;
  };

  const down = useCallback(
    (event: React.TouchEvent | React.MouseEvent) => {
      if (goneRef.current || padOpen) return;
      draggingRef.current = true;
      startYRef.current = pointY(event);
      setDragging(true);
    },
    [padOpen]
  );

  const move = useCallback(
    (event: React.TouchEvent | React.MouseEvent) => {
      if (!draggingRef.current || goneRef.current) return;
      const dy = Math.max(0, startYRef.current - pointY(event));
      // 只跟上滑；往下拽不动，避免把锁屏拖出一条缝露出主屏。
      // 每帧直接写内联值不走 state —— 拖拽期间不重渲染
      const target = pin ? bodyRef.current : layerRef.current;
      if (target) target.style.transform = `translate3d(0, ${-dy}px, 0)`;
    },
    [pin]
  );

  const up = useCallback(
    (event: React.TouchEvent | React.MouseEvent) => {
      if (!draggingRef.current || goneRef.current) return;
      draggingRef.current = false;
      const dy = Math.max(0, startYRef.current - pointY(event));
      if (dy >= LOCK_SWIPE) {
        requestUnlock();
        return;
      }
      // 没过阈值：撤内联值，transition 自己弹回原位
      setDragging(false);
      clearDragTransform();
    },
    [requestUnlock, clearDragTransform]
  );

  const hasWall = wall.length > 0;
  const layerClass = `lock-layer${hasWall ? " has-wall" : ""}${dragging ? " is-dragging" : ""}${padOpen ? " is-pad" : ""}${gone ? " is-gone" : ""}`;

  return (
    <div
      ref={layerRef}
      className={layerClass}
      onTouchStart={down}
      onTouchMove={move}
      onTouchEnd={up}
      onMouseDown={down}
      onMouseMove={move}
      onMouseUp={up}
      onMouseLeave={up}
    >
      {hasWall ? <div className="lock-wall" style={{ backgroundImage: `url("${wall}")` }} /> : null}
      <div ref={bodyRef} className="lock-body">
        <div className="lock-top-status" aria-hidden="true">
          <span className="lock-top-carrier">FLOAT</span>
          <span className="lock-top-right"><span className="lock-signal" /> <span className="lock-wifi" /> <span className="lock-battery" /></span>
        </div>
        <div className="lock-top-lock" aria-hidden="true"><LockKeyhole size={14} strokeWidth={2} /></div>
        <div className="lock-time">{clock.time}</div>
        <div className="lock-date">{clock.date}</div>
        <div className="lock-widgets" aria-label="锁屏小组件">
          <div className="lock-widget"><span className="lock-widget-dot" /><span><b>小手机</b><small>角色与聊天已准备好</small></span></div>
          <div className="lock-widget lock-widget-weather"><b>☼</b><span><strong>晴</strong><small>24°</small></span></div>
        </div>
      </div>
      <div className="lock-bottom-actions" aria-hidden="true">
        <span className="lock-bottom-action"><Flashlight size={20} strokeWidth={2} /></span>
        <span className="lock-bottom-action"><Camera size={20} strokeWidth={2} /></span>
      </div>
      <div className="lock-hint">
        <ChevronUp strokeWidth={1.6} />
        <span>上滑解锁</span>
      </div>
      {padOpen ? (
        <LockPinPad
          mode="inline"
          title="输入密码"
          sub="模拟锁屏 · 4 位数字"
          onVerify={value => value === pin}
          onDone={() => slideOut()}
          onCancel={() => {
            setPadOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
