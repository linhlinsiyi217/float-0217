"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Heart,
  MessageSquare,
  NotebookPen,
  PenLine,
  Settings2,
  Star,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { avatarDataUrl } from "@/lib/study-room/npc-avatar";
import type { ForumState } from "@/lib/study-room/forum";
import { deleteDraft, markNotificationsRead } from "@/lib/study-room/forum-social";
import { displayName, loadProfile } from "@/lib/study-room/profile";
import { loadUserIdentities } from "@/lib/settings-storage";

type StudyRoomForumDrawerProps = {
  state: ForumState;
  unread: ForumState["notifications"];
  onClose: () => void;
  onMutate: (updater: (prev: ForumState) => ForumState) => void;
  onOpenCompose: (draftId?: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenMine: () => void;
  onOpenSettings: () => void;
  /** 私信：打开宿主的聊天应用 */
  onOpenChat: () => void;
  /** 打开某位书友的主页 */
  onOpenProfile: (npcId: string) => void;
};

type Section = "mine" | "drafts" | "comments" | "likes" | "friends" | "following";

const ME = "user";

/**
 * 点头像打开的左侧菜单（不做屏幕边缘滑动，避免和手机的返回手势打架）。
 * 分四组：用户（主页、关注、好友申请）/ 内容（帖子、草稿）/ 互动（评论、获赞、私信）/ 个人（设置）。
 */
export function StudyRoomForumDrawer({
  state,
  unread,
  onClose,
  onMutate,
  onOpenCompose,
  onOpenPost,
  onOpenMine,
  onOpenSettings,
  onOpenChat,
  onOpenProfile,
}: StudyRoomForumDrawerProps) {
  const [open, setOpen] = useState<Section | null>(null);
  const me = useMemo(() => {
    const profile = loadProfile();
    const identity = loadUserIdentities()[0];
    return {
      name: displayName(profile, identity?.name),
      avatar: profile.useHostAvatar && identity?.avatarUrl ? identity.avatarUrl : avatarDataUrl(profile.avatar),
      status: profile.status.trim(),
    };
  }, []);

  const myPosts = state.posts.filter((post) => post.authorId === ME);
  const myComments = state.posts.flatMap((post) =>
    post.comments.filter((comment) => comment.authorId === ME).map((comment) => ({ comment, post })),
  );
  const likedNotices = unread.filter((item) => item.kind === "like" || item.kind === "mention");
  const friendRequests = unread.filter((item) => item.kind === "friend");
  // 特别关注排在前面
  const followedNpcs = state.npcs
    .filter((npc) => state.following.includes(npc.id))
    .sort((a, b) => Number(state.starred.includes(b.id)) - Number(state.starred.includes(a.id)));

  const toggle = (section: Section) => {
    setOpen((current) => (current === section ? null : section));
    if (section === "comments" || section === "likes") {
      onMutate((prev) => markNotificationsRead(prev, ["comment", "reply", "like", "mention"]));
    }
    if (section === "friends") {
      onMutate((prev) => markNotificationsRead(prev, ["friend"]));
    }
  };

  const row = (section: Section, label: string, count: number, icon: React.ReactNode) => (
    <button type="button" className="sr-drawer-row" onClick={() => toggle(section)} aria-expanded={open === section}>
      {icon}
      <span className="sr-drawer-label">{label}</span>
      {count > 0 && <span className="sr-drawer-count">{count}</span>}
      <ChevronDown size={15} strokeWidth={1.8} className="sr-drawer-caret" data-open={open === section ? "true" : undefined} />
    </button>
  );

  const link = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" className="sr-drawer-row" onClick={onClick}>
      {icon}
      <span className="sr-drawer-label">{label}</span>
      <ChevronRight size={15} strokeWidth={1.8} />
    </button>
  );

  return (
    <div className="sr-drawer-mask" onClick={onClose}>
      <aside className="sr-drawer" onClick={(event) => event.stopPropagation()} aria-label="个人菜单">
        <header className="sr-drawer-head">
          <span className="sr-forum-avatar" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={me.avatar} alt="" />
          </span>
          <span className="sr-forum-author-main">
            <span className="sr-forum-name">{me.name}</span>
            <span className="sr-note-meta">{me.status || `发布 ${myPosts.length} · 评论 ${myComments.length}`}</span>
          </span>
          <button type="button" className="sr-icon-btn" onClick={onClose} aria-label="关闭菜单">
            <X size={18} strokeWidth={1.7} />
          </button>
        </header>

        <div className="sr-drawer-body">
          <div className="sr-section-label">用户</div>
          {link("我的主页", <UserRound size={16} strokeWidth={1.7} />, onOpenMine)}

          {row("following", "关注的书友", followedNpcs.length, <Users size={16} strokeWidth={1.7} />)}
          {open === "following" &&
            (followedNpcs.length === 0 ? (
              <p className="sr-note-meta sr-drawer-empty">还没有关注谁。</p>
            ) : (
              followedNpcs.map((npc) => (
                <button key={npc.id} type="button" className="sr-drawer-item sr-drawer-item--row" onClick={() => onOpenProfile(npc.id)}>
                  <span className="sr-drawer-avatar" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={npc.avatarUrl ?? avatarDataUrl(npc.avatar)} alt="" />
                  </span>
                  <span>{npc.nickname}</span>
                  {state.starred.includes(npc.id) && <Star size={13} strokeWidth={1.8} className="sr-pf-star" aria-label="特别关注" />}
                </button>
              ))
            ))}

          {row("friends", "好友申请", friendRequests.length, <UserPlus size={16} strokeWidth={1.7} />)}
          {open === "friends" &&
            (friendRequests.length === 0 ? (
              <p className="sr-note-meta sr-drawer-empty">没有待处理的好友申请。</p>
            ) : (
              friendRequests.map((notice) => (
                <span key={notice.id} className="sr-drawer-item sr-drawer-item--row">
                  <span>{notice.fromName} 想加你为好友</span>
                  <button type="button" className="sr-btn" onClick={onOpenSettings}>
                    去确认
                  </button>
                </span>
              ))
            ))}

          <div className="sr-section-label">内容</div>
          {row("mine", "我的帖子", myPosts.length, <NotebookPen size={16} strokeWidth={1.7} />)}
          {open === "mine" &&
            (myPosts.length === 0 ? (
              <p className="sr-note-meta sr-drawer-empty">还没发过帖子。</p>
            ) : (
              myPosts.map((post) => (
                <button key={post.id} type="button" className="sr-drawer-item" onClick={() => onOpenPost(post.id)}>
                  {post.title || post.body.slice(0, 22)}
                  <ChevronRight size={14} strokeWidth={1.8} />
                </button>
              ))
            ))}

          {row("drafts", "草稿箱", state.drafts.length, <PenLine size={16} strokeWidth={1.7} />)}
          {open === "drafts" &&
            (state.drafts.length === 0 ? (
              <p className="sr-note-meta sr-drawer-empty">没有草稿。</p>
            ) : (
              state.drafts.map((draft) => (
                <span key={draft.id} className="sr-drawer-item sr-drawer-item--row">
                  <button type="button" onClick={() => onOpenCompose(draft.id)}>
                    {draft.title || draft.body.slice(0, 20)}
                  </button>
                  <button
                    type="button"
                    className="sr-note-tool"
                    aria-label="删除草稿"
                    onClick={() => onMutate((prev) => deleteDraft(prev, draft.id))}
                  >
                    <X size={14} strokeWidth={1.8} />
                  </button>
                </span>
              ))
            ))}

          <div className="sr-section-label">互动</div>
          {row("comments", "评论与回复", myComments.length, <MessageSquare size={16} strokeWidth={1.7} />)}
          {open === "comments" &&
            (myComments.length === 0 ? (
              <p className="sr-note-meta sr-drawer-empty">还没有评论。</p>
            ) : (
              myComments.slice(0, 12).map(({ comment, post }) => (
                <button key={comment.id} type="button" className="sr-drawer-item" onClick={() => onOpenPost(post.id)}>
                  {comment.body.slice(0, 24)}
                  <ChevronRight size={14} strokeWidth={1.8} />
                </button>
              ))
            ))}

          {row("likes", "获赞与提及", likedNotices.length, <Heart size={16} strokeWidth={1.7} />)}
          {open === "likes" &&
            (likedNotices.length === 0 ? (
              <p className="sr-note-meta sr-drawer-empty">还没有新的赞或提及。</p>
            ) : (
              likedNotices.slice(0, 12).map((notice) => (
                <button
                  key={notice.id}
                  type="button"
                  className="sr-drawer-item"
                  onClick={() => notice.postId && onOpenPost(notice.postId)}
                >
                  {notice.fromName}
                  {notice.kind === "like" ? " 赞同了你的帖子" : " 提到了你"}
                  <ChevronRight size={14} strokeWidth={1.8} />
                </button>
              ))
            ))}

          {link("私信", <MessageSquare size={16} strokeWidth={1.7} />, onOpenChat)}

          <div className="sr-section-label">个人</div>
          {link("论坛设置", <Settings2 size={16} strokeWidth={1.7} />, onOpenSettings)}

          {/* 底部小插画：让侧栏下半段不空落 */}
          <div className="sr-drawer-art" aria-hidden>
            <svg viewBox="0 0 120 44" role="img">
              <rect x="6" y="30" width="108" height="4" rx="2" fill="currentColor" opacity="0.25" />
              <rect x="14" y="12" width="9" height="18" rx="2" fill="currentColor" opacity="0.35" />
              <rect x="25" y="8" width="11" height="22" rx="2" fill="currentColor" opacity="0.28" />
              <rect x="38" y="14" width="8" height="16" rx="2" fill="currentColor" opacity="0.32" />
              <rect x="48" y="10" width="12" height="20" rx="2" fill="currentColor" opacity="0.26" />
              <rect x="62" y="16" width="9" height="14" rx="2" fill="currentColor" opacity="0.3" />
              <path d="M78 30 q10 -14 22 -2 v2 z" fill="currentColor" opacity="0.22" />
            </svg>
          </div>
        </div>
      </aside>
    </div>
  );
}
