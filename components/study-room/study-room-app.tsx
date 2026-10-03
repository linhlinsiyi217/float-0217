"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Library, Store, NotebookPen, User } from "lucide-react";

import { hydrateReadingStorage } from "@/lib/reading-storage";
import { applyAppearance, loadAppearance } from "@/lib/study-room/appearance";
import type { Book } from "@/lib/reading-types";
import { StudyRoomShelf } from "./study-room-shelf";
import { StudyRoomStore } from "./study-room-store";
import { StudyRoomDesk } from "./study-room-desk";
import { StudyRoomMine } from "./study-room-mine";
import { StudyRoomNotes } from "./study-room-notes";
import { StudyRoomReader } from "./study-room-reader";
import { StudyRoomMessages } from "./study-room-messages";
import { StudyRoomAppearance } from "./study-room-appearance";
import { StudyRoomBackup } from "./study-room-backup";

type StudyRoomAppProps = {
  onClose: () => void;
};

type StudyRoomTab = "shelf" | "store" | "desk" | "mine";

type StudyRoomView =
  | { kind: "tabs" }
  | { kind: "reader"; book: Book; chapterIndex?: number; paragraphIndex?: number }
  | { kind: "notes" }
  | { kind: "messages" }
  | { kind: "appearance" }
  | { kind: "backup" };

const TAB_META: Record<StudyRoomTab, { label: string; icon: typeof Library; subtitle: string }> = {
  shelf: { label: "书架", icon: Library, subtitle: "已收藏的书" },
  store: { label: "书城", icon: Store, subtitle: "搜索与发现" },
  desk: { label: "书桌", icon: NotebookPen, subtitle: "摘录 · 批注 · 共读" },
  mine: { label: "我的", icon: User, subtitle: "书房与阅读" },
};

const TAB_ORDER: StudyRoomTab[] = ["shelf", "store", "desk", "mine"];

export default function StudyRoomApp({ onClose }: StudyRoomAppProps) {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<StudyRoomTab>("shelf");
  const [view, setView] = useState<StudyRoomView>({ kind: "tabs" });
  // 从阅读器返回时，让那本书先以「抽出」状态出现再放回架上
  const lastOpenedBookRef = useRef<string | null>(null);
  const [returnFromBookId, setReturnFromBookId] = useState<string | null>(null);

  useEffect(() => {
    applyAppearance(loadAppearance());
  }, []);

  useEffect(() => {
    if (!returnFromBookId) return;
    const timer = window.setTimeout(() => setReturnFromBookId(null), 1400);
    return () => window.clearTimeout(timer);
  }, [returnFromBookId]);

  useEffect(() => {
    let cancelled = false;
    hydrateReadingStorage()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (view.kind === "reader") {
    return (
      <StudyRoomReader
        book={view.book}
        initialChapterIndex={view.chapterIndex}
        initialParagraphIndex={view.paragraphIndex}
        onBack={() => {
          setReturnFromBookId(lastOpenedBookRef.current);
          setView({ kind: "tabs" });
        }}
      />
    );
  }

  if (view.kind === "notes") {
    return (
      <StudyRoomNotes
        onBack={() => setView({ kind: "tabs" })}
        onOpenSource={(book, chapterIndex, paragraphIndex) => {
          setView({ kind: "reader", book, chapterIndex, paragraphIndex });
        }}
      />
    );
  }

  if (view.kind === "messages") {
    return <StudyRoomMessages onBack={() => setView({ kind: "tabs" })} />;
  }

  if (view.kind === "appearance") {
    return <StudyRoomAppearance onBack={() => setView({ kind: "tabs" })} />;
  }

  if (view.kind === "backup") {
    return <StudyRoomBackup onBack={() => setView({ kind: "tabs" })} />;
  }

  const active = TAB_META[tab];

  return (
    <section className="sr-app">
      <header className="sr-header">
        <div className="sr-header-safe" />
        <div className="sr-header-row">
          <button type="button" className="sr-icon-btn" onClick={onClose} aria-label="返回桌面">
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <div>
            <div className="sr-header-title">书房</div>
            <span className="sr-header-sub">{active.subtitle}</span>
          </div>
          <span style={{ width: 40 }} />
        </div>
      </header>

      <div className="sr-body" key={tab}>
        <div className="sr-tab-pane">
          {!ready ? (
            <div className="sr-empty">
              <p>正在打开书房…</p>
            </div>
          ) : tab === "shelf" ? (
            <StudyRoomShelf
              returnFromBookId={returnFromBookId}
              onOpenBook={(book, chapterIndex, paragraphIndex) => {
                lastOpenedBookRef.current = book.id;
                setView({ kind: "reader", book, chapterIndex, paragraphIndex });
              }}
              onOpenMessages={() => setView({ kind: "messages" })}
            />
          ) : tab === "store" ? (
            <StudyRoomStore />
          ) : tab === "desk" ? (
            <StudyRoomDesk />
          ) : (
            <StudyRoomMine
              onOpenNotes={() => setView({ kind: "notes" })}
              onOpenMessages={() => setView({ kind: "messages" })}
              onOpenAppearance={() => setView({ kind: "appearance" })}
              onOpenBackup={() => setView({ kind: "backup" })}
            />
          )}
        </div>
      </div>

      <nav className="sr-tabbar" aria-label="书房导航">
        {TAB_ORDER.map((key) => {
          const meta = TAB_META[key];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              type="button"
              className="sr-tab"
              data-active={tab === key ? "true" : undefined}
              onClick={() => setTab(key)}
              aria-label={meta.label}
              aria-current={tab === key ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={tab === key ? 2 : 1.6} />
              <span className="sr-tab-label">{meta.label}</span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
