"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";

const KEY = "ai_phone_studyroom_help_dismissed_v1";
registerKvMigration(KEY);

function loadDismissed(): Record<string, boolean> {
  try {
    const raw = kvGet(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function isHelpDismissed(id: string): boolean {
  return loadDismissed()[id] === true;
}

/** 点「不再提示」后，这个位置的问号不再出现。 */
export function dismissHelp(id: string): void {
  kvSet(KEY, JSON.stringify({ ...loadDismissed(), [id]: true }));
}

type HelpTipProps = {
  /** 稳定 id：决定「不再提示」记在哪一条上 */
  id: string;
  /** 无障碍标签 */
  label: string;
  children: ReactNode;
  /** 气泡方向：靠近页面底部时用 up，免得被裁掉 */
  placement?: "down" | "up";
};

/**
 * 功能旁的小问号：点开在控件附近显示一句短说明（这是什么 / 点了会怎样 / 数据存在哪），
 * 提供「知道了」与「不再提示」。点外部或按 Esc 关闭，不遮挡主要按钮。
 * 只放在不容易理解的功能旁，返回、搜索、点赞这类通用按钮不挂。
 */
export function HelpTip({ id, label, children, placement = "down" }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => isHelpDismissed(id));
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (dismissed) return null;

  return (
    <span className="sr-help" ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className="sr-help-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <HelpCircle size={15} strokeWidth={1.8} />
      </button>
      {open && (
        <span className="sr-help-bubble" role="dialog" aria-label={label} data-placement={placement}>
          <span className="sr-help-text">{children}</span>
          <span className="sr-help-actions">
            <button type="button" className="sr-help-link" onClick={() => setOpen(false)}>
              知道了
            </button>
            <button
              type="button"
              className="sr-help-link sr-help-link--muted"
              onClick={() => {
                dismissHelp(id);
                setDismissed(true);
              }}
            >
              不再提示
            </button>
          </span>
        </span>
      )}
    </span>
  );
}

/** 页面底部的「关于 xx」：一行短标签 + 问号，说明收进气泡，不再铺成段小字。 */
export function HelpFoot({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  if (isHelpDismissed(id)) return null;
  return (
    <div className="sr-help-foot">
      <span>{label}</span>
      <HelpTip id={id} label={label} placement="up">
        {children}
      </HelpTip>
    </div>
  );
}
