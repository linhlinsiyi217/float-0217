"use client";

import { useEffect, useState } from "react";

import { UpdateNotePopup } from "./update-note-popup";
import { markStudyRoomReleaseSeen } from "@/lib/update-log/studyroom";
import { hasSeenSystemRelease, latestSystemRelease, markSystemReleaseSeen } from "@/lib/update-log/system";
import { claimSlot, releaseSlot } from "@/lib/update-log/popup-slot";
import type { Release } from "@/lib/update-log/types";

const SLOT_OWNER = "system";

/**
 * 全局更新弹窗：整个小手机每次正式发布（新的 releaseId）第一次加载到时弹一次，
 * 内容和设置里的总日志是同一份数据（同批的书房条目也在里面）。
 *
 * 只有点「知道了」才记录已读；「查看完整日志」和 Esc 只是暂时收起，下次打开还会弹。
 * 确认时把同批的书房版本一起记为已读，进书房不会再弹一遍同样的内容。
 * 占用全局展示位，不和书房更新卡叠在一起。
 */
export function UpdateNotice() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    const latest = latestSystemRelease();
    if (hasSeenSystemRelease(latest.releaseId)) return;
    const timer = window.setTimeout(() => {
      if (!claimSlot(SLOT_OWNER)) return;
      setRelease(latest);
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => releaseSlot(SLOT_OWNER), []);

  if (!release) return null;

  const hide = () => {
    setRelease(null);
    releaseSlot(SLOT_OWNER);
  };

  const confirm = () => {
    markSystemReleaseSeen(release.releaseId);
    if (release.includes?.studyroom) markStudyRoomReleaseSeen(release.includes.studyroom);
    hide();
  };

  return (
    <UpdateNotePopup
      appName="小手机"
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
