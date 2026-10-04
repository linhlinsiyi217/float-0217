"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  BookOpenText,
  ChevronRight,
  Database,
  Gift,
  Heart,
  Library,
  MessagesSquare,
  Palette,
  PenLine,
  ScrollText,
  Settings2,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";

import { loadBooks, loadAllNotes, loadAllBookmarks, loadAllAnnotations } from "@/lib/reading-storage";
import { loadCharacters } from "@/lib/character-storage";
import { loadUserIdentities } from "@/lib/settings-storage";
import { avatarDataUrl, nextVariant } from "@/lib/study-room/npc-avatar";
import { loadForum } from "@/lib/study-room/forum";
import { displayName, loadProfile, saveProfile, type UserProfile } from "@/lib/study-room/profile";
import { loadWishlist } from "@/lib/study-room/wishlist";
import { loadDrafts, draftWordCount } from "@/lib/study-room/creative";

type StudyRoomMineProps = {
  onOpenNotes: () => void;
  onOpenMessages: () => void;
  onOpenAppearance: () => void;
  onOpenBackup: () => void;
  onOpenReadingMemory: () => void;
  onOpenGifts: () => void;
  onOpenUpdateLog: () => void;
  onOpenWishlist: () => void;
  /** 打开某个创作草稿 */
  onOpenDraft: (draftId: string) => void;
};

type Tab = "posts" | "reviews" | "saved" | "works";

const TAB_LABEL: Record<Tab, string> = {
  posts: "动态",
  reviews: "书评",
  saved: "收藏",
  works: "作品",
};

/**
 * 我的：真正的个人主页（头像/名称/ID/签名/标签/关注粉丝获赞 + 内容页签），
 * 工具入口收进「书房设置」二级页，不在首屏堆一排按钮。
 */
