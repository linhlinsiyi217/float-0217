"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type DockItem = {
  key: string;
  label: string;
  icon: LucideIcon;
};

type StudyRoomDockProps = {
  items: DockItem[];
  active: string;
  onSelect: (key: string) => void;
};

const TAB_GAP = 2;
const BAR_PADDING = 5;
/** 未选中项最窄也要能放得下一个图标（低于这个值就压缩选中项宽度） */
const MIN_IDLE_WIDTH = 38;

/**
 * 书房底部 Dock。
 *
 * 规则：
 *  - 宽度随手机宽度自适应，入口数量变化时自动重算每一项的宽度；
 *  - 未选中的入口只显示图标，选中的入口横向展开为「图标＋单行文字」；
 *  - 选中胶囊用 transform + width 过渡跟随，切换时有一次克制的压缩回弹（scale 独立属性）；
 *  - 全部用 transform / opacity / 少量宽度过渡，不使用 transition: all；
 *  - 动画可被下一次点击直接打断（CSS 过渡天然可中断，不排队）；
 *  - prefers-reduced-motion 下只保留位置切换，不做压缩回弹。
 */
export function StudyRoomDock({ items, active, onSelect }: StudyRoomDockProps) {
  const barRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [sizes, setSizes] = useState({ active: 88, idle: 50 });
  const [capsule, setCapsule] = useState({ x: 0, w: 88, ready: false });
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const squashRef = useRef<Animation | null>(null);
  const [reduced, setReduced] = useState(false);

  // 按容器实际宽度算宽度：选中项要放得下图标与两三个字，其他项只放图标
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const count = Math.max(items.length, 1);
      const usable = bar.clientWidth - BAR_PADDING * 2 - TAB_GAP * (count - 1);
      let activeWidth = Math.round(Math.min(96, Math.max(72, usable * 0.27)));
      let idleWidth = Math.floor((usable - activeWidth) / (count - 1));
      if (idleWidth < MIN_IDLE_WIDTH) {
        idleWidth = MIN_IDLE_WIDTH;
        activeWidth = Math.max(60, usable - idleWidth * (count - 1));
      }
      setSizes({ active: activeWidth, idle: Math.max(idleWidth, 30) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [items.length]);

  // 胶囊跟随选中项（位置与宽度都用测量值，切换时由 CSS 过渡动画）
  useLayoutEffect(() => {
    const tab = tabRefs.current[active];
    if (!tab) return;
    setCapsule({ x: tab.offsetLeft, w: tab.offsetWidth, ready: true });
  }, [active, sizes, items.length]);

  // 每次切换触发一次压缩回弹（可被下一次点击覆盖，不会排队）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReduced(query?.matches === true);
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  // 切换时的克制压缩回弹：用 WAAPI 重放，并且每次都先取消上一次（可直接被打断，不排队）
  useEffect(() => {
    const el = capsuleRef.current;
    if (!el || reduced || typeof el.animate !== "function") return;
    squashRef.current?.cancel();
    squashRef.current = el.animate(
      [
        { scale: "1 1" },
        { scale: "0.94 1.02", offset: 0.35 },
        { scale: "1.02 0.99", offset: 0.72 },
        { scale: "1 1" },
      ],
      { duration: 340, easing: "ease-out" },
    );
    return () => squashRef.current?.cancel();
  }, [active, reduced]);

  const setTabRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    tabRefs.current[key] = el;
  }, []);

  const totalWidth = sizes.active + sizes.idle * Math.max(items.length - 1, 0) + TAB_GAP * Math.max(items.length - 1, 0);

  return (
    <nav className="sr-dock" aria-label="书房导航" ref={barRef}>
      <span
        ref={capsuleRef}
        className="sr-dock-capsule"
        aria-hidden
        data-ready={capsule.ready ? "true" : undefined}
        style={{ transform: `translate3d(${capsule.x}px, 0, 0)`, width: `${capsule.w}px` }}
      />
      <div className="sr-dock-row" style={{ width: `${Math.max(totalWidth, 0)}px` }}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              ref={(el) => setTabRef(item.key, el)}
              className="sr-dock-tab"
              data-active={isActive ? "true" : undefined}
              style={{ width: `${isActive ? sizes.active : sizes.idle}px` }}
              onClick={() => onSelect(item.key)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="sr-dock-icon" aria-hidden>
                <Icon size={20} strokeWidth={isActive ? 2 : 1.6} />
              </span>
              <span className="sr-dock-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
