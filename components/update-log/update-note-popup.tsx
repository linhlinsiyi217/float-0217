"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";

import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_TINT,
  popupEntries,
  type Release,
  type UpdateEntry,
} from "@/lib/update-log/types";

type UpdateNotePopupProps = {
  /** 应用名，例如「小手机系统」「书房」 */
  appName: string;
  release: Release;
  /** 关闭（标记已读由调用方处理） */
  onClose: () => void;
  /** 可选：跳到完整的更新日志 */
  onOpenLog?: () => void;
};

/** 条目一行：「更新应用：书房 · 书城」+ 分类标签 + 具体内容 */
function EntryRow({ entry }: { entry: UpdateEntry }) {
  return (
    <li className="updn-row">
      <span className="updn-row-top">
        <span
          className="updn-tag"
          style={{ color: CATEGORY_COLOR[entry.category], background: CATEGORY_TINT[entry.category] }}
        >
          {CATEGORY_LABEL[entry.category]}
        </span>
        <span className="updn-row-app">更新应用：{entry.app}</span>
      </span>
      <span className="updn-row-title">{entry.title}</span>
    </li>
  );
}

/**
 * 更新弹窗（系统与书房共用一套）。
 *
 * 样式：纯白卡、宽松内边距、层级靠字号与字重拉开，分区之间用虚线分隔，
 * 版本号做成小型角标装饰。不用淡蓝大底、不用拥挤边框、不用便签胶带折角。
 *
 * 行为：摘要 3—5 条，五秒内能读完；「我知道了」立即可点，不强制等待、也不自动消失；
 * 详细内容默认折叠，想看再展开。每个实际新发布版本首次打开弹一次，
 * 确认后由调用方写入已读，同版本不再重复弹。
 */
export function UpdateNotePopup({ appName, release, onClose, onOpenLog }: UpdateNotePopupProps) {
  const [leaving, setLeaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const summary = useMemo(() => popupEntries(release, 5), [release]);
  const hasMore = release.entries.length > summary.length;

  const handleConfirm = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  return (
    <div className="updn-mask" role="dialog" aria-modal="true" aria-labelledby="updn-title">
      <section className="updn-card" data-leaving={leaving ? "true" : undefined}>
        <header className="updn-head">
          <span className="updn-badge" aria-hidden>
            v{release.version}
          </span>
          <span className="updn-head-main">
            <h2 className="updn-title" id="updn-title">
              {release.name ?? `${appName}更新到 ${release.version}`}
            </h2>
            <span className="updn-head-meta">
              {appName} · {release.date}
            </span>
          </span>
        </header>

        <p className="updn-summary">{release.summary}</p>

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
              {showAll ? "收起详细内容" : `查看详细内容（共 ${release.entries.length} 条）`}
              <ChevronDown size={14} strokeWidth={1.8} className="updn-more-arrow" aria-hidden />
            </button>

            {showAll && (
              <div className="updn-detail">
                {CATEGORY_ORDER.map((category) => {
                  const entries = release.entries.filter((entry) => entry.category === category);
                  if (entries.length === 0) return null;
                  return (
                    <div key={category} className="updn-detail-group">
                      <span className="updn-detail-label" style={{ color: CATEGORY_COLOR[category] }}>
                        <i style={{ background: CATEGORY_COLOR[category] }} aria-hidden />
                        {CATEGORY_LABEL[category]}
                      </span>
                      {entries.map((entry) => (
                        <div key={entry.id} className="updn-detail-entry">
                          <span className="updn-detail-app">更新应用：{entry.app}</span>
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
          {onOpenLog && (
            <button type="button" className="updn-link" onClick={onOpenLog}>
              更新日志
              <ArrowRight size={14} strokeWidth={1.8} aria-hidden />
            </button>
          )}
          <button type="button" className="updn-confirm" onClick={handleConfirm}>
            <Check size={15} strokeWidth={2} aria-hidden />
            我知道了
          </button>
        </footer>
      </section>
    </div>
  );
}
