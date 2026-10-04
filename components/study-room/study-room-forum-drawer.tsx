"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Heart, MessageSquare, PenLine, Star, UserPlus, Users, X } from "lucide-react";

import { avatarDataUrl } from "@/lib/study-room/npc-avatar";
import type { ForumState } from "@/lib/study-room/forum";
import { deleteDraft, markNotificationsRead } from "@/lib/study-room/forum-social";

type StudyRoomForumDrawerProps = {
  state: ForumState;
  unread: ForumState["notifications"];
  onClose: () => void;
  onMutate: (updater: (prev: ForumState) => ForumState) => void;
  onOpenCompose: (draftId?: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenMine: () => void;
  onOpenSettings: () => void;
};

type Section = "mine" | "drafts" | "comments" | "likes" | "friends" | "following";

const ME = "user";

/**
 * 点头像打开的左侧菜单（不做屏幕边缘滑动，避免和手机的返回手势打架）。
 * 每一项都展开成真实的列表：我的帖子、草稿箱、私信、评论与回复、获赞与提及、好友申请、关注的书友。
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
}: StudyRoomForumDrawerProps) {
  const [open, setOpen] = useState<Section | null>("mine");

  const myPosts = state.posts.filter((post) => post.authorId === ME);
  const myComments = state.posts.flatMap((post) =>
    post.comments.filter((comment) => comment.authorId === ME).map((comment) => ({ comment, post })),
  );
  const likedNotices = unread.filter((item) => item.kind === "like" || item.kind === "mention");
  const friendRequests = unread.filter((item) => item.kind === "friend");
  const followedNpcs = state.npcs.filter((npc) => state.following.includes(npc.id));

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
      <ChevronDown
        size={15}
        strokeWidth={1.8}
        style={{ transform: open === section ? "rotate(180deg)" : undefined, transition: "transform .2s" }}
      />
    </button>
  );

  return (
    <div className="sr-drawer-mask" onClick={onClose}>
      <aside className="sr-drawer" onClick={(event) => event.stopPropagation()} aria-label="个人菜单">
        <header className="sr-drawer-head">
          <span className="sr-forum-avatar" aria-hidden>
            <span>我</span>
          </span>
          <span className="sr-forum-author-main">
            <span className="sr-forum-name">我</span>
            <span className="sr-note-meta">
              发布 {myPosts.length} 条 · 评论 {myComments.length} 条
            </span>
          </span>
          <button type="button" className="sr-icon-btn" onClick={onClose} aria-label="关闭菜单">
            <X size={18} strokeWidth={1.7} />
          </button>
        </header>

        <div className="sr-drawer-body">
          {row("mine", "我的帖子", myPosts.length, <PenLine size={16} strokeWidth={1.7} />)}
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
              <p className="sr-note-meta sr-drawer-empty">没有草稿。写帖子时点「存草稿」会存在这里。</p>
            ) : (
              state.drafts.map((draft) => (
                <span key={draft.id} className="sr-drawer-item sr-drawer-item--row">
                  <button type="button" onClick={() => onOpenCompose(draft.id)}>
                    {draft.title || draft.body.slice(0, 20)}
                  </button>
                  <button
                    type="button"
                    className="sr-note-tool"
                    title="删除草稿"
                    onClick={() => onMutate((prev) => deleteDraft(prev, draft.id))}
                  >
                    <X size={14} strokeWidth={1.8} />
                  </button>
                </span>
              ))
            ))}

          <button type="button" className="sr-drawer-row" onClick={onOpenMine}>
            <MessageSquare size={16} strokeWidth={1.7} />
            <span className="sr-drawer-label">私信</span>
            <span className="sr-note-meta">在聊天应用里</span>
            <ChevronRight size={15} strokeWidth={1.8} />
          </button>
          <p className="sr-note-meta sr-drawer-empty">
            私信沿用宿主的聊天应用：加为好友后会在聊天里出现，未读消息也在那里看，这里不另造一套。
          </p>

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

          {row("friends", "好友申请", friendRequests.length, <UserPlus size={16} strokeWidth={1.7} />)}
          {open === "friends" &&
            (friendRequests.length === 0 ? (
              <p className="sr-note-meta sr-drawer-empty">没有待处理的好友申请。</p>
            ) : (
              friendRequests.map((notice) => (
                <span key={notice.id} className="sr-drawer-item sr-drawer-item--row">
                  <span>{notice.fromName} 想加你为好友</span>
                  <button
                    type="button"
                    className="sr-chip"
                    onClick={onOpenSettings}
                    title="到书友管理里确认"
                  >
                    去确认
                  </button>
                </span>
              ))
            ))}

          {row("following", "关注的书友", followedNpcs.length, <Users size={16} strokeWidth={1.7} />)}
          {open === "following" &&
            (followedNpcs.length === 0 ? (
              <p className="sr-note-meta sr-drawer-empty">还没有关注谁。在书友主页点「关注」就会出现在这里。</p>
            ) : (
              followedNpcs.map((npc) => (
                <span key={npc.id} className="sr-drawer-item sr-drawer-item--row">
                  <span className="sr-drawer-avatar" aria-hidden>
                    {npc.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={npc.avatarUrl} alt="" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarDataUrl(npc.avatar)} alt="" />
                    )}
                  </span>
                  <span>{npc.nickname}</span>
                </span>
              ))
            ))}

          <button type="button" className="sr-drawer-row" onClick={onOpenMine}>
            <Star size={16} strokeWidth={1.7} />
            <span className="sr-drawer-label">进入我的主页</span>
            <ChevronRight size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="sr-drawer-row" onClick={onOpenSettings}>
            <PenLine size={16} strokeWidth={1.7} />
            <span className="sr-drawer-label">论坛生成规则</span>
            <ChevronRight size={15} strokeWidth={1.8} />
          </button>
        </div>
      </aside>
    </div>
  );
}
