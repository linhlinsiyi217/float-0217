"use client";

import { ChevronLeft, Loader2, MessageCircle, UserPlus, Users } from "lucide-react";

import { avatarDataUrl } from "@/lib/study-room/npc-avatar";
import { KIND_TEXT, type ForumNpc, type ForumState } from "@/lib/study-room/forum";
import { followerCount, followingCount, isFollowing } from "@/lib/study-room/forum-social";

type StudyRoomForumProfileProps = {
  npc: ForumNpc;
  state: ForumState;
  busy: boolean;
  onBack: () => void;
  onFollow: () => void;
  onAddFriend: () => void;
  onChat: () => void;
  onOpenPost: (postId: string) => void;
};

/** 书友主页：头像、昵称、简介、领域标签、阅读偏好、粉丝/关注、公开书架、发帖与书评。 */
export function StudyRoomForumProfile({
  npc,
  state,
  busy,
  onBack,
  onFollow,
  onAddFriend,
  onChat,
  onOpenPost,
}: StudyRoomForumProfileProps) {
  const posts = state.posts.filter((post) => post.authorId === npc.id);
  const reviews = posts.filter((post) => post.kind === "review");
  const endorsed = state.posts.filter((post) => post.likedBy.includes(npc.id));
  const following = isFollowing(state, npc.id);
  const isFriend = Boolean(npc.characterId);
  const avatar = npc.avatarUrl ?? avatarDataUrl(npc.avatar);

  return (
    <div className="sr-forum-sub">
      <div className="sr-forum-sub-head">
        <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回">
          <ChevronLeft size={22} strokeWidth={1.6} />
        </button>
        <span className="sr-forum-sub-title">{npc.nickname}</span>
      </div>

      <div className="sr-forum-sub-body">
        <div className="sr-profile-head">
          <span className="sr-profile-avatar" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt="" />
          </span>
          <div className="sr-profile-main">
            <h2 className="sr-profile-name">{npc.nickname}</h2>
            <div className="sr-note-meta">{[npc.occupation || "未填职业", npc.age, npc.region].filter(Boolean).join(" · ")}</div>
            <div className="sr-note-meta">
              粉丝 {followerCount(npc)} · 关注 {followingCount(npc)} · 发帖 {posts.length}
            </div>
          </div>
        </div>

        <div className="sr-css-actions" style={{ marginTop: 10 }}>
          <button type="button" className="sr-chip" data-active={following ? "true" : undefined} onClick={onFollow}>
            <Users size={13} strokeWidth={1.8} />
            {following ? "已关注" : "关注"}
          </button>
          {isFriend ? (
            <button type="button" className="sr-chip" onClick={onChat}>
              <MessageCircle size={13} strokeWidth={1.8} />
              去聊天
            </button>
          ) : (
            <button type="button" className="sr-chip" onClick={onAddFriend} disabled={busy}>
              {busy ? <Loader2 size={13} className="sr-spin" /> : <UserPlus size={13} strokeWidth={1.8} />}
              加为好友
            </button>
          )}
          <button type="button" className="sr-chip" onClick={onChat} disabled={!isFriend}>
            <MessageCircle size={13} strokeWidth={1.8} />
            私信
          </button>
        </div>
        {!isFriend && (
          <p className="sr-note-meta" style={{ marginTop: 6 }}>
            加为好友后，TA 会出现在聊天应用的联系人里，私信也在那里继续（沿用同一份人设与记忆）。
          </p>
        )}

        {npc.background && <p className="sr-profile-bio">{npc.background}</p>}

        {npc.interests.length > 0 && (
          <>
            <div className="sr-section-label">领域与兴趣</div>
            <div className="sr-chip-row">
              {npc.interests.map((item) => (
                <span key={item} className="sr-chip">{item}</span>
              ))}
            </div>
          </>
        )}

        {npc.readingTaste && (
          <>
            <div className="sr-section-label">阅读偏好</div>
            <p className="sr-note-meta">{npc.readingTaste}</p>
          </>
        )}
        {npc.personality && (
          <>
            <div className="sr-section-label">性格与说话习惯</div>
            <p className="sr-note-meta">
              {npc.personality}
              {npc.speechStyle ? ` · ${npc.speechStyle}` : ""}
            </p>
          </>
        )}

        <div className="sr-section-label">公开书架</div>
        {npc.shelfTitles && npc.shelfTitles.length > 0 ? (
          <div className="sr-chip-row">
            {npc.shelfTitles.map((title) => (
              <span key={title} className="sr-chip">《{title}》</span>
            ))}
          </div>
        ) : (
          <p className="sr-note-meta">TA 还没有公开书架。</p>
        )}

        <div className="sr-section-label">发帖（{posts.length}）</div>
        {posts.length === 0 ? (
          <p className="sr-note-meta">还没有发过帖子。</p>
        ) : (
          <ul className="sr-forum-comments">
            {posts.map((post) => (
              <li key={post.id}>
                <button type="button" className="sr-forum-comment-body sr-forum-name--link" onClick={() => onOpenPost(post.id)}>
                  {KIND_TEXT[post.kind]}：{post.title || post.body.slice(0, 30)}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="sr-section-label">书评（{reviews.length}）</div>
        {reviews.length === 0 ? (
          <p className="sr-note-meta">还没有写过书评。</p>
        ) : (
          <ul className="sr-forum-comments">
            {reviews.map((post) => (
              <li key={post.id}>
                <button type="button" className="sr-forum-comment-body sr-forum-name--link" onClick={() => onOpenPost(post.id)}>
                  {post.bookTitle ? `《${post.bookTitle}》：` : ""}
                  {post.title || post.body.slice(0, 30)}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="sr-section-label">赞同过的（{endorsed.length}）</div>
        {endorsed.length === 0 ? (
          <p className="sr-note-meta">TA 还没有赞同过别人的帖子。</p>
        ) : (
          <ul className="sr-forum-comments">
            {endorsed.slice(0, 10).map((post) => (
              <li key={post.id}>
                <button type="button" className="sr-forum-comment-body sr-forum-name--link" onClick={() => onOpenPost(post.id)}>
                  {post.authorName}：{post.title || post.body.slice(0, 26)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
