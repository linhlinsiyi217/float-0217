"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Copy,
  Database,
  Gift,
  Heart,
  ImageUp,
  MessagesSquare,
  Palette,
  PenLine,
  RefreshCw,
  ScrollText,
  Share2,
  StickyNote,
  X,
} from "lucide-react";

import { loadAllNotes } from "@/lib/reading-storage";
import { loadUserIdentities } from "@/lib/settings-storage";
import { avatarDataUrl, nextVariant } from "@/lib/study-room/npc-avatar";
import { loadForum } from "@/lib/study-room/forum";
import {
  STATUS_MAX,
  displayName,
  loadProfile,
  profileAvatarSrc,
  saveProfile,
  type UserProfile,
} from "@/lib/study-room/profile";
import { loadWishlist } from "@/lib/study-room/wishlist";
import { loadDrafts, draftWordCount } from "@/lib/study-room/creative";
import {
  EntryGrid,
  EntryList,
  PostStrip,
  ProfileEmpty,
  ProfileHero,
  ProfileTabs,
  TwoColumnGrid,
} from "./study-room-profile-parts";

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
  /** 去书友圈发第一条动态 */
  onCompose: () => void;
  /** 去书桌开始写作品 */
  onOpenDesk: () => void;
};

type ContentTab = "posts" | "works" | "reviews" | "saves";

const STATUS_PRESETS = ["在读", "想找人共读", "书荒中", "在写东西", "今天不想说话", "(｡･ω･｡)"];

/** 上传的头像压到 256×256 的 JPEG，居中裁成正方形，避免把大图塞进存储。 */
function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const size = 256;
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx || side === 0) throw new Error("no-canvas");
        ctx.drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size,
        );
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad-image"));
    };
    image.src = url;
  });
}

