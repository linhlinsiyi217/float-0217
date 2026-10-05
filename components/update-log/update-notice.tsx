"use client";

import { useEffect, useState } from "react";

import { UpdateNotePopup } from "./update-note-popup";
import { hasSeenSystemRelease, latestSystemRelease, markSystemReleaseSeen } from "@/lib/update-log/system";
import { claimSlot, releaseSlot } from "@/lib/update-log/popup-slot";
import type { Release } from "@/lib/update-log/types";

const SLOT_OWNER = "system";

/**
 * 小手机整体项目的更新弹窗：每个新版本第一次打开弹一次。
 * 关掉或点确认才算已读（同一 releaseId 不再重复弹），可以跳到设置的更新日志页看全部。
 * 占用全局展示位，书房的更新卡会等这一个关掉之后才接上，不会两个一起弹。
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

  const dismiss = () => {
    markSystemReleaseSeen(release.releaseId);
    setRelease(null);
    releaseSlot(SLOT_OWNER);
  };

  return (
    <UpdateNotePopup
      appName="小手机系统"
      release={release}
      onClose={dismiss}
      onOpenLog={() => {
        dismiss();
        window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "settings", settingsPage: "about" } }));
      }}
    />
  );
}
