"use client";

import { useEffect, useState } from "react";

import { UpdateNotePopup } from "./update-note-popup";
import { hasSeenSystemRelease, latestSystemRelease, markSystemReleaseSeen } from "@/lib/update-log/system";
import type { Release } from "@/lib/update-log/types";

/**
 * 小手机整体项目的更新弹窗：每个新版本第一次打开弹一次便签。
 * 关掉或点确认才算已读（同一 releaseId 不再重复弹），可以跳到设置的更新日志页看全部。
 */
export function UpdateNotice() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    const latest = latestSystemRelease();
    if (hasSeenSystemRelease(latest.releaseId)) return;
    const timer = window.setTimeout(() => setRelease(latest), 700);
    return () => window.clearTimeout(timer);
  }, []);

  if (!release) return null;

  return (
    <UpdateNotePopup
      appName="LinH Pocket YI"
      release={release}
      onClose={() => {
        markSystemReleaseSeen(release.releaseId);
        setRelease(null);
      }}
      onOpenLog={() => {
        markSystemReleaseSeen(release.releaseId);
        setRelease(null);
        window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "settings", settingsPage: "about" } }));
      }}
    />
  );
}
