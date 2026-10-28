"use client";

import { useEffect, useRef, useState } from "react";

// 开屏：标题静止 → 收束成一条线 → 真进度条填满 → 淡出进主屏。
//
// 进度条填的是【真进度】（字体、主题、壁纸都备好才走完，由 MainApp 推进来），
// 它走完时主屏在背后已经是最终的样子，淡出之后一处都不会再跳。
// 收束与淡出的节奏归本组件管；进度只许前进，回退值一律忽略。

const HOLD_MS = 600; // 完整标题静止展示
const MORPH_MS = 320; // 标题收束成线
const COMPLETE_HOLD_MS = 120; // 满格停顿
const FADE_MS = 500; // 启动层淡出

const HOLD_MS_REDUCED = 400;
const FADE_MS_REDUCED = 200;

type SplashSequenceProps = {
  /** 0-100，MainApp 推真进度；低于当前值的回退忽略 */
  progress: number;
  /** 淡出开始时叫一声：MainApp 此刻揭开的已经是主屏 */
  onReveal: () => void;
  /** 淡出动画结束，可以卸载了 */
  onGone: () => void;
};

const SPLASH_STYLES = `
.ss-root{position:fixed;inset:0;z-index:210;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;color:#F5F5F7;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","PingFang SC",system-ui,sans-serif;transition:opacity .5s ease}
.ss-root.is-fading{opacity:0;pointer-events:none}
.ss-title{font-family:inherit;font-style:normal;font-weight:700;font-size:clamp(44px,13vw,72px);line-height:1;letter-spacing:-.055em;transform-origin:50% 58%;transition:transform ${MORPH_MS}ms cubic-bezier(.65,0,.35,1),opacity ${MORPH_MS}ms ease}
.ss-root.is-morph .ss-title{transform:scaleY(.045);opacity:0}
.ss-line{width:0;height:2px;border-radius:2px;background:#0A84FF;margin-top:2px;transition:width ${MORPH_MS}ms cubic-bezier(.65,0,.35,1)}
.ss-root.is-morph .ss-line{width:76px}
.ss-track{position:relative;width:min(52vw,264px);height:2px;margin-top:28px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden;opacity:0;transform:translateY(4px);transition:opacity .3s ease,transform .3s ease}
.ss-root.is-morph .ss-track{opacity:1;transform:translateY(0)}
.ss-fill{position:absolute;inset:0;right:auto;width:0;border-radius:3px;background:#0A84FF;transition:width .22s ease-out}
.ss-sub{position:absolute;bottom:max(calc(34px + env(safe-area-inset-bottom,0px)),38px);font-size:10px;font-weight:500;letter-spacing:.24em;text-indent:.24em;color:rgba(245,245,247,.48)}
@media (prefers-reduced-motion:reduce){.ss-root{transition:opacity .2s ease}.ss-title,.ss-line,.ss-track,.ss-fill{transition-duration:.01ms}}
`;

// 数据还没水合时的静态第一帧：与 SplashSequence 标题静止阶段同一副面孔，
// 水合完成、真开屏层接手时肉眼无感
export function SplashFirstFrame() {
  return (
    <div className="ss-root" role="status" aria-label="启动中">
      <style dangerouslySetInnerHTML={{ __html: SPLASH_STYLES }} />
      <div className="ss-title">Float</div>
      <div className="ss-line" />
      <div className="ss-track">
        <div className="ss-fill" style={{ width: "0%" }} />
      </div>
      <div className="ss-sub">LINH POCKET YI</div>
    </div>
  );
}

export function SplashSequence({ progress, onReveal, onGone }: SplashSequenceProps) {
  const [morphed, setMorphed] = useState(false);
  const [fill, setFill] = useState(0);
  const [fading, setFading] = useState(false);
  const pctRef = useRef(0);
  const morphAtRef = useRef(0);
  const revealedRef = useRef(false);
  const finishedRef = useRef(false);

  // 减弱动态效果：短流程。整段判定一次就够
  const reducedRef = useRef(
    typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const reduced = reducedRef.current;
    const holdTimer = window.setTimeout(
      () => {
        setMorphed(true);
        morphAtRef.current = Date.now();
      },
      reduced ? HOLD_MS_REDUCED : HOLD_MS
    );
    return () => window.clearTimeout(holdTimer);
  }, []);

  // 进度只许前进
  useEffect(() => {
    const next = Math.max(pctRef.current, Math.min(100, Math.round(progress)));
    if (next <= pctRef.current) return;
    pctRef.current = next;
    setFill(next);
  }, [progress]);

  // 满 + 收束已走 + 最短填充时长 → 满格停一拍 → 淡出
  useEffect(() => {
    if (fill < 100 || !morphed || finishedRef.current) return;
    finishedRef.current = true;
    const reduced = reducedRef.current;
    const elapsed = Date.now() - morphAtRef.current;
    const wait = Math.max(0, 400 - elapsed) + (reduced ? 0 : COMPLETE_HOLD_MS);
    const revealTimer = window.setTimeout(() => {
      if (!revealedRef.current) {
        revealedRef.current = true;
        onReveal();
      }
      setFading(true);
    }, wait);
    const goneTimer = window.setTimeout(
      () => onGone(),
      wait + (reduced ? FADE_MS_REDUCED : FADE_MS) + 40
    );
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(goneTimer);
    };
  }, [fill, morphed, onReveal, onGone]);

  return (
    <div
      className={`ss-root${morphed ? " is-morph" : ""}${fading ? " is-fading" : ""}`}
      role="status"
      aria-label="启动中"
    >
      <style dangerouslySetInnerHTML={{ __html: SPLASH_STYLES }} />
      <div className="ss-title">Float</div>
      <div className="ss-line" />
      <div className="ss-track">
        <div className="ss-fill" style={{ width: `${fill}%` }} />
      </div>
      <div className="ss-sub">LINH POCKET YI</div>
    </div>
  );
}
