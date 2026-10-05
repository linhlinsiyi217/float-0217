"use client";

import { useState, type ReactNode } from "react";
import { Ban, BookOpen, ChevronLeft, Gift, Heart, MessageSquare, PenLine, Star, Trash2, X } from "lucide-react";

import type { Book } from "@/lib/reading-types";
import { avatarDataUrl } from "@/lib/study-room/npc-avatar";
import { KIND_TEXT, type ForumPost, type ForumState } from "@/lib/study-room/forum";
import { normalizeForMatch } from "@/lib/study-room/book-source";
import { loadBooks } from "@/lib/reading-storage";

/** 帖子关联的书：先看 bookId，再按书名匹配书架上的书。 */
export function findBookForPost(post: ForumPost): Book | undefined {
  if (post.bookId) {
    const byId = loadBooks().find((book) => book.id === post.bookId);
    if (byId) return byId;
  }
  if (!post.bookTitle) return undefined;
  const key = normalizeForMatch(post.bookTitle);
  return loadBooks().find((book) => normalizeForMatch(book.title) === key);
}
import { isCollected } from "@/lib/study-room/forum-social";

const ME = "user";

type CardProps = {
  post: ForumPost;
  state: ForumState;
  books: Record<string, Book>;
  busy: boolean;
  onOpen: () => void;
  onLike: () => void;
  onOpenBook: (book: Book) => void;
  onOpenAuthor: (npcId: string) => void;
  onGift: () => void;
  onHide: () => void;
  /** 屏蔽这位书友（只对书友的帖子出现） */
  onBlock?: () => void;
};

function authorAvatar(post: ForumPost, state: ForumState): string | null {
  if (post.authorKind === "user") return null;
  const npc = state.npcs.find((item) => item.id === post.authorId);
  if (!npc) return null;
  return npc.avatarUrl ?? avatarDataUrl(npc.avatar);
}

/** 信息流里的一条帖子：点头像去主页、点正文开详情，互动都在卡片上。 */
export function StudyRoomForumPostCard({
  post,
  state,
  books,
  busy,
  onOpen,
  onLike,
  onOpenBook,
  onOpenAuthor,
  onGift,
  onHide,
  onBlock,
}: CardProps) {
  const avatar = authorAvatar(post, state);
  const liked = post.likedBy.includes(ME);
  const book = post.bookId ? books[post.bookId] : findBookForPost(post);

  return (
    <article className="sr-note-card sr-forum-post">
      <header className="sr-forum-author">
        <button
          type="button"
          className="sr-forum-avatar"
          onClick={() => post.authorKind === "npc" && onOpenAuthor(post.authorId)}
          aria-label={`${post.authorName} 的主页`}
          disabled={post.authorKind === "user"}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" />
          ) : (
            <span>我</span>
          )}
        </button>
        <span className="sr-forum-author-main">
          <button
            type="button"
            className="sr-forum-name sr-forum-name--link"
            onClick={() => post.authorKind === "npc" && onOpenAuthor(post.authorId)}
          >
            {post.authorName}
          </button>
          <span className="sr-note-meta">
            {KIND_TEXT[post.kind]}
            {post.generated ? " · AI" : ""} · {new Date(post.createdAt).toLocaleString("zh-CN")}
          </span>
        </span>
        {onBlock && post.authorKind === "npc" && (
          <button
            type="button"
            className="sr-note-tool"
            title="屏蔽这位书友"
            aria-label={`屏蔽 ${post.authorName}`}
            onClick={() => {
              if (confirm(`屏蔽 ${post.authorName}？TA 的帖子不再出现，也不会再来回复。可以在「书友管理」里解除。`)) onBlock();
            }}
            disabled={busy}
          >
            <Ban size={14} strokeWidth={1.8} />
          </button>
        )}
        <button type="button" className="sr-note-tool" title="不感兴趣" aria-label="不感兴趣" onClick={onHide} disabled={busy}>
          <X size={15} strokeWidth={1.8} />
        </button>
      </header>

      <button type="button" className="sr-forum-open" onClick={onOpen}>
        {post.title && <span className="sr-forum-title">{post.title}</span>}
        <span className="sr-forum-body sr-forum-body--clamp" data-spoiler={post.spoiler ? "true" : undefined}>
          {post.body}
        </span>
        {post.images && post.images.length > 0 && (
          <span className="sr-forum-images">
            {post.images.slice(0, 3).map((image, index) => (
              <span key={index} className="sr-forum-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" />
              </span>
            ))}
          </span>
        )}
      </button>

      {post.spoiler && <span className="sr-forum-spoiler-tag">含剧透</span>}

      {post.bookTitle && (
        <div className="sr-forum-book">
          <BookOpen size={13} strokeWidth={1.8} aria-hidden />
          {book ? (
            <button type="button" className="sr-forum-book-btn" onClick={() => onOpenBook(book)}>
              在书房读《{post.bookTitle}》
            </button>
          ) : (
            <span className="sr-note-meta">《{post.bookTitle}》· 不在书架上</span>
          )}
        </div>
      )}

      {post.topics && post.topics.length > 0 && (
        <div className="sr-chip-row" style={{ marginTop: 6 }}>
          {post.topics.map((topic) => (
            <span key={topic} className="sr-note-tag">#{topic}</span>
          ))}
        </div>
      )}

      <footer className="sr-note-foot">
        <span className="sr-note-tools">
          <button type="button" className="sr-note-tool" data-active={liked ? "true" : undefined} title="赞同" onClick={onLike}>
            <Heart size={15} strokeWidth={1.7} fill={liked ? "currentColor" : "none"} />
            {post.likedBy.length > 0 && <span className="sr-forum-count">{post.likedBy.length}</span>}
          </button>
          <button type="button" className="sr-note-tool" title="评论" onClick={onOpen}>
            <MessageSquare size={15} strokeWidth={1.7} />
            {post.comments.length > 0 && <span className="sr-forum-count">{post.comments.length}</span>}
          </button>
          <button type="button" className="sr-note-tool" title="送礼物" onClick={onGift}>
            <Gift size={15} strokeWidth={1.7} />
          </button>
        </span>
      </footer>
    </article>
  );
}

