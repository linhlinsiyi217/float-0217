"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  ChevronRight,
  Database,
  Gift,
  Heart,
  MessagesSquare,
  Palette,
  PenLine,
  ScrollText,
  Settings2,
  Share2,
  StickyNote,
  X,
} from "lucide-react";

import { loadBooks, loadAllNotes, loadAllBookmarks, loadAllAnnotations } from "@/lib/reading-storage";
import { loadUserIdentities } from "@/lib/settings-storage";
import { avatarDataUrl, nextVariant } from "@/lib/study-room/npc-avatar";
import { loadForum } from "@/lib/study-room/forum";
import { displayName, loadProfile, saveProfile, type UserProfile } from "@/lib/study-room/profile";
import { loadWishlist } from "@/lib/study-room/wishlist";
import { loadDrafts, draftWordCount } from "@/lib/study-room/creative";
import { PostStrip, ProfileStats, TwoColumnGrid } from "./study-room-profile-parts";

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
  /** 动态卡点开原帖（切到书友圈） */
  onOpenPost: (postId: string) => void;
};

const STATUS_PRESETS = ["在读", "想找人共读", "书荒中", "在写东西", "今天不想说话"];

/**
 * 我的主页：头像/昵称/ID/状态气泡/签名 + 真实统计 + 动态横滑、作品两列，
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
  onOpenPost,
}: StudyRoomMineProps) {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
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

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2200);
  };

  const openStatus = () => {
    setStatusDraft(profile.status);
    setStatusOpen(true);
  };

  const saveStatus = (value: string) => {
    const next = { ...profile, status: value.trim().slice(0, 30) };
    saveProfile(next);
    setProfile(next);
    setStatusOpen(false);
  };

  // 分享：系统分享面板优先，不支持就复制到剪贴板；只分享名片文字，不带任何本地数据
  const shareProfile = async () => {
    const text = [`${name}（ID：${profile.id}）`, profile.status.trim(), profile.signature.trim()].filter(Boolean).join("\n");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${name} 的书房主页`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      flash("主页名片已复制");
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      flash("这台设备暂时不能分享或复制");
    }
  };

  return (
    <div>
      {/* 个人主页：头像与昵称紧挨，ID、签名、常驻状态气泡 */}
      <div className="sr-pf-head">
        <span className="sr-pf-avatar" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarSrc} alt="" />
        </span>
        <div className="sr-pf-id">
          <h2 className="sr-pf-name">{name}</h2>
          <div className="sr-pf-sub">ID：{profile.id}</div>
        </div>
      </div>
      <button type="button" className="sr-pf-status sr-pf-status--edit" onClick={openStatus}>
        {profile.status.trim() || "＋ 设置状态"}
      </button>
      {profile.signature && <p className="sr-pf-sign">{profile.signature}</p>}
      {profile.tags.length > 0 && (
        <div className="sr-chip-row" style={{ marginTop: 6 }}>
          {profile.tags.map((tag) => (
            <span key={tag} className="sr-note-tag">{tag}</span>
          ))}
        </div>
      )}

      <ProfileStats
        items={[
          { label: "关注", value: following },
          { label: "粉丝", value: followers },
          { label: "动态", value: myPosts.length },
          { label: "获赞", value: myLikes },
        ]}
      />

      <div className="sr-pf-actions">
        <button type="button" className="sr-btn sr-btn-primary" onClick={openEdit}>
          <PenLine size={15} strokeWidth={1.8} />
          编辑资料
        </button>
        <button type="button" className="sr-btn" onClick={() => void shareProfile()}>
          <Share2 size={15} strokeWidth={1.8} />
          分享主页
        </button>
      </div>

      <div className="sr-pf-records">
        <span>书架 {stats.books}</span>
        <span>笔记 {stats.notes}</span>
        <span>书签 {stats.bookmarks}</span>
        <span>角色批注 {stats.annotations}</span>
        <span>想读 {stats.wish}</span>
      </div>

      <div className="sr-section-label">动态</div>
      <PostStrip posts={myPosts.filter((post) => post.kind !== "review")} emptyText="还没有发过动态。" onOpen={onOpenPost} />

      <div className="sr-section-label">书评</div>
      <PostStrip posts={myReviews} emptyText="还没有写过书评。" onOpen={onOpenPost} />

      <div className="sr-section-label">作品</div>
      <TwoColumnGrid
        items={drafts.map((draft) => ({
          key: draft.id,
          title: draft.title.trim() || "未命名作品",
          meta: `${draft.chapters.length} 章 · ${draftWordCount(draft)} 字 · ${draft.publishedBookId ? "已发布" : "草稿"}`,
          onOpen: () => onOpenDraft(draft.id),
        }))}
        emptyText="还没有作品。"
      />

      <div className="sr-section-label">收藏</div>
      <PostStrip posts={mySaves} emptyText="还没有收藏的帖子。" onOpen={onOpenPost} />
      {stats.wish > 0 && (
        <button type="button" className="sr-btn" style={{ width: "100%", justifyContent: "space-between", marginTop: 8 }} onClick={onOpenWishlist}>
          <span>想读的书（{stats.wish}）</span>
          <ChevronRight size={16} strokeWidth={1.7} color="var(--c-icon)" />
        </button>
      )}

      {statusOpen && (
        <div className="sr-sheet-mask" onClick={() => setStatusOpen(false)}>
          <div className="sr-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sr-gift-head">
              <span className="sr-sheet-label" style={{ margin: 0 }}>状态</span>
              <button type="button" className="sr-icon-btn" onClick={() => setStatusOpen(false)} aria-label="关闭">
                <X size={18} strokeWidth={1.7} />
              </button>
            </div>
            <input
              className="sr-appear-input"
              style={{ width: "100%" }}
              value={statusDraft}
              maxLength={30}
              onChange={(event) => setStatusDraft(event.target.value)}
              placeholder="例如：在读《简·爱》"
              aria-label="状态"
              autoFocus
            />
            <div className="sr-chip-row" style={{ marginTop: 10 }}>
              {STATUS_PRESETS.map((preset) => (
                <button key={preset} type="button" className="sr-chip" onClick={() => setStatusDraft(preset)}>
                  {preset}
                </button>
              ))}
            </div>
            <div className="sr-sheet-actions">
              <button type="button" className="sr-btn" onClick={() => saveStatus("")}>
                清除
              </button>
              <button type="button" className="sr-btn sr-btn-primary" onClick={() => saveStatus(statusDraft)}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="sr-toast">{notice}</div>}

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
                className="sr-btn sr-btn-sm"
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
          </div>
        </div>
      )}
    </div>
  );
}
