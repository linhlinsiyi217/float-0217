"use client";

import { FileText } from "lucide-react";

import { UpdateLogView } from "@/components/update-log/update-log-view";
import { SYSTEM_RELEASE_LIST, seenSystemReleases } from "@/lib/update-log/system";

/**
 * 设置 → 更新日志：全项目统一的更新日志入口，和全局更新弹窗读同一份数据。
 * 按应用/模块分类；同批上线的书房条目原样并入，书房自己的日志页仍保留。
 */
export function UpdateLogPage() {
  const seen = seenSystemReleases();
  const current = SYSTEM_RELEASE_LIST[0];
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT;
  return (
    <div className="flex flex-col gap-4 h-full">
      <p className="card-section-label m-0 mx-2">更新日志</p>

      <div className="g-card">
        <div className="flex items-start gap-3">
          <FileText size={20} className="shrink-0 mt-0.5 text-[var(--c-icon-active)]" />
          <div className="flex flex-col gap-2">
            <span className="menu-label font-semibold">整个小手机的更新都记在这里</span>
            <span className="menu-desc ts-13 leading-relaxed !mt-0">
              桌面、设置、聊天、书房和其他应用的修复、新增与调整，按应用分类写清楚；
              书房的更新也同步在这里（书房里的日志页内容相同）。每次发布第一次打开会弹一次通知，
              点「知道了」后同一次发布不再重复弹。
            </span>
            <span className="menu-desc ts-12 !mt-0">
              当前版本 {current?.version} · 发布标识 {current?.releaseId}
              {commit ? ` · 构建 ${commit.slice(0, 7)}` : ""}
            </span>
          </div>
        </div>
      </div>

      <UpdateLogView releases={SYSTEM_RELEASE_LIST} currentReleaseId={SYSTEM_RELEASE_LIST[0]?.releaseId} seen={seen} />
    </div>
  );
}
