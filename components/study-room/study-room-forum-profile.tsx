"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, Loader2, MessageCircle, Star, UserPlus } from "lucide-react";

import { avatarDataUrl } from "@/lib/study-room/npc-avatar";
import type { ForumNpc, ForumState } from "@/lib/study-room/forum";
import { followerCount, followingCount, isFollowing, isStarred } from "@/lib/study-room/forum-social";
import { PostStrip, ProfileStats, TwoColumnGrid } from "./study-room-profile-parts";

type StudyRoomForumProfileProps = {
  npc: ForumNpc;
  state: ForumState;
  busy: boolean;
  onBack: () => void;
  onFollow: () => void;
  onStar: () => void;
  onAddFriend: () => void;
  onChat: () => void;
  onOpenPost: (postId: string) => void;
};

/**
 * 书友主页：头像与昵称紧挨、ID、签名、状态气泡；
 * 关注（含特别关注下拉）/ 私信 / 加好友是矩形按钮；动态横滑，公开书架两列。
 */
export function StudyRoomForumProfile({
  npc,
  state,
  busy,
  onBack,
  onFollow,
  onStar,
  onAddFriend,
  onChat,
  onOpenPost,
}: StudyRoomForumProfileProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const posts = state.posts.filter((post) => post.authorId === npc.id);
  const reviews = posts.filter((post) => post.kind === "review");
  const others = posts.filter((post) => post.kind !== "review");
  const endorsed = state.posts.filter((post) => post.likedBy.includes(npc.id) && post.authorId !== npc.id);
  const likes = posts.reduce((total, post) => total + post.likedBy.length, 0);
  const following = isFollowing(state, npc.id);
  const starred = isStarred(state, npc.id);
  const isFriend = Boolean(npc.characterId);
  const avatar = npc.avatarUrl ?? avatarDataUrl(npc.avatar);
  // 状态气泡只用真实记录：TA 最近一条带书名的帖子
  const recentBook = posts
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((post) => post.bookTitle)?.bookTitle;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  return (
    <div className="sr-forum-sub">
      <div className="sr-forum-sub-head">
        <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回">
          <ChevronLeft size={22} strokeWidth={1.6} />
        </button>
        <span className="sr-forum-sub-title">{npc.nickname} 的主页</span>
      </div>

      <div className="sr-forum-sub-body">
        <div className="sr-pf-head">
          <span className="sr-pf-avatar" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt="" />
          </span>
          <div className="sr-pf-id">
            <h2 className="sr-pf-name">
              {npc.nickname}
              {starred && <Star size={14} strokeWidth={1.8} className="sr-pf-star" aria-label="特别关注" />}
            </h2>
            <div className="sr-pf-sub">ID：{npc.id}</div>
            <div className="sr-pf-sub">{[npc.occupation, npc.age, npc.region].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        {recentBook && <div className="sr-pf-status">最近在聊《{recentBook}》</div>}
        {npc.background && <p className="sr-pf-sign">{npc.background}</p>}

        <ProfileStats
          items={[
            { label: "关注", value: followingCount(npc) },
            { label: "粉丝", value: followerCount(npc) },
            { label: "发帖", value: posts.length },
            { label: "获赞", value: likes },
          ]}
        />

        <div className="sr-pf-actions">
          {following ? (
            <div className="sr-pf-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="sr-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {starred ? <Star size={15} strokeWidth={1.8} /> : <Check size={15} strokeWidth={1.8} />}
                {starred ? "特别关注" : "已关注"}
                <ChevronDown size={14} strokeWidth={1.8} />
              </button>
              {menuOpen && (
                <div className="sr-pf-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onStar();
                    }}
                  >
                    <Star size={15} strokeWidth={1.8} />
                    {starred ? "取消特别关注" : "设为特别关注"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="sr-pf-menu-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onFollow();
                    }}
                  >
                    取消关注
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" className="sr-btn sr-btn-primary" onClick={onFollow}>
              关注
            </button>
          )}
          <button
            type="button"
            className="sr-btn"
            onClick={onChat}
            disabled={!isFriend}
            title={isFriend ? undefined : "加为好友后在聊天里私信"}
          >
            <MessageCircle size={15} strokeWidth={1.8} />
            私信
          </button>
          {isFriend ? (
            <button type="button" className="sr-btn" disabled>
              <Check size={15} strokeWidth={1.8} />
              已是好友
            </button>
          ) : (
            <button type="button" className="sr-btn" onClick={onAddFriend} disabled={busy}>
              {busy ? <Loader2 size={15} className="sr-spin" /> : <UserPlus size={15} strokeWidth={1.8} />}
              加好友
            </button>
          )}
        </div>

        {npc.interests.length > 0 && (
          <div className="sr-chip-row" style={{ marginTop: 12 }}>
            {npc.interests.map((item) => (
              <span key={item} className="sr-note-tag">{item}</span>
            ))}
          </div>
        )}

        <div className="sr-section-label">动态</div>
        <PostStrip posts={others} emptyText="TA 还没有发过动态。" onOpen={onOpenPost} />

        <div className="sr-section-label">书评</div>
        <PostStrip posts={reviews} emptyText="TA 还没有写过书评。" onOpen={onOpenPost} />

        <div className="sr-section-label">公开书架</div>
        <TwoColumnGrid
          items={(npc.shelfTitles ?? []).map((title) => ({ key: title, title: `《${title}》` }))}
          emptyText="TA 还没有公开书架。"
        />

        {(npc.readingTaste || npc.personality) && (
          <>
            <div className="sr-section-label">关于 TA</div>
            {npc.readingTaste && <p className="sr-pf-about">读书口味：{npc.readingTaste}</p>}
            {npc.personality && <p className="sr-pf-about">性格：{npc.personality}</p>}
          </>
        )}

        {endorsed.length > 0 && (
          <>
            <div className="sr-section-label">赞同过的</div>
            <PostStrip posts={endorsed.slice(0, 10)} emptyText="" onOpen={onOpenPost} />
          </>
        )}
      </div>
    </div>
  );
}