type ViewProps = {
  post: ForumPost;
  state: ForumState;
  books: Record<string, Book>;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
  onLike: () => void;
  onComment: (body: string, replyToId?: string) => void;
  onCollect: () => void;
  onGift: () => void;
  onOpenAuthor: (npcId: string) => void;
  onDelete: () => void;
  /** 编辑自己的帖子 */
  onEdit: (body: string) => void;
  /** 删除自己的评论 */
  onDeleteComment: (commentId: string) => void;
  /** 屏蔽楼主（楼主是书友时） */
  onBlockAuthor?: () => void;
  /** 书友回应的状态区：正在输入 / 停止 / 失败重试 / 去设置模型 */
  replyPanel?: ReactNode;
};

/** 帖子详情：完整正文、图片、评论与回复；自己的帖子可以改或删。 */
export function StudyRoomForumPostView({
  post,
  state,
  books,
  onBack,
  onOpenBook,
  onLike,
  onComment,
  onCollect,
  onGift,
  onOpenAuthor,
  onDelete,
  onEdit,
  onDeleteComment,
  onBlockAuthor,
  replyPanel,
}: ViewProps) {
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const liked = post.likedBy.includes(ME);
  const collected = isCollected(post);
  const book = post.bookId ? books[post.bookId] : findBookForPost(post);
  const avatar = authorAvatar(post, state);

  return (
    <div className="sr-forum-sub">
      <div className="sr-forum-sub-head">
        <button type="button" className="sr-icon-btn" onClick={onBack} aria-label="返回">
          <ChevronLeft size={22} strokeWidth={1.6} />
        </button>
        <span className="sr-forum-sub-title">帖子</span>
        {post.authorId === ME && (
          <span className="sr-note-tools">
            <button
              type="button"
              className="sr-note-tool"
              title="编辑帖子"
              onClick={() => {
                setEditing((value) => !value);
                setDraft(post.body);
              }}
            >
              <PenLine size={16} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              className="sr-note-tool"
              title="删除帖子"
              onClick={() => {
                if (confirm("删除这条帖子？评论也会一起删除。")) onDelete();
              }}
            >
              <Trash2 size={16} strokeWidth={1.7} />
            </button>
          </span>
        )}
        {post.authorKind === "npc" && onBlockAuthor && (
          <span className="sr-note-tools">
            <button
              type="button"
              className="sr-note-tool"
              title="屏蔽楼主"
              aria-label={`屏蔽 ${post.authorName}`}
              onClick={() => {
                if (confirm(`屏蔽 ${post.authorName}？TA 的帖子不再出现，也不会再来回复。可以在「书友管理」里解除。`)) onBlockAuthor();
              }}
            >
              <Ban size={16} strokeWidth={1.7} />
            </button>
          </span>
        )}
      </div>

      <div className="sr-forum-sub-body">
        <div className="sr-forum-author">
          <span className="sr-forum-avatar" aria-hidden>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" />
            ) : (
              <span>我</span>
            )}
          </span>
          <span className="sr-forum-author-main">
            <button
              type="button"
              className="sr-forum-name sr-forum-name--link"
              onClick={() => post.authorKind === "npc" && onOpenAuthor(post.authorId)}
            >
              {post.authorName}
            </button>
            <span className="sr-note-meta">
              {KIND_TEXT[post.kind]} · {new Date(post.createdAt).toLocaleString("zh-CN")}
            </span>
          </span>
        </div>

        {post.title && <h2 className="sr-forum-title" style={{ fontSize: 17 }}>{post.title}</h2>}

        {editing ? (
          <>
            <textarea className="sr-css-editor" rows={7} value={draft} onChange={(event) => setDraft(event.target.value)} />
            <div className="sr-css-actions">
              <button type="button" className="sr-btn" onClick={() => setEditing(false)}>
                取消
              </button>
              <button
                type="button"
                className="sr-btn sr-btn-primary"
                onClick={() => {
                  const text = draft.trim();
                  if (!text) return;
                  onEdit(text);
                  setEditing(false);
                }}
              >
                保存修改
              </button>
            </div>
          </>
        ) : (
          <p className="sr-forum-body" data-spoiler={post.spoiler ? "true" : undefined}>
            {post.body}
          </p>
        )}

        {post.images && post.images.length > 0 && (
          <div className="sr-forum-images">
            {post.images.map((image, index) => (
              <span key={index} className="sr-forum-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" />
              </span>
            ))}
          </div>
        )}

        {post.bookTitle && (
          <div className="sr-forum-book">
            <BookOpen size={13} strokeWidth={1.8} aria-hidden />
            {book ? (
              <button type="button" className="sr-forum-book-btn" onClick={() => onOpenBook(book)}>
                在书房读《{post.bookTitle}》
              </button>
            ) : (
              <span className="sr-note-meta">《{post.bookTitle}》· 不在书架上</span>
            )}
          </div>
        )}

        <div className="sr-css-actions" style={{ marginTop: 10 }}>
          <button type="button" className="sr-chip" data-active={liked ? "true" : undefined} onClick={onLike}>
            <Heart size={13} strokeWidth={1.8} fill={liked ? "currentColor" : "none"} />
            赞同 {post.likedBy.length > 0 ? post.likedBy.length : ""}
          </button>
          <button type="button" className="sr-chip" data-active={collected ? "true" : undefined} onClick={onCollect}>
            <Star size={13} strokeWidth={1.8} fill={collected ? "currentColor" : "none"} />
            {collected ? "已收藏" : "收藏"}
          </button>
          <button type="button" className="sr-btn sr-btn-sm" onClick={onGift}>
            <Gift size={13} strokeWidth={1.8} />
            送礼物
          </button>
        </div>

        <div className="sr-section-label" style={{ marginTop: 14 }}>
          评论（{post.comments.length}）
        </div>
        {post.comments.length === 0 ? (
          <p className="sr-note-meta">还没有评论。说点什么，书友会陆续来聊。</p>
        ) : (
          <ul className="sr-forum-comments">
            {post.comments.map((item) => {
              const target = item.replyToId ? post.comments.find((entry) => entry.id === item.replyToId) : undefined;
              return (
                <li key={item.id}>
                  <div className="sr-forum-comment-head">
                    <button
                      type="button"
                      className="sr-forum-comment-author sr-forum-name--link"
                      onClick={() => item.authorKind === "npc" && onOpenAuthor(item.authorId)}
                    >
                      {item.authorName}
                    </button>
                    {target && <span className="sr-note-meta">回复 {target.authorName}</span>}
                    <span className="sr-note-meta" style={{ marginLeft: "auto" }}>
                      {new Date(item.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="sr-forum-comment-body">{item.body}</p>
                  <button type="button" className="sr-forum-reply" onClick={() => setReplyTo(item.id)}>
                    回复
                  </button>
                  {item.authorId === ME && (
                    <button
                      type="button"
                      className="sr-forum-reply"
                      onClick={() => {
                        if (confirm("删除这条评论？")) onDeleteComment(item.id);
                      }}
                    >
                      删除
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {replyPanel}

        <div className="sr-forum-comment-box">
          <input
            className="sr-appear-input"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={replyTo ? "回复这条评论…" : "写下评论…"}
            aria-label="评论"
          />
          {replyTo && (
            <button type="button" className="sr-btn-text" onClick={() => setReplyTo(null)}>
              取消回复
            </button>
          )}
          <button
            type="button"
            className="sr-btn sr-btn-sm sr-btn-primary"
            onClick={() => {
              if (!comment.trim()) return;
              onComment(comment, replyTo ?? undefined);
              setComment("");
              setReplyTo(null);
            }}
          >
            发送
          </button>
        </div>
      </div>

    </div>
  );
}
