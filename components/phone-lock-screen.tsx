"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ChevronUp, Flashlight, LockKeyhole, Unlock } from "lucide-react";

type PhoneLockScreenProps = {
  onUnlock: () => void;
};

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
}

export function PhoneLockScreen({ onUnlock }: PhoneLockScreenProps) {
  const [now, setNow] = useState(() => new Date());
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const unlockedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const unlock = () => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    onUnlock();
  };

  return (
    <div
      className="phone-lock-screen"
      role="dialog"
      aria-modal="true"
      aria-label="锁屏"
      onPointerDown={(event) => {
        startY.current = event.clientY;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (startY.current === null) return;
        setDragY(Math.min(0, event.clientY - startY.current));
      }}
      onPointerUp={() => {
        if (dragY < -72) unlock();
        startY.current = null;
        setDragY(0);
      }}
      onPointerCancel={() => {
        startY.current = null;
        setDragY(0);
      }}
    >
      <div className="phone-lock-wallpaper" aria-hidden="true" />
      <div className="phone-lock-content" style={{ transform: `translateY(${dragY * 0.18}px)` }}>
        <div className="phone-lock-status"><span>FLOAT</span><span>● ◒ ▰</span></div>
        <div className="phone-lock-topline">
          <LockKeyhole size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>Float</span>
        </div>
        <time className="phone-lock-time">{formatTime(now)}</time>
        <div className="phone-lock-date">{formatDate(now)}</div>
        <div className="phone-lock-notice">
          <span className="phone-lock-notice-dot" />
          <div>
            <strong>小手机</strong>
            <span>保持你的角色与聊天在这里</span>
          </div>
        </div>
      </div>
      <div className="phone-lock-actions" aria-hidden="true">
        <span><Flashlight size={18} /></span><span><Camera size={18} /></span>
      </div>
      <button type="button" className="phone-lock-unlock" onClick={unlock} aria-label="解锁">
        <span className="phone-lock-unlock-icon"><Unlock size={17} strokeWidth={1.8} /></span>
        <span>向上滑动解锁</span>
        <ChevronUp size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}
