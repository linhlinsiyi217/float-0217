"use client";

import { NotebookPen } from "lucide-react";

export function StudyRoomDesk() {
  return (
    <div>
      <div className="sr-section-label">书桌</div>
      <div className="sr-empty" style={{ paddingTop: 30 }}>
        <NotebookPen size={42} strokeWidth={1} />
        <p>
          书桌用来整理阅读相关的内容：
          <br />
          批注、书摘与共读记录会在这里汇总。
          <br />
          阅读时留下的内容会自动出现在这里。
        </p>
      </div>
    </div>
  );
}
