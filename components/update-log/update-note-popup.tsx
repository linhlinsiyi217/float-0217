"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  normalizeUpdateCategory,
  popupEntries,
  releaseHasScope,
  scopeGroups,
  SCOPE_COLOR,
  SCOPE_LABEL,
  type Release,
  type UpdateEntry,
} from "@/lib/update-log/types";

type UpdateNotePopupProps = {
  /** 应用名，例如「小手机系统」「书房」 */
  appName: string;
  release: Release;
  /** 用户点「我知道了」：调用方在这里写入已读（只有这一处算确认） */
  onConfirm: () => void;
  /** 「查看完整日志」：只收起弹窗去看日志，不算已读，下次打开还会弹 */
  onOpenLog?: () => void;
  /** 按 Esc / 点遮罩 / 点「稍后查看」收起：同样不算已读 */
  onHide?: () => void;
};

/** 弹窗摘要条目：范围、标题和一条真正有用的说明，避免只列一串裸标题。 */
function EntryRow({ entry }: { entry: UpdateEntry }) {
  const color = entry.scope ? SCOPE_COLOR[entry.scope] : CATEGORY_COLOR[entry.category];
  const label = entry.scope ? SCOPE_LABEL[entry.scope] : CATEGORY_LABEL[entry.category];
  return (
    <li className="updn-row" title={entry.app} style={{ "--updn-row-color": color } as CSSProperties}>
      <div className="updn-row-mark" aria-hidden><i /></div>
      <div className="updn-row-content">
        <div className="updn-row-top">
          <span className="updn-tag">{label}</span>
          <span className="updn-row-app">{entry.app}</span>
        </div>
        <strong className="updn-row-title">{entry.title}</strong>
        {entry.items[0] && <span className="updn-row-detail">{entry.items[0]}</span>}
      </div>
    </li>
  );
}

/**
 * 更新弹窗（系统与书房共用一套）。
 *
 * 轻量：轻微半透明玻璃卡、1px 细边框、浅阴影、适中圆角；顶部只放
 * WHAT'S NEW / 更新公告 / 版本号与日期，内容只列紧凑条目，不把整页日志塞进来。
 * 行为：只有点「我知道了」才写入已读；「稍后查看」、点遮罩、按 Esc 都只是暂时收起，
 * 同版本下次打开还会弹。无倒计时、不自动消失。
 */
export function UpdateNotePopup({ appName, release, onConfirm, onOpenLog, onHide }: UpdateNotePopupProps) {
  const [leaving, setLeaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const summary = useMemo(() => popupEntries(release, 5), [release]);
  const hasMore = release.entries.length > summary.length;

  const handleConfirm = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onConfirm, 160);
  };

  const handleDismiss = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => (onHide ?? onOpenLog ?? onConfirm)(), 160);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  return (
    <div className="updn-mask" role="dialog" aria-modal="true" aria-labelledby="updn-title" onMouseDown={handleDismiss}>
      <section
        className="updn-card"
        data-leaving={leaving ? "true" : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="updn-head">
          <span className="updn-eyebrow">WHAT&apos;S NEW</span>
          <h2 className="updn-title" id="updn-title">
            更新公告
          </h2>
          <span className="updn-meta">
            {appName} · v{release.version} · {release.date}
            {onOpenLog && (
              <>
                {" · "}
                <button
                  type="button"
                  className="updn-meta-link"
                  onClick={() => {
                    if (leaving) return;
                    setLeaving(true);
                    window.setTimeout(onOpenLog, 160);
                  }}
                >
                  查看完整日志
                </button>
              </>
            )}
          </span>
        </header>

        <p className="updn-summary">{release.summary}</p>
        <div className="updn-section-label">本次更新</div>
        <ul className="updn-list">
          {summary.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ul>

        {hasMore && (
          <>
            <button
              type="button"
              className="updn-more"
              onClick={() => setShowAll((value) => !value)}
              aria-expanded={showAll}
            >
              {showAll ? "收起" : `查看全部 ${release.entries.length} 条`}
              <ChevronDown size={13} strokeWidth={1.8} className="updn-more-arrow" aria-hidden />
            </button>

            {showAll && (
              <div className="updn-detail">
                {releaseHasScope(release)
                  ? scopeGroups(release.entries).map((group) => (
                      <div key={group.scope} className="updn-detail-group">
                        <span className="updn-detail-label" style={{ color: SCOPE_COLOR[group.scope] }}>
                          <i style={{ background: SCOPE_COLOR[group.scope] }} aria-hidden />
                          {SCOPE_LABEL[group.scope]}
                        </span>
                        {group.entries.map((entry) => (
                          <div key={entry.id} className="updn-detail-entry">
                            <span className="updn-detail-title">{entry.title}</span>
                            <ul>
                              {entry.items.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ))
                  : CATEGORY_ORDER.map((category) => {
                      const entries = release.entries.filter((entry) => normalizeUpdateCategory(entry.category) === category);
                      if (entries.length === 0) return null;
                      return (
                        <div key={category} className="updn-detail-group">
                          <span className="updn-detail-label" style={{ color: CATEGORY_COLOR[category] }}>
                            <i style={{ background: CATEGORY_COLOR[category] }} aria-hidden />
                            {CATEGORY_LABEL[category]}
                          </span>
                          {entries.map((entry) => (
                            <div key={entry.id} className="updn-detail-entry">
                              <span className="updn-detail-title">{entry.title}</span>
                              <ul>
                                {entry.items.map((item, index) => (
                                  <li key={index}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      );
                    })}
              </div>
            )}
          </>
        )}

        <footer className="updn-foot">
          <button type="button" className="updn-link" onClick={handleDismiss}>
            稍后查看
          </button>
          <button type="button" className="updn-confirm" onClick={handleConfirm}>
            <Check size={14} strokeWidth={2.2} aria-hidden />
            我知道了
          </button>
        </footer>
      </section>
    </div>
  );
}
