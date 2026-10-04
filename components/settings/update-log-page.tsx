"use client";

import { CheckCircle2, Clock, FileText } from "lucide-react";

import { CATEGORY_LABEL, RELEASES, seenReleases, type Release } from "@/lib/update-log";

/**
 * 设置 → 更新日志：把全部版本的记录列出来。
 * 数据只有一份（lib/update-log.ts），更新弹窗与这里读的是同一份。
 */
export function UpdateLogPage() {
  const seen = seenReleases();
  return (
    <div className="flex flex-col gap-5 h-full">
      <p className="card-section-label m-0 mx-2">更新日志</p>

      <div className="g-card">
        <div className="flex items-start gap-3">
          <FileText size={20} className="shrink-0 mt-0.5 text-[var(--c-icon-active)]" />
          <div className="flex flex-col gap-2">
            <span className="menu-label font-semibold">每次推送都会写在这里</span>
            <span className="menu-desc ts-13 leading-relaxed !mt-0">
              新增、调整与修复都会记在本页；还没实机验证或还没做完的事会单独写在「待完成」里，不会写成已经完成。
              新版本第一次打开会弹出更新说明，关掉之后不再重复弹。
            </span>
          </div>
        </div>
      </div>

      <div className="g-card">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="shrink-0 mt-0.5 text-[var(--c-icon-active)]" />
          <div className="flex flex-col gap-2">
            <span className="menu-label font-semibold">当前版本 {RELEASES[0]?.version}</span>
            <span className="menu-desc ts-13 leading-relaxed !mt-0">
              正式网址：https://float-0217.vercel.app （正式版直接发布，不另出预览版）
            </span>
          </div>
        </div>
      </div>

      {RELEASES.map((release) => (
        <ReleaseCard key={release.releaseId} release={release} seen={Boolean(seen[release.releaseId])} latest={release === RELEASES[0]} />
      ))}
    </div>
  );
}

function ReleaseCard({ release, seen, latest }: { release: Release; seen: boolean; latest: boolean }) {
  return (
    <div className="g-card">
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <span className="menu-label font-semibold">
          {release.version}
          {release.name ? ` · ${release.name}` : ""}
        </span>
        {latest && <span className="sr-chip" data-active="true">当前版本</span>}
        <span className="menu-desc !mt-0" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {seen ? <CheckCircle2 size={13} /> : <Clock size={13} />}
          {release.date}
        </span>
      </div>

      <div className="ui-row-divider !mx-0" />

      {release.entries.map((entry) => (
        <div key={entry.id} className="flex flex-col gap-1" style={{ marginTop: 10 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span className="sr-chip" data-active="true">{CATEGORY_LABEL[entry.category]}</span>
            <span className="menu-label">{entry.app}</span>
          </div>
          <span className="menu-desc ts-13 leading-relaxed !mt-0" style={{ fontWeight: 500 }}>{entry.title}</span>
          <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>
            {entry.items.map((item, index) => (
              <li key={index} className="menu-desc ts-13 leading-relaxed" style={{ listStyle: "disc" }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {release.pending && release.pending.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span className="menu-label font-semibold">待完成 / 待实机确认</span>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {release.pending.map((item, index) => (
              <li key={index} className="menu-desc ts-13 leading-relaxed" style={{ listStyle: "circle" }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