/**
 * 我的主页（社交主页结构）：
 * 头像气泡 → 头像 + 名字/ID/真实统计 → 签名与标签 → 编辑主页 / 分享
 * → 动态/作品（下划线分区，动态横滑）→ 常用入口（两列块）→ 设置（列表行）。
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
  onCompose,
  onOpenDesk,
}: StudyRoomMineProps) {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [draftProfile, setDraftProfile] = useState<UserProfile>(profile);
  const [uploading, setUploading] = useState(false);
  // 标签输入框保留原文（含刚打的顿号），保存时再拆分
  const [tagsText, setTagsText] = useState("");
  const [contentTab, setContentTab] = useState<ContentTab>("posts");
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const forum = useMemo(() => loadForum(), []);
  const drafts = useMemo(() => loadDrafts(), []);
  const wishCount = useMemo(() => loadWishlist().length, []);
  const hostName = useMemo(() => loadUserIdentities()[0]?.name ?? null, []);
  const identityAvatar = useMemo(() => loadUserIdentities()[0]?.avatarUrl ?? null, []);

  useEffect(() => {
    let cancelled = false;
    loadAllNotes()
      .then((notes) => {
        if (!cancelled) setNoteCount(notes.length);
      })
      .catch(() => {
        // 读不到就不显示数字，不填假数
      });
    return () => {
      cancelled = true;
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const myPosts = forum.posts
    .filter((post) => post.authorId === "user")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const myDynamics = myPosts.filter((post) => post.kind !== "review");
  const myReviews = myPosts.filter((post) => post.kind === "review");
  const myLikes = myPosts.reduce((total, post) => total + post.likedBy.length, 0);
  const mySaves = forum.posts.filter((post) => (post.collectedBy ?? []).includes("user"));
  const followers = forum.npcs.filter((npc) => (npc.followers ?? []).includes("user")).length;
  const following = forum.following.length;

  const avatarSrc = profileAvatarSrc(profile, identityAvatar, avatarDataUrl(profile.avatar));
  const draftAvatarSrc = profileAvatarSrc(draftProfile, identityAvatar, avatarDataUrl(draftProfile.avatar));
  const name = displayName(profile, hostName);

  const tabs: Array<{ key: ContentTab; label: string; count?: number }> = [
    { key: "posts", label: "动态", count: myDynamics.length },
    { key: "works", label: "作品", count: drafts.length },
  ];
  if (myReviews.length > 0) tabs.push({ key: "reviews", label: "书评", count: myReviews.length });
  if (mySaves.length > 0) tabs.push({ key: "saves", label: "收藏", count: mySaves.length });
  const currentTab = tabs.some((tab) => tab.key === contentTab) ? contentTab : "posts";

  const flash = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2200);
  };

  const persist = (next: UserProfile): boolean => {
    try {
      saveProfile(next);
      setProfile(next);
      return true;
    } catch {
      flash("没能保存，请稍后再试");
      return false;
    }
  };

  const openEdit = () => {
    setDraftProfile(profile);
    setTagsText(profile.tags.join("、"));
    setEditing(true);
  };

  const saveEdit = () => {
    const next: UserProfile = {
      ...draftProfile,
      name: draftProfile.name.trim().slice(0, 20),
      signature: draftProfile.signature.trim().slice(0, 200),
      status: draftProfile.status.trim().slice(0, STATUS_MAX),
      tags: tagsText.split(/[、,，\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
    };
    if (persist(next)) {
      setEditing(false);
      flash("主页已保存");
    }
  };

  const openStatus = () => {
    setStatusDraft(profile.status);
    setStatusOpen(true);
  };

  const saveStatus = (value: string) => {
    if (persist({ ...profile, status: value.trim().slice(0, STATUS_MAX) })) setStatusOpen(false);
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      flash("请选择一张图片");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await compressAvatar(file);
      setDraftProfile((prev) => ({ ...prev, avatarUrl: dataUrl }));
    } catch {
      flash("这张图片读不出来，换一张试试");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(profile.id);
      flash("ID 已复制");
    } catch {
      flash("这台设备暂时不能复制");
    }
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
      try {
        await navigator.clipboard.writeText(text);
        flash("主页名片已复制");
      } catch {
        flash("这台设备暂时不能分享或复制");
      }
    }
  };

  const iconProps = { size: 18, strokeWidth: 1.7 } as const;

  return (
    <div className="sr-pf-page">
      <ProfileHero
        avatarSrc={avatarSrc}
        name={name}
        idText={profile.id}
        stats={[
          { label: "动态", value: myPosts.length },
          { label: "关注", value: following },
          { label: "粉丝", value: followers },
          { label: "获赞", value: myLikes },
        ]}
        bubble={profile.status}
        onEditBubble={openStatus}
      />

      {(profile.signature.trim() || profile.tags.length > 0) && (
        <div className="sr-pf-intro">
          {profile.signature.trim() && <p className="sr-pf-sign">{profile.signature}</p>}
          {profile.tags.length > 0 && (
            <div className="sr-pf-tags">
              {profile.tags.map((tag) => (
                <span key={tag} className="sr-pf-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="sr-pf-actions">
        <button type="button" className="sr-btn sr-btn-primary" onClick={openEdit}>
          <PenLine size={16} strokeWidth={1.8} />
          编辑主页
        </button>
        <button type="button" className="sr-btn" onClick={() => void shareProfile()}>
          <Share2 size={16} strokeWidth={1.8} />
          分享
        </button>
      </div>

      <section className="sr-pf-section" aria-label="内容">
        <ProfileTabs tabs={tabs} active={currentTab} onChange={setContentTab} />
        <div className="sr-pf-tabpanel" role="tabpanel">
          {currentTab === "posts" && (
            <PostStrip
              posts={myDynamics}
              onOpen={onOpenPost}
              empty={<ProfileEmpty text="还没有发过动态" action={{ label: "发布第一条动态", onClick: onCompose }} />}
            />
          )}
          {currentTab === "works" && (
            <TwoColumnGrid
              items={drafts.map((draft) => ({
                key: draft.id,
                title: draft.title.trim() || "未命名作品",
                meta: `${draft.chapters.length} 章 · ${draftWordCount(draft)} 字 · ${draft.publishedBookId ? "已发布" : "草稿"}`,
                onOpen: () => onOpenDraft(draft.id),
              }))}
              empty={<ProfileEmpty text="还没有作品" action={{ label: "去书桌写一篇", onClick: onOpenDesk }} />}
            />
          )}
          {currentTab === "reviews" && <PostStrip posts={myReviews} onOpen={onOpenPost} empty={null} />}
          {currentTab === "saves" && <PostStrip posts={mySaves} onOpen={onOpenPost} empty={null} />}
        </div>
      </section>

      <section className="sr-pf-section" aria-labelledby="sr-pf-common">
        <h3 className="sr-pf-section-title" id="sr-pf-common">常用</h3>
        <EntryGrid
          items={[
            { key: "notes", label: "笔记", icon: <StickyNote {...iconProps} />, value: noteCount ?? undefined, onOpen: onOpenNotes },
            { key: "wish", label: "想读", icon: <Heart {...iconProps} />, value: wishCount, onOpen: onOpenWishlist },
            { key: "memory", label: "阅读记忆", icon: <Brain {...iconProps} />, onOpen: onOpenReadingMemory },
            { key: "messages", label: "共读记录", icon: <MessagesSquare {...iconProps} />, onOpen: onOpenMessages },
          ]}
        />
      </section>

      <section className="sr-pf-section" aria-labelledby="sr-pf-settings">
        <h3 className="sr-pf-section-title" id="sr-pf-settings">设置</h3>
        <EntryList
          items={[
            { key: "appearance", label: "外观", icon: <Palette {...iconProps} />, onOpen: onOpenAppearance },
            { key: "gifts", label: "礼物与送书", icon: <Gift {...iconProps} />, onOpen: onOpenGifts },
            { key: "backup", label: "数据与备份", icon: <Database {...iconProps} />, onOpen: onOpenBackup },
            { key: "log", label: "更新日志", icon: <ScrollText {...iconProps} />, onOpen: onOpenUpdateLog },
          ]}
        />
      </section>

      {/* 状态气泡：点气泡快速改 */}
      {statusOpen && (
        <div className="sr-sheet-mask" onClick={() => setStatusOpen(false)}>
          <div className="sr-sheet" role="dialog" aria-label="状态气泡" onClick={(event) => event.stopPropagation()}>
            <div className="sr-gift-head">
              <span className="sr-sheet-label" style={{ margin: 0 }}>状态气泡</span>
              <button type="button" className="sr-icon-btn" onClick={() => setStatusOpen(false)} aria-label="关闭">
                <X size={18} strokeWidth={1.7} />
              </button>
            </div>
            <textarea
              className="sr-appear-input sr-pf-textarea"
              rows={2}
              value={statusDraft}
              maxLength={STATUS_MAX}
              onChange={(event) => setStatusDraft(event.target.value)}
              placeholder="文字、颜文字或表情都可以"
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
              <button type="button" className="sr-btn" onClick={() => saveStatus("")} disabled={!profile.status}>
                清空
              </button>
              <button type="button" className="sr-btn sr-btn-primary" onClick={() => saveStatus(statusDraft)}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑主页 */}
      {editing && (
        <div className="sr-sheet-mask" onClick={() => setEditing(false)}>
          <div
            className="sr-sheet sr-sheet--tall sr-pf-edit"
            role="dialog"
            aria-label="编辑主页"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sr-gift-head">
              <span className="sr-sheet-label" style={{ margin: 0 }}>编辑主页</span>
              <button type="button" className="sr-icon-btn" onClick={() => setEditing(false)} aria-label="关闭">
                <X size={18} strokeWidth={1.7} />
              </button>
            </div>

            <div className="sr-pf-edit-avatar">
              <span className="sr-pf-avatar" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draftAvatarSrc} alt="" />
              </span>
              <div className="sr-pf-edit-avatar-tools">
                <button
                  type="button"
                  className="sr-btn sr-btn-sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-busy={uploading || undefined}
                >
                  <ImageUp size={15} strokeWidth={1.8} />
                  {uploading ? "处理中" : "上传照片"}
                </button>
                <button
                  type="button"
                  className="sr-btn sr-btn-sm"
                  onClick={() =>
                    setDraftProfile((prev) => ({ ...prev, avatar: nextVariant(prev.avatar), useHostAvatar: false, avatarUrl: undefined }))
                  }
                >
                  <RefreshCw size={15} strokeWidth={1.8} />
                  换一个
                </button>
                {identityAvatar && (
                  <button
                    type="button"
                    className="sr-chip"
                    data-active={draftProfile.useHostAvatar && !draftProfile.avatarUrl ? "true" : undefined}
                    onClick={() => setDraftProfile((prev) => ({ ...prev, useHostAvatar: true, avatarUrl: undefined }))}
                  >
                    用宿主头像
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void pickAvatar(event.target.files?.[0])}
              />
            </div>

            <label className="sr-pf-field">
              <span className="sr-pf-field-label">昵称</span>
              <input
                className="sr-appear-input"
                value={draftProfile.name}
                maxLength={20}
                onChange={(event) => setDraftProfile((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={hostName ? `跟随宿主：${hostName}` : "给自己起个名字"}
              />
            </label>

            <div className="sr-pf-field">
              <span className="sr-pf-field-label">ID</span>
              <div className="sr-pf-field-static">
                <span className="sr-pf-field-id">{profile.id}</span>
                <button type="button" className="sr-icon-btn" onClick={() => void copyId()} aria-label="复制 ID">
                  <Copy size={16} strokeWidth={1.8} />
                </button>
              </div>
              <span className="sr-pf-field-hint">系统生成，不能修改</span>
            </div>

            <label className="sr-pf-field">
              <span className="sr-pf-field-label">状态气泡</span>
              <div className="sr-pf-field-inline">
                <input
                  className="sr-appear-input"
                  value={draftProfile.status}
                  maxLength={STATUS_MAX}
                  onChange={(event) => setDraftProfile((prev) => ({ ...prev, status: event.target.value }))}
                  placeholder="文字、颜文字或表情"
                />
                {draftProfile.status && (
                  <button
                    type="button"
                    className="sr-icon-btn"
                    onClick={() => setDraftProfile((prev) => ({ ...prev, status: "" }))}
                    aria-label="清空状态气泡"
                  >
                    <X size={16} strokeWidth={1.8} />
                  </button>
                )}
              </div>
            </label>

            <label className="sr-pf-field">
              <span className="sr-pf-field-label">签名</span>
              <textarea
                className="sr-appear-input sr-pf-textarea"
                rows={3}
                maxLength={200}
                value={draftProfile.signature}
                onChange={(event) => setDraftProfile((prev) => ({ ...prev, signature: event.target.value }))}
                placeholder="介绍一下自己，可以换行"
              />
            </label>

            <label className="sr-pf-field">
              <span className="sr-pf-field-label">标签</span>
              <input
                className="sr-appear-input"
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="用顿号分隔，例如 悬疑、历史"
              />
            </label>

            <div className="sr-sheet-actions">
              <button type="button" className="sr-btn" onClick={() => setEditing(false)}>
                取消
              </button>
              <button type="button" className="sr-btn sr-btn-primary" onClick={saveEdit} disabled={uploading}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="sr-toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
