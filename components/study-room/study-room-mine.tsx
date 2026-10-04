"use client";

import { useEffect, useState } from "react";
import { ChevronRight, StickyNote, BookOpenText, MessagesSquare, Palette, Database, Brain, Gift, ScrollText, Heart } from "lucide-react";

import { loadBooks } from "@/lib/reading-storage";

type StudyRoomMineProps = {
  onOpenNotes: () => void;
  onOpenMessages: () => void;
  onOpenAppearance: () => void;
  onOpenBackup: () => void;
  onOpenReadingMemory: () => void;
  onOpenGifts: () => void;
  onOpenUpdateLog: () => void;
  onOpenWishlist: () => void;
};

export function StudyRoomMine({
  onOpenNotes,
  onOpenMessages,
  onOpenAppearance,
  onOpenBackup,
  onOpenReadingMemory,
  onOpenGifts,
  onOpenUpdateLog,
  onOpenWishlist,
}: StudyRoomMineProps) {
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

      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginBottom: 12, justifyContent: "space-between" }}
        onClick={onOpenMessages}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <MessagesSquare size={18} strokeWidth={1.6} />
          共读记录
        </span>
        <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
      </button>

      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginBottom: 12, justifyContent: "space-between" }}
        onClick={onOpenAppearance}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Palette size={18} strokeWidth={1.6} />
          外观与自定义
        </span>
        <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
      </button>

      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginBottom: 12, justifyContent: "space-between" }}
        onClick={onOpenGifts}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Gift size={18} strokeWidth={1.6} />
          礼物与送书
        </span>
        <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
      </button>

      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginBottom: 12, justifyContent: "space-between" }}
        onClick={onOpenReadingMemory}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Brain size={18} strokeWidth={1.6} />
          阅读记忆
        </span>
        <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
      </button>

      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginBottom: 12, justifyContent: "space-between" }}
        onClick={onOpenWishlist}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Heart size={18} strokeWidth={1.6} />
          想读的书
        </span>
        <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
      </button>

      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginBottom: 12, justifyContent: "space-between" }}
        onClick={onOpenUpdateLog}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <ScrollText size={18} strokeWidth={1.6} />
          更新日志
        </span>
        <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
      </button>

      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginBottom: 12, justifyContent: "space-between" }}
        onClick={onOpenBackup}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Database size={18} strokeWidth={1.6} />
          数据与备份
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
