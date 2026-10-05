"use client";

import { useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";

import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  releaseApps,
  releaseCounts,
  type Release,
} from "@/lib/update-log/types";

type UpdateLogViewProps = {
  releases: Release[];
  /** 当前版本（默认展开、带标记） */
  currentReleaseId?: string;
  /** 已读时间：显示「已看过」用 */
  seen?: Record<string, string>;
};

/**
 * 更新日志的版本卡片列表（系统与书房共用）。
 * 收起时只有版本号、日期、应用名、一句话概括、各类型数量与展开箭头；
 * 展开后按「新增 / 修复 / 优化 / 调整」列出全部条目，可同时展开多个版本对照。
 */
export function UpdateLogView({ releases, currentReleaseId, seen }: UpdateLogViewProps) {
  const [open, setOpen] = useState<string[]>(() => (currentReleaseId ? [currentReleaseId] : []));

  const toggle = (releaseId: string) => {
    setOpen((prev) => (prev.includes(releaseId) ? prev.filter((id) => id !== releaseId) : [...prev, releaseId]));
  };

  return (
    <div className="upd-list">
      {releases.map((release) => {
        const expanded = open.includes(release.releaseId);
        const isCurrent = release.releaseId === currentReleaseId;
        const counts = releaseCounts(release);
        const apps = releaseApps(release);
        return (
          <section key={release.releaseId} className="upd-card" data-open={expanded ? "true" : undefined}>
            <button type="button" className="upd-card-head" onClick={() => toggle(release.releaseId)} aria-expanded={expanded}>
              <span className="upd-card-main">
                <span className="upd-card-top">
                  <strong className="upd-version">v{release.version}</strong>
                  {isCurrent && <span className="upd-current">当前版本</span>}
                  <span className="upd-date">
                    <Clock3 size={12} strokeWidth={1.8} aria-hidden />
                    {release.date}
                  </span>
                </span>
                <span className="upd-apps">{apps.join(" / ")}</span>
                <span className="upd-summary">{release.summary}</span>
                {!expanded && counts.length > 0 && (
                  <span className="upd-counts">
                    {counts.map((item) => (
                      <span key={item.category} className="upd-count" style={{ color: CATEGORY_COLOR[item.category] }}>
                        {CATEGORY_LABEL[item.category]} {item.count}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <ChevronDown size={18} strokeWidth={1.8} className="upd-arrow" aria-hidden />
            </button>

            {expanded && (
              <div className="upd-body">
                {CATEGORY_ORDER.map((category) => {
                  const entries = release.entries.filter((entry) => entry.category === category);
                  if (entries.length === 0) return null;
                  return (
                    <div key={category} className="upd-group">
                      <span className="upd-group-label" style={{ color: CATEGORY_COLOR[category] }}>
                        <i style={{ background: CATEGORY_COLOR[category] }} aria-hidden />
                        {CATEGORY_LABEL[category]}
                      </span>
                      {entries.map((entry) => (
                        <div key={entry.id} className="upd-entry">
                          <span className="upd-entry-app">{entry.app}</span>
                          <span className="upd-entry-title">{entry.title}</span>
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

                {/* pending（待完成 / 待实机确认）只留在发布数据与交付报告里，
                    不在用户界面上渲染成开发提示卡。 */}

                <p className="upd-meta">
                  {seen?.[release.releaseId]
                    ? `上次查看：${new Date(seen[release.releaseId]).toLocaleDateString("zh-CN")}`
                    : "还未查看过这一版"}
                </p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
