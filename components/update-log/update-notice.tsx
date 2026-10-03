"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";

import { CATEGORY_LABEL, hasSeenRelease, latestRelease, markReleaseSeen, type Release } from "@/lib/update-log";

/**
 * 更新弹窗：每个新版本第一次打开时弹一次，关掉或点确认才算已读。
 * 「查看全部更新日志」会跳到设置里的更新日志页（用已有的 open-app 事件）。
 */
export function UpdateNotice() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    const latest = latestRelease();
    // 每个 releaseId 只在第一次打开时弹；同版本刷新不会反复弹
    if (hasSeenRelease(latest.releaseId)) return;
    const timer = window.setTimeout(() => setRelease(latest), 600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!release) return null;

  const close = () => {
    markReleaseSeen(release.releaseId);
    setRelease(null);
  };

  const openLog = () => {
    markReleaseSeen(release.releaseId);
    setRelease(null);
    window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "settings", settingsPage: "about" } }));
  };

  return (
    <div className="modal-overlay" data-ui="modal">
      <section
        className="modal-dialog sr2-update-notice"
        data-ui="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sr2-update-title"
      >
        <div className="sr2-update-head">
          <span className="sr2-update-icon" aria-hidden>
            <Sparkles size={20} strokeWidth={1.7} />
          </span>
          <div>
            <h2 className="modal-title" id="sr2-update-title">
              更新到 {release.version}
              {release.name ? ` · ${release.name}` : ""}
            </h2>
            <p className="sr2-update-date">{release.date} 发布</p>
          </div>
        </div>

        <div className="sr2-update-body">
          {release.entries.map((entry) => (
            <div key={entry.id} className="sr2-update-entry">
              <div className="sr2-update-entry-head">
                <span className="sr2-update-tag">{CATEGORY_LABEL[entry.category]}</span>
                <span className="sr2-update-app">{entry.app}</span>
              </div>
              <p className="sr2-update-entry-title">{entry.title}</p>
              <ul>
                {entry.items.slice(0, 3).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ))}

          {release.pending && release.pending.length > 0 && (
            <div className="sr2-update-pending">
              <span>还没实机确认的：</span>
              <ul>
                {release.pending.slice(0, 3).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="sr2-update-actions">
          <button type="button" className="sr-btn" onClick={openLog}>
            查看全部更新日志
            <ArrowRight size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="sr-btn sr-btn-primary" onClick={close}>
            知道了
          </button>
        </div>
      </section>
    </div>
  );
}
