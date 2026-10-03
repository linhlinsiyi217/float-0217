"use client";

import { useEffect, useState } from "react";
import { ChevronRight, StickyNote, BookOpenText } from "lucide-react";

import { loadBooks } from "@/lib/reading-storage";

type StudyRoomMineProps = {
  onOpenNotes: () => void;
};

export function StudyRoomMine({ onOpenNotes }: StudyRoomMineProps) {
  const [bookCount, setBookCount] = useState(0);

  useEffect(() => {
    setBookCount(loadBooks().length);
  }, []);

  return (
    <div>
      <div className="sr-section-label">我的书房</div>

      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginBottom: 12, justifyContent: "space-between" }}
        onClick={onOpenNotes}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <StickyNote size={18} strokeWidth={1.6} />
          笔记
        </span>
        <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
      </button>

      <div className="sr-note-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BookOpenText size={20} strokeWidth={1.5} color="var(--c-icon)" />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>书架藏书</div>
          <div className="sr-note-meta">{bookCount} 本</div>
        </div>
      </div>

      <p className="sr-note-meta" style={{ marginTop: 16, textAlign: "center" }}>
        头像、简介与阅读统计会在后续阶段接入。
      </p>
    </div>
  );
}
