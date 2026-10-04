"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Library, Store, NotebookPen, User, Users, Shuffle } from "lucide-react";

import { hydrateReadingStorage } from "@/lib/reading-storage";
import { applyAppearance, loadAppearance } from "@/lib/study-room/appearance";
import { loadForum } from "@/lib/study-room/forum";
import { STUDYROOM_SEARCH_EVENT } from "@/lib/study-room/events";
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
import { StudyRoomReadingMemory } from "./study-room-reading-memory";
import { StudyRoomCreativeEditor } from "./study-room-creative-editor";
import { StudyRoomForum } from "./study-room-forum";
import { StudyRoomDock, type DockItem } from "./study-room-dock";
import { StudyRoomSplash, shouldSkipStudyRoomSplash } from "./study-room-splash";
import { StudyRoomUpdateLog } from "./study-room-update-log";
import { StudyRoomUpdateNotice } from "./study-room-update-notice";
import { StudyRoomDraw } from "./study-room-draw";
import { StudyRoomWishlist } from "./study-room-wishlist";
import { StudyRoomNpcPanel } from "./study-room-npc-panel";
import { StudyRoomGifts } from "./study-room-gifts";

type StudyRoomAppProps = {
  onClose: () => void;
};

type StudyRoomTab = "shelf" | "store" | "desk" | "forum" | "mine";

type StudyRoomView =
  | { kind: "tabs" }
  | { kind: "reader"; book: Book; chapterIndex?: number; paragraphIndex?: number }
  | { kind: "notes" }
  | { kind: "messages" }
  | { kind: "appearance" }
  | { kind: "backup" }
  | { kind: "readingMemory" }
  | { kind: "creative"; draftId: string }
  | { kind: "npcPanel" }
  | { kind: "gifts" }
  | { kind: "updateLog" }
  | { kind: "draw" }
  | { kind: "wishlist" };

const TAB_META: Record<StudyRoomTab, { label: string; icon: typeof Library; subtitle: string }> = {
  shelf: { label: "书架", icon: Library, subtitle: "已收藏的书" },
  store: { label: "书城", icon: Store, subtitle: "搜索与发现" },
  desk: { label: "书桌", icon: NotebookPen, subtitle: "摘录 · 批注 · 创作" },
  forum: { label: "书友圈", icon: Users, subtitle: "书友的讨论" },
  mine: { label: "我的", icon: User, subtitle: "书房与阅读" },
};

const TAB_ORDER: StudyRoomTab[] = ["shelf", "store", "desk", "forum", "mine"];

