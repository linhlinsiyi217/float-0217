"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LOCK_PIN_LEN } from "@/lib/lock-screen";

// 4 位数字键盘。锁屏页（贴底 inline）与锁屏设置（全屏浮层 overlay）共用同一套。
//
// 输满 4 位就交 onVerify 校验：通过只锁键不拆层，收尾（滑出/淡出）归 onDone
// 那边定 —— 解锁那一路要让键盘跟着整页一起滑出去，拆早了就是
// 「键盘先凭空消失，页面才动」。不对就抖一下再清空：清早了圆点在抖动
// 过程里已经空了，看着像没输进去。

type LockPinPadProps = {
  /** overlay = 全屏浮层（设置页）；inline = 贴住最近的定位父层（锁屏页） */
  mode: "overlay" | "inline";
  title: string;
  sub?: string;
  /** 变化时清空已输内容并接受新的 title/sub —— 设置密码「再次输入」那一步用 */
  step?: number;
  onVerify?: (pin: string) => boolean;
  onDone: (pin: string) => void;
  onCancel?: () => void;
};

const KEY_SUBS = ["", "ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ"];

export function LockPinPad({
  mode,
  title,
  sub,
  step = 0,
  onVerify,
  onDone,
  onCancel,
}: LockPinPadProps) {
  const [buf, setBuf] = useState("");
  const [visible, setVisible] = useState(false);
  const [shaking, setShaking] = useState(false);
  const busyRef = useRef(false);
  const bufRef = useRef("");
  const badTimerRef = useRef<number | null>(null);

  // 挂载后下一帧再亮：让淡入过渡真的发生
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  // 换步骤：清空输入与抖动，父层同步换 title/sub
  useEffect(() => {
    if (badTimerRef.current) {
      window.clearTimeout(badTimerRef.current);
      badTimerRef.current = null;
    }
    busyRef.current = false;
    bufRef.current = "";
    setShaking(false);
    setBuf("");
  }, [step]);

  useEffect(() => () => {
    if (badTimerRef.current) window.clearTimeout(badTimerRef.current);
  }, []);

  const push = useCallback(
    (digit: string) => {
      if (busyRef.current) return;
      if (bufRef.current.length >= LOCK_PIN_LEN) return;
      const next = bufRef.current + digit;
      bufRef.current = next;
      setBuf(next);
      if (next.length < LOCK_PIN_LEN) return;
      // 输满：认这一轮
      const ok = onVerify ? !!onVerify(next) : true;
      if (ok) {
        busyRef.current = true;
        const done = onDone;
        window.setTimeout(() => done(next), 120);
        return;
      }
      // 抖完再清
      setShaking(true);
      badTimerRef.current = window.setTimeout(() => {
        busyRef.current = false;
        bufRef.current = "";
        setShaking(false);
        setBuf("");
      }, 460);
    },
    [onVerify, onDone]
  );

  const del = useCallback(() => {
    if (busyRef.current) return;
    bufRef.current = bufRef.current.slice(0, -1);
    setBuf(bufRef.current);
  }, []);

  const cancel = useCallback(() => {
    if (busyRef.current) return;
    onCancel?.();
  }, [onCancel]);

  const pad = (
    <div className={`lock-pad${visible ? " is-in" : ""}`}>
      <div className="lock-pad-head">
        <div className="lock-pad-title">{title}</div>
        {sub ? <div className="lock-pad-sub">{sub}</div> : null}
        <div className={`lock-dots${shaking ? " is-bad" : ""}`}>
          <i className={buf.length >= 1 ? "is-on" : ""} />
          <i className={buf.length >= 2 ? "is-on" : ""} />
          <i className={buf.length >= 3 ? "is-on" : ""} />
          <i className={buf.length >= 4 ? "is-on" : ""} />
        </div>
      </div>
      <div className="lock-keys">
        {Array.from({ length: 9 }, (_, index) => (
          <button
            key={index + 1}
            type="button"
            className="lock-key"
            onClick={() => push(String(index + 1))}
          >
            <b>{index + 1}</b>
            <s>{KEY_SUBS[index]}</s>
          </button>
        ))}
        <button type="button" className="lock-key-fn" onClick={cancel}>
          取消
        </button>
        <button type="button" className="lock-key" onClick={() => push("0")}>
          <b>0</b>
          <s>&nbsp;</s>
        </button>
        <button type="button" className="lock-key-fn" onClick={del}>
          删除
        </button>
      </div>
    </div>
  );

  if (mode === "inline") return pad;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(16, 20, 34, 0.4)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.22s ease",
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <div style={{ width: "min(100vw, 420px)", position: "relative" }}>{pad}</div>
    </div>
  );
}