export function StudyRoomMine({
  onOpenNotes,
  onOpenMessages,
  onOpenAppearance,
  onOpenBackup,
  onOpenReadingMemory,
  onOpenGifts,
  onOpenUpdateLog,
  onOpenWishlist,
  onOpenDraft,
}: StudyRoomMineProps) {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [tab, setTab] = useState<Tab>("posts");
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draftProfile, setDraftProfile] = useState<UserProfile>(profile);
  const [stats, setStats] = useState({
    books: 0,
    notes: 0,
    bookmarks: 0,
    annotations: 0,
    wish: 0,
  });

  const forum = useMemo(() => loadForum(), []);
  const drafts = useMemo(() => loadDrafts(), []);
  const hostName = useMemo(() => loadUserIdentities()[0]?.name ?? null, []);
  const identityAvatar = useMemo(() => loadUserIdentities()[0]?.avatarUrl ?? null, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [notes, bookmarks, annotations] = await Promise.all([
        loadAllNotes().catch(() => []),
        loadAllBookmarks().catch(() => []),
        loadAllAnnotations().catch(() => []),
      ]);
      if (cancelled) return;
      setStats({
        books: loadBooks().length,
        notes: notes.length,
        bookmarks: bookmarks.length,
        annotations: annotations.length,
        wish: loadWishlist().length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const myPosts = forum.posts.filter((post) => post.authorId === "user");
  const myReviews = myPosts.filter((post) => post.kind === "review");
  const myLikes = myPosts.reduce((total, post) => total + post.likedBy.length, 0);
  const mySaves = forum.posts.filter((post) => (post.collectedBy ?? []).includes("user"));
  const followers = forum.npcs.filter((npc) => (npc.followers ?? []).includes("user")).length;
  const following = forum.following.length;
  const publishedWorks = drafts.filter((draft) => draft.publishedBookId);

  const avatarSrc = profile.useHostAvatar && identityAvatar ? identityAvatar : avatarDataUrl(profile.avatar);
  const name = displayName(profile, hostName);

  const openEdit = () => {
    setDraftProfile(profile);
    setEditing(true);
  };

  const saveEdit = () => {
    const next = { ...draftProfile, name: draftProfile.name.trim().slice(0, 20) };
    saveProfile(next);
    setProfile(next);
    setEditing(false);
  };

  const renderEmpty = (text: string) => (
    <div className="sr-empty" style={{ paddingTop: 22 }}>
      <Sparkles size={30} strokeWidth={1} />
      <p>{text}</p>
    </div>
  );

  return (
    <div>
      {/* 个人主页 */}
      <div className="sr-profile-card">
        <div className="sr-profile-head">
          <span className="sr-profile-avatar" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarSrc} alt="" />
          </span>
          <div className="sr-profile-main">
            <h2 className="sr-profile-name">{name}</h2>
            <div className="sr-note-meta">ID：{profile.id}</div>
            {profile.signature && <div className="sr-profile-bio">{profile.signature}</div>}
            {profile.tags.length > 0 && (
              <div className="sr-chip-row" style={{ marginTop: 4 }}>
                {profile.tags.map((tag) => (
                  <span key={tag} className="sr-note-tag">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="sr-chip" onClick={openEdit}>
            <PenLine size={13} strokeWidth={1.8} /> 编辑
          </button>
        </div>

        <div className="sr-profile-stats">
          <span><strong>{following}</strong>关注</span>
          <span><strong>{followers}</strong>粉丝</span>
          <span><strong>{myPosts.length}</strong>动态</span>
          <span><strong>{myLikes}</strong>获赞</span>
        </div>
        <div className="sr-profile-stats sr-profile-stats--muted">
          <span>书架 {stats.books}</span>
          <span>笔记 {stats.notes}</span>
          <span>书签 {stats.bookmarks}</span>
          <span>角色批注 {stats.annotations}</span>
          <span>想读 {stats.wish}</span>
        </div>
      </div>

      {/* 内容页签 */}
      <div className="sr-chip-row" style={{ marginTop: 10 }}>
        {(Object.keys(TAB_LABEL) as Tab[]).map((key) => (
          <button key={key} type="button" className="sr-chip" data-active={tab === key ? "true" : undefined} onClick={() => setTab(key)}>
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {tab === "posts" &&
        (myPosts.length === 0 ? renderEmpty("还没有发过动态。到书友圈写一条，书友会来聊。") : (
          myPosts.map((post) => (
            <div key={post.id} className="sr-note-card">
              <div className="sr-note-meta">{new Date(post.createdAt).toLocaleString("zh-CN")}</div>
              <p className="sr-note-thought">{post.title || post.body.slice(0, 60)}</p>
              <div className="sr-note-meta">获赞 {post.likedBy.length} · 评论 {post.comments.length}</div>
            </div>
          ))
        ))}

      {tab === "reviews" &&
        (myReviews.length === 0 ? renderEmpty("还没有写过书评。读完一本可以去书友圈写一条。") : (
          myReviews.map((post) => (
            <div key={post.id} className="sr-note-card">
              <div className="sr-note-meta">{post.bookTitle ? `《${post.bookTitle}》` : "书评"}</div>
              <p className="sr-note-thought">{post.title || post.body.slice(0, 60)}</p>
            </div>
          ))
        ))}

      {tab === "saved" &&
        (mySaves.length === 0 && stats.wish === 0 ? renderEmpty("还没有收藏。可以收藏帖子，或在书城把暂时读不到的书记进「想读」。") : (
          <>
            {mySaves.map((post) => (
              <div key={post.id} className="sr-note-card" data-source="character">
                <div className="sr-note-meta">{post.authorName} 的帖子</div>
                <p className="sr-note-thought">{post.title || post.body.slice(0, 60)}</p>
              </div>
            ))}
            {stats.wish > 0 && (
              <button type="button" className="sr-btn" style={{ width: "100%", justifyContent: "space-between" }} onClick={onOpenWishlist}>
                <span>想读的书（{stats.wish}）</span>
                <ChevronRight size={16} strokeWidth={1.7} color="var(--c-icon)" />
              </button>
            )}
          </>
        ))}

      {tab === "works" &&
        (drafts.length === 0 ? renderEmpty("还没有作品。书桌里可以开始创作。") : (
          drafts.map((draft) => (
            <button key={draft.id} type="button" className="sr-btn" style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }} onClick={() => onOpenDraft(draft.id)}>
              <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span>{draft.title.trim() || "未命名作品"}</span>
                <span className="sr-note-meta">
                  {draft.chapters.length} 章 · {draftWordCount(draft)} 字{draft.publishedBookId ? " · 已发布" : " · 草稿"}
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.7} color="var(--c-icon)" />
            </button>
          ))
        ))}

      {/* 书房设置（二级页，工具入口不堆在首屏） */}
      <button
        type="button"
        className="sr-btn"
        style={{ width: "100%", marginTop: 14, justifyContent: "space-between" }}
        onClick={() => setShowSettings(true)}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Settings2 size={18} strokeWidth={1.6} />
          书房设置
        </span>
        <ChevronRight size={18} strokeWidth={1.6} color="var(--c-icon)" />
      </button>

      {showSettings && (
        <div className="sr-sheet-mask" onClick={() => setShowSettings(false)}>
          <div className="sr-sheet sr-sheet--tall" onClick={(event) => event.stopPropagation()}>
            <div className="sr-gift-head">
              <span className="sr-sheet-label" style={{ margin: 0 }}>书房设置</span>
              <button type="button" className="sr-icon-btn" onClick={() => setShowSettings(false)} aria-label="关闭">
                <X size={18} strokeWidth={1.7} />
              </button>
            </div>
            {(
              [
                { icon: <StickyNote size={17} strokeWidth={1.7} />, label: "笔记", onOpen: onOpenNotes },
                { icon: <MessagesSquare size={17} strokeWidth={1.7} />, label: "共读记录", onOpen: onOpenMessages },
                { icon: <Brain size={17} strokeWidth={1.7} />, label: "阅读记忆", onOpen: onOpenReadingMemory },
                { icon: <Heart size={17} strokeWidth={1.7} />, label: "想读的书", onOpen: onOpenWishlist },
                { icon: <Gift size={17} strokeWidth={1.7} />, label: "礼物与送书", onOpen: onOpenGifts },
                { icon: <Palette size={17} strokeWidth={1.7} />, label: "外观与自定义", onOpen: onOpenAppearance },
                { icon: <ScrollText size={17} strokeWidth={1.7} />, label: "书房更新日志", onOpen: onOpenUpdateLog },
                { icon: <Database size={17} strokeWidth={1.7} />, label: "数据与备份", onOpen: onOpenBackup },
              ] as const
            ).map((item) => (
              <button
                key={item.label}
                type="button"
                className="sr-drawer-row"
                onClick={() => {
                  setShowSettings(false);
                  item.onOpen();
                }}
              >
                {item.icon}
                <span className="sr-drawer-label">{item.label}</span>
                <ChevronRight size={15} strokeWidth={1.8} />
              </button>
            ))}
            <p className="sr-note-meta" style={{ marginTop: 8, lineHeight: 1.8 }}>
              角色卡、账号与全局设置仍在宿主的设置里；书房只放与阅读、创作、外观相关的入口。
            </p>
          </div>
        </div>
      )}

      {/* 资料编辑 */}
      {editing && (
        <div className="sr-sheet-mask" onClick={() => setEditing(false)}>
          <div className="sr-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sr-gift-head">
              <span className="sr-sheet-label" style={{ margin: 0 }}>编辑资料</span>
              <button type="button" className="sr-icon-btn" onClick={() => setEditing(false)} aria-label="关闭">
                <X size={18} strokeWidth={1.7} />
              </button>
            </div>
            <div className="sr-appear-row">
              <span className="sr-appear-label">昵称</span>
              <input
                className="sr-appear-input"
                value={draftProfile.name}
                onChange={(event) => setDraftProfile((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={hostName ? `跟随宿主：${hostName}` : "给自己起个名字"}
                aria-label="昵称"
              />
            </div>
            <div className="sr-appear-row">
              <span className="sr-appear-label">签名</span>
              <input
                className="sr-appear-input"
                value={draftProfile.signature}
                onChange={(event) => setDraftProfile((prev) => ({ ...prev, signature: event.target.value }))}
                placeholder="一句话介绍自己"
                aria-label="签名"
              />
            </div>
            <div className="sr-appear-row">
              <span className="sr-appear-label">标签</span>
              <input
                className="sr-appear-input"
                value={draftProfile.tags.join("、")}
                onChange={(event) =>
                  setDraftProfile((prev) => ({ ...prev, tags: event.target.value.split(/[、,，\s]+/).filter(Boolean).slice(0, 6) }))
                }
                placeholder="用顿号分隔，例如 悬疑、历史"
                aria-label="标签"
              />
            </div>
            <div className="sr-appear-row">
              <span className="sr-appear-label">头像</span>
              <span className="sr-forum-avatar" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draftProfile.useHostAvatar && identityAvatar ? identityAvatar : avatarDataUrl(draftProfile.avatar)} alt="" />
              </span>
              <button
                type="button"
                className="sr-chip"
                onClick={() => setDraftProfile((prev) => ({ ...prev, avatar: nextVariant(prev.avatar), useHostAvatar: false }))}
              >
                换一个
              </button>
              {identityAvatar && (
                <button
                  type="button"
                  className="sr-chip"
                  data-active={draftProfile.useHostAvatar ? "true" : undefined}
                  onClick={() => setDraftProfile((prev) => ({ ...prev, useHostAvatar: true }))}
                >
                  用宿主头像
                </button>
              )}
            </div>
            <div className="sr-sheet-actions">
              <button type="button" className="sr-btn" onClick={() => setEditing(false)}>
                取消
              </button>
              <button type="button" className="sr-btn sr-btn-primary" onClick={saveEdit}>
                保存
              </button>
            </div>
            <p className="sr-note-meta" style={{ marginTop: 6, lineHeight: 1.7 }}>
              这些只存在书房本地；宿主账号里的身份与头像不受影响。当前书架 {stats.books} 本、角色 {loadCharacters().length} 位。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