export default function StudyRoomApp({ onClose }: StudyRoomAppProps) {
  const [ready, setReady] = useState(false);
  // 冷启动播放一次启动画面；书房内部切页不重播（见 study-room-splash）
  const [splashDone, setSplashDone] = useState(() => shouldSkipStudyRoomSplash());
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

  // 阅读时选词点「搜索」：跳到书城并把关键词带过去
  const [storeQuery, setStoreQuery] = useState<string | null>(null);
  useEffect(() => {
    const onSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      const value = detail?.query?.trim();
      if (!value) return;
      setView({ kind: "tabs" });
      setTab("store");
      setStoreQuery(value);
    };
    window.addEventListener(STUDYROOM_SEARCH_EVENT, onSearch);
    return () => window.removeEventListener(STUDYROOM_SEARCH_EVENT, onSearch);
  }, []);

  // 论坛名可以在书友管理里改，这里跟着刷新
  const [forumName, setForumName] = useState<string>(() => loadForum().name);
  useEffect(() => {
    setForumName(loadForum().name);
  }, [tab, view]);

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

  // 启动画面：只占一屏，结束后再进入书房（此时才加载书架）
  if (!splashDone) {
    return (
      <section className="sr-app sr-app--splash">
        <StudyRoomSplash onDone={() => setSplashDone(true)} />
      </section>
    );
  }

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

  if (view.kind === "creative") {
    return (
      <StudyRoomCreativeEditor
        draftId={view.draftId}
        onBack={() => setView({ kind: "tabs" })}
        onOpenBook={(book) => {
          lastOpenedBookRef.current = book.id;
          setView({ kind: "reader", book });
        }}
      />
    );
  }

  if (view.kind === "npcPanel") {
    return <StudyRoomNpcPanel onBack={() => setView({ kind: "tabs" })} />;
  }

  if (view.kind === "gifts") {
    return <StudyRoomGifts onBack={() => setView({ kind: "tabs" })} />;
  }

  if (view.kind === "updateLog") {
    return <StudyRoomUpdateLog onBack={() => setView({ kind: "tabs" })} />;
  }

  if (view.kind === "wishlist") {
    return <StudyRoomWishlist onBack={() => setView({ kind: "tabs" })} />;
  }

  if (view.kind === "draw") {
    return (
      <StudyRoomDraw
        onBack={() => setView({ kind: "tabs" })}
        onRead={(book) => {
          lastOpenedBookRef.current = book.id;
          setView({ kind: "reader", book });
        }}
        onImported={() => undefined}
      />
    );
  }

  if (view.kind === "readingMemory") {
    return (
      <StudyRoomReadingMemory
        onBack={() => setView({ kind: "tabs" })}
        onOpenBook={(book, chapterIndex) => setView({ kind: "reader", book, chapterIndex })}
      />
    );
  }

  const active = TAB_META[tab];
  // Dock 六个入口：书架 / 书城 / 抽一本 / 书桌 / 书友圈 / 我的
  const dockItems: DockItem[] = TAB_ORDER.flatMap((key) => {
    const item: DockItem = {
      key,
      label: key === "forum" ? forumName : TAB_META[key].label,
      icon: TAB_META[key].icon,
    };
    // 「抽一本」是独立的一次抽取流程（整屏，有自己的返回），放在书城之后
    return key === "store" ? [item, { key: "draw", label: "抽一本", icon: Shuffle }] : [item];
  });

  return (
    <section className="sr-app">
      <header className="sr-header">
        <div className="sr-header-safe" />
        <div className="sr-header-row">
          <button type="button" className="sr-icon-btn" onClick={onClose} aria-label="返回桌面">
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <div>
            {/* 标题就是当前页面的名字；「书房」只留给书架首页（应用根级页面） */}
            <div className="sr-header-title">{tab === "shelf" ? "书房" : tab === "forum" ? forumName : active.label}</div>
            <span className="sr-header-sub">{active.subtitle}</span>
          </div>
          <span style={{ width: 40 }} />
        </div>
      </header>

      <div className="sr-body" key={tab}>
        <div className="sr-tab-pane sr-tab-pane--dock">
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
            <StudyRoomStore
              initialQuery={storeQuery ?? undefined}
              onRead={(book) => {
                lastOpenedBookRef.current = book.id;
                setView({ kind: "reader", book });
              }}
            />
          ) : tab === "forum" ? (
            <StudyRoomForum
              onOpenNpcPanel={() => setView({ kind: "npcPanel" })}
              onOpenMine={() => {
                setView({ kind: "tabs" });
                setTab("mine");
              }}
              onOpenBook={(book) => {
                lastOpenedBookRef.current = book.id;
                setView({ kind: "reader", book });
              }}
            />
          ) : tab === "desk" ? (
            <StudyRoomDesk
              onOpenDraft={(draftId) => setView({ kind: "creative", draftId })}
              onOpenNotes={() => setView({ kind: "notes" })}
              onOpenWishlist={() => setView({ kind: "wishlist" })}
            />
          ) : (
            <StudyRoomMine
              onOpenNotes={() => setView({ kind: "notes" })}
              onOpenMessages={() => setView({ kind: "messages" })}
              onOpenAppearance={() => setView({ kind: "appearance" })}
              onOpenBackup={() => setView({ kind: "backup" })}
              onOpenReadingMemory={() => setView({ kind: "readingMemory" })}
              onOpenGifts={() => setView({ kind: "gifts" })}
              onOpenUpdateLog={() => setView({ kind: "updateLog" })}
              onOpenWishlist={() => setView({ kind: "wishlist" })}
              onOpenDraft={(draftId) => setView({ kind: "creative", draftId })}
            />
          )}
        </div>
      </div>

      <StudyRoomDock
        items={dockItems}
        active={tab}
        onSelect={(key) => {
          if (key === "draw") {
            setView({ kind: "draw" });
            return;
          }
          setTab(key as StudyRoomTab);
        }}
      />

      {/* 书房自己的更新便签：启动画面结束后才出现，只跟书房版本有关 */}
      <StudyRoomUpdateNotice enabled={splashDone} onOpenLog={() => setView({ kind: "updateLog" })} />
    </section>
  );
}
