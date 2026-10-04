"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { CATEGORY_COLOR, CATEGORY_LABEL, popupEntries, type Release } from "@/lib/update-log/types";

type UpdateNotePopupProps = {
  /** 应用名，例如「小手机」「书房」 */
  appName: string;
  release: Release;
  /** 关闭（标记已读由调用方处理） */
  onClose: () => void;
  /** 可选：跳到完整的更新日志 */
  onOpenLog?: () => void;
  /** 阅读等待时间（毫秒），到了之后确认按钮才可点 */
  readDelayMs?: number;
};

/**
 * 便签式更新弹窗（系统与书房共用一套）。
 *
 * 规则：每个新版本首次打开显示一次；先让用户读约 5 秒，之后「我知道了」才可点；
 * 点击后关闭，不自动消失。样式是冷白便签：大圆角、柔和阴影、极淡纹理、
 * 半透明胶带与右上折角，背景是 Pearl Glass 模糊遮罩。
 */
export function UpdateNotePopup({ appName, release, onClose, onOpenLog, readDelayMs = 5000 }: UpdateNotePopupProps) {
  const [remaining, setRemaining] = useState(Math.ceil(readDelayMs / 1000));
  const [leaving, setLeaving] = useState(false);
  const entries = useMemo(() => popupEntries(release, 2), [release]);

  // 阅读倒计时：到点才允许确认
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && remaining <= 0) handleConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const handleConfirm = () => {
    if (remaining > 0) return;
    setLeaving(true);
    window.setTimeout(onClose, 180);
  };

  return (
    <div className="sr-note-mask" role="dialog" aria-modal="true" aria-labelledby="sr-note-title">
      <section className="sr-note" data-leaving={leaving ? "true" : undefined}>
        <span className="sr-note-tape" aria-hidden />
        <span className="sr-note-fold" aria-hidden />

        <header className="sr-note-head">
          <span className="sr-note-app">{appName}</span>
          <span className="sr-note-version">版本 {release.version}</span>
          <span className="sr-note-date">{release.date}</span>
        </header>

        <h2 className="sr-note-title" id="sr-note-title">
          {release.name ?? `更新到 ${release.version}`}
        </h2>
        <p className="sr-note-summary">{release.summary}</p>

        <ul className="sr-note-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="sr-note-tag" style={{ color: CATEGORY_COLOR[entry.category] }}>
                <i style={{ background: CATEGORY_COLOR[entry.category] }} aria-hidden />
                {CATEGORY_LABEL[entry.category]}
              </span>
              <span className="sr-note-item">{entry.title}</span>
            </li>
          ))}
        </ul>

        <footer className="sr-note-foot">
          {onOpenLog && (
            <button type="button" className="sr-note-link" onClick={onOpenLog}>
              查看全部更新
              <ArrowRight size={14} strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            className="sr-note-confirm"
            onClick={handleConfirm}
            disabled={remaining > 0}
            aria-disabled={remaining > 0}
          >
            {remaining > 0 ? (
              <span>请先看看更新内容（{remaining}s）</span>
            ) : (
              <>
                <Check size={15} strokeWidth={2} />
                我知道了
              </>
            )}
          </button>
        </footer>
      </section>
    </div>
  );
}
