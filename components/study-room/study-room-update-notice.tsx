"use client";

import { useEffect, useState } from "react";

import { UpdateNotePopup } from "@/components/update-log/update-note-popup";
import {
  hasSeenStudyRoomRelease,
  latestStudyRoomRelease,
  markStudyRoomReleaseSeen,
} from "@/lib/update-log/studyroom";
import type { Release } from "@/lib/update-log/types";

type StudyRoomUpdateNoticeProps = {
  /** 启动画面结束后才显示（顺序：启动画面 → 进入书房 → 书房更新便签） */
  enabled: boolean;
  onOpenLog: () => void;
};

/** 书房自己的更新便签：只跟书房版本有关，系统更新不会触发它。 */
export function StudyRoomUpdateNotice({ enabled, onOpenLog }: StudyRoomUpdateNoticeProps) {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const latest = latestStudyRoomRelease();
    if (hasSeenStudyRoomRelease(latest.releaseId)) return;
    const timer = window.setTimeout(() => setRelease(latest), 500);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (!release) return null;

  return (
    <UpdateNotePopup
      appName="书房"
      release={release}
      onClose={() => {
        markStudyRoomReleaseSeen(release.releaseId);
        setRelease(null);
      }}
      onOpenLog={() => {
        markStudyRoomReleaseSeen(release.releaseId);
        setRelease(null);
        onOpenLog();
      }}
    />
  );
}
