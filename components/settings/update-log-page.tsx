"use client";

import { FileText } from "lucide-react";

import { UpdateLogView } from "@/components/update-log/update-log-view";
import { SYSTEM_RELEASE_LIST, seenSystemReleases } from "@/lib/update-log/system";

/**
 * 设置 → 更新日志：小手机整体项目的版本记录。
 * 只写系统级的变化；应用内部的大量改动在这里只写概括，细节看该应用自己的更新日志（例如书房的）。
 */
export function UpdateLogPage() {
  const seen = seenSystemReleases();
  return (
    <div className="flex flex-col gap-4 h-full">
      <p className="card-section-label m-0 mx-2">更新日志</p>

      <div className="g-card">
        <div className="flex items-start gap-3">
          <FileText size={20} className="shrink-0 mt-0.5 text-[var(--c-icon-active)]" />
          <div className="flex flex-col gap-2">
            <span className="menu-label font-semibold">这里记录小手机整体项目的变化</span>
            <span className="menu-desc ts-13 leading-relaxed !mt-0">
              桌面、状态栏、聊天、设置、角色卷宗、控制中心，以及各应用之间的联动都记在这里；
              单个应用内部的大量改动只写一句概括（例如「更新应用：书房」），细节在该应用自己的更新日志里。
              每个新版本第一次打开会弹一次便签说明，关掉后不再重复弹。
            </span>
          </div>
        </div>
      </div>

      <UpdateLogView releases={SYSTEM_RELEASE_LIST} currentReleaseId={SYSTEM_RELEASE_LIST[0]?.releaseId} seen={seen} />
    </div>
  );
}
