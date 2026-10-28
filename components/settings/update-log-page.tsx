"use client";

import { useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";

import { UpdateLogView } from "@/components/update-log/update-log-view";
import { SYSTEM_RELEASE_LIST, seenSystemReleases } from "@/lib/update-log/system";
import {
  checkForUpdate,
  UPDATE_CHECK_FAILED_TEXT,
  useReleaseList,
  type UpdateCheckState,
} from "@/lib/update-log/update-service";

/**
 * 设置 → 更新日志：全项目统一的更新日志入口，和全局更新公告读同一份数据。
 * 进入页面时自动核对一次线上版本；顶部「检查更新」可手动再查。
 * 线上有更新的一版时，列表最上面直接换成那一版（公告也会同步弹出它）。
 */
export function UpdateLogPage() {
  const seen = seenSystemReleases();
  const releases = useReleaseList();
  const current = releases[0];
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckState | null>(null);

  const runCheck = async () => {
    if (checking) return;
    setChecking(true);
    setResult(null);
    const outcome = await checkForUpdate();
    setChecking(false);
    setResult(outcome.state);
  };

  // 进入更新中心：实时核对一次
  useEffect(() => {
    void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText = checking
    ? "正在检查更新…"
    : result === "available"
      ? `已有新版本 v${current?.version}，刷新网页或重新打开应用即可使用`
      : result === "latest"
        ? "已是最新版本"
        : result === "failed"
          ? UPDATE_CHECK_FAILED_TEXT
          : "查看线上是否有新版本";

  return (
    <div className="flex flex-col gap-4 h-full">
      <p className="card-section-label m-0 mx-2">更新日志</p>

      <div className="g-card">
        <div className="flex items-start gap-3">
          <FileText size={20} className="shrink-0 mt-0.5 text-[var(--c-icon-active)]" />
          <div className="flex flex-col gap-2">
            <span className="menu-label font-semibold">FLOT 的每次更新都记在这里</span>
            <span className="menu-desc ts-13 leading-relaxed !mt-0">
              桌面、设置、聊天、书房和其他应用的新增、修复与调整，按类别写清楚改了什么、在哪里能看到。
              每个新版本第一次打开会弹一次更新公告，点「知道了」后不再重复弹。
            </span>
            <span className="menu-desc ts-12 !mt-0">
              当前版本 {current?.version} · {current?.date}
            </span>
          </div>
        </div>
      </div>

      <div className="g-card">
        <div className="flex items-center gap-3">
          <RefreshCw
            size={18}
            className={`shrink-0 text-[var(--c-icon-active)] ${checking ? "animate-spin" : ""}`}
          />
          <div className="flex flex-col gap-1 flex-1">
            <span className="menu-label font-semibold">检查更新</span>
            <span className="menu-desc ts-12 !mt-0">{statusText}</span>
          </div>
          {result === "available" ? (
            <button type="button" className="ui-btn ui-btn-primary shrink-0" onClick={() => window.location.reload()}>
              刷新
            </button>
          ) : (
            <button
              type="button"
              className="ui-btn ui-btn-primary shrink-0"
              onClick={() => void runCheck()}
              disabled={checking}
              aria-busy={checking}
            >
              {checking ? "检查中" : result === "failed" ? "重试" : "检查更新"}
            </button>
          )}
        </div>
      </div>

      <UpdateLogView releases={releases} currentReleaseId={releases[0]?.releaseId ?? SYSTEM_RELEASE_LIST[0]?.releaseId} seen={seen} />
    </div>
  );
}
