"use client";

import { useEffect, useState } from "react";

import { UpdateNotePopup } from "./update-note-popup";
import { markStudyRoomReleaseSeen } from "@/lib/update-log/studyroom";
import { hasSeenSystemRelease, latestSystemRelease, markSystemReleaseSeen } from "@/lib/update-log/system";
import {
  acknowledgeRemoteRelease,
  checkForUpdate,
  type RemoteManifest,
} from "@/lib/update-log/update-service";
import { claimSlot, releaseSlot } from "@/lib/update-log/popup-slot";
import type { Release, UpdateScope } from "@/lib/update-log/types";

const SLOT_OWNER = "system";

/** 本页面生命周期内是否已经跑过远程检查。
 *  模块级变量跨组件重建依然有效：页面切换、锁屏进入、重渲染都不会再触发第二次请求。 */
let remoteCheckStarted = false;

/** 把远程清单转成弹窗用的 Release 结构：条目来自 app-version.json 的 changes 数组 */
function manifestToRelease(manifest: RemoteManifest): Release {
  const scopeKeys: UpdateScope[] = ["app", "content", "global", "ai", "fix"];
  return {
    version: manifest.versionName || manifest.webVersion || "",
    releaseId: manifest.releaseId,
    date: manifest.releasedAt ? manifest.releasedAt.slice(0, 10) : "",
    name: "线上发布",
    summary: manifest.summary,
    entries: manifest.entries.map((item, index) => ({
      id: `remote-${manifest.releaseId}-${index}`,
      category: "feat",
      scope: scopeKeys.includes(item.type as UpdateScope) ? (item.type as UpdateScope) : "app",
      app: "系统发布",
      title: item.title,
      items: item.detail ? [item.detail] : [],
    })),
  };
}

/**
 * 全局更新弹窗：整个小手机每次正式发布（新的 releaseId）第一次加载到时弹一次，
 * 内容和设置里的总日志是同一份数据（同批的书房条目也在里面）。
 *
 * 两条触发路径，互不重复、共用同一个展示位：
 * 1. 内置日志（lib/update-log/system-data.ts，随部署打包）：有未读 releaseId 就弹；
 * 2. 远程清单（/app-version.json，带缓存绕过实时拉取）：远程 releaseId 与本地
 *    已确认的不同就弹——内置数据没换但部署内容变了时也能检测到新版本。
 *
 * 只有点「我知道了」才记录已读；「查看完整日志」和 Esc 只是暂时收起，下次打开还会弹。
 * 确认时把同批的书房版本一起记为已读，进书房不会再弹一遍同样的内容。
 */
export function UpdateNotice() {
  const [release, setRelease] = useState<Release | null>(null);
  /** 当前展示的是不是远程清单弹窗；确认时走远程 ack 而不是内置日志已读 */
  const [remoteAckId, setRemoteAckId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 远程检查：等内置弹窗（若在展示）关闭后跑，避免两个弹窗抢同一个展示位
    const runRemoteCheck = async () => {
      if (remoteCheckStarted) return;
      remoteCheckStarted = true;
      const result = await checkForUpdate();
      if (cancelled || result.state !== "available") return;
      // 远程 releaseId 与内置日志当前 releaseId 相同：内容就是用户刚确认过的那份，
      // 不再重复弹（内置确认已覆盖）。
      if (result.manifest.releaseId === latestSystemRelease().releaseId) {
        acknowledgeRemoteRelease(result.manifest.releaseId);
        return;
      }
      if (!claimSlot(SLOT_OWNER)) return;
      setRemoteAckId(result.manifest.releaseId);
      setRelease(manifestToRelease(result.manifest));
    };

    const latest = latestSystemRelease();
    if (hasSeenSystemRelease(latest.releaseId)) {
      // 内置日志已是最新：直接跑远程检查（浏览器刚打开时给首屏留 700ms）
      const timer = window.setTimeout(() => void runRemoteCheck(), 700);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
    const timer = window.setTimeout(() => {
      if (!claimSlot(SLOT_OWNER)) return;
      setRelease(latest);
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => () => releaseSlot(SLOT_OWNER), []);

  if (!release) return null;

  const hide = () => {
    setRelease(null);
    setRemoteAckId(null);
    releaseSlot(SLOT_OWNER);
  };

  const confirm = () => {
    if (remoteAckId) {
      // 远程清单弹窗：只确认远程 releaseId，不动内置日志的已读状态
      acknowledgeRemoteRelease(remoteAckId);
      hide();
      return;
    }
    markSystemReleaseSeen(release.releaseId);
    if (release.includes?.studyroom) markStudyRoomReleaseSeen(release.includes.studyroom);
    hide();
    // 内置弹窗确认完，静默对齐远程清单：同一次部署的公告已经展示过，
    // 把远程 releaseId 记为已确认，避免紧接着再弹第二个内容相同的公告。
    void checkForUpdate().then((result) => {
      if (result.state === "available") acknowledgeRemoteRelease(result.manifest.releaseId);
    });
  };

  return (
    <UpdateNotePopup
      appName={remoteAckId ? "线上发布" : "小手机"}
      release={release}
      onConfirm={confirm}
      onHide={hide}
      onOpenLog={() => {
        hide();
        window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "settings", settingsPage: "about" } }));
      }}
    />
  );
}
