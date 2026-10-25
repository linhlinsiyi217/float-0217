"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";

import { UpdateLogView } from "@/components/update-log/update-log-view";
import { SYSTEM_RELEASE_LIST, seenSystemReleases } from "@/lib/update-log/system";
import {
  acknowledgeRemoteRelease,
  checkForUpdate,
  type RemoteManifest,
  type UpdateCheckState,
} from "@/lib/update-log/update-service";

const STATE_TEXT: Record<Exclude<UpdateCheckState, "available">, string> = {
  latest: "已是最新版本",
  offline: "当前离线，恢复网络后重试",
  timeout: "检查超时，请重试",
  error: "版本清单不可用或格式异常，请稍后重试",
};

/**
 * 设置 → 更新日志：全项目统一的更新日志入口，和全局更新弹窗读同一份数据。
 * 按应用/模块分类；同批上线的书房条目原样并入，书房自己的日志页仍保留。
 * 顶部提供手动「检查更新」：与公告弹窗共用同一套拉取与比较逻辑，状态互相独立。
 */
export function UpdateLogPage() {
  const seen = seenSystemReleases();
  const current = SYSTEM_RELEASE_LIST[0];
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT;
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckState | null>(null);
  const [message, setMessage] = useState("");
  const [remote, setRemote] = useState<RemoteManifest | null>(null);
  // 页面被切走（卸载）后不再 setState；请求本身由 checkForUpdate 共享，不会被重复发起
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const runCheck = async () => {
    if (checking) return;
    setChecking(true);
    setResult(null);
    setMessage("");
    // 手动检查强制拉一次，跳过 30s 结果复用；请求仍受单例约束，不会重复发起
    const outcome = await checkForUpdate({ force: true });
    if (!mountedRef.current) return;
    setChecking(false);
    setResult(outcome.state);
    if (outcome.state === "available") {
      setRemote(outcome.manifest);
      setMessage("");
    } else if (outcome.state === "latest") {
      setRemote(outcome.manifest);
      // 手动确认「已是最新」的同时对齐远程 releaseId，避免同样的版本反复提示
      acknowledgeRemoteRelease(outcome.manifest.releaseId);
      setMessage(STATE_TEXT.latest);
    } else if (outcome.state === "timeout") {
      // 超时/取消属于正常收尾：只提示稍后重试，不写「网络不可达」
      setRemote(null);
      setMessage(STATE_TEXT.timeout);
    } else {
      setRemote(null);
      setMessage(outcome.message);
    }
  };

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

      <div className="g-card">
        <div className="flex items-center gap-3">
          <RefreshCw
            size={18}
            className={`shrink-0 text-[var(--c-icon-active)] ${checking ? "animate-spin" : ""}`}
          />
          <div className="flex flex-col gap-1 flex-1">
            <span className="menu-label font-semibold">检查更新</span>
            <span className="menu-desc ts-12 !mt-0">
              {checking
                ? "正在检查更新…"
                : result === "available" && remote
                  ? `发现新版本 ${remote.versionName || remote.webVersion}（${remote.releaseId}）· 重开应用或刷新网页即可加载`
                  : result
                    ? message || STATE_TEXT[result as Exclude<UpdateCheckState, "available">]
                    : "手动拉取线上版本清单，与当前部署比对；与更新公告弹窗相互独立"}
            </span>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-primary shrink-0"
            onClick={() => void runCheck()}
            disabled={checking}
          >
            {checking ? "检查中" : result === "timeout" || result === "error" || result === "offline" ? "重试" : "检查更新"}
          </button>
        </div>
      </div>

      <UpdateLogView releases={SYSTEM_RELEASE_LIST} currentReleaseId={SYSTEM_RELEASE_LIST[0]?.releaseId} seen={seen} />
    </div>
  );
}
