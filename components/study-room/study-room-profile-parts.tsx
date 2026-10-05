"use client";

import { Heart, MessageCircle } from "lucide-react";

import { KIND_TEXT, type ForumPost } from "@/lib/study-room/forum";

/** 主页里的统计：只放真实数字，点不了的就不做成按钮。 */
export function ProfileStats({ items }: { items: Array<{ label: string; value: number }> }) {
  return (
    <div className="sr-pf-stats">
      {items.map((item) => (
        <div key={item.label} className="sr-pf-stat">
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 动态横滑卡：有图用第一张图，没图用正文摘要；点开回到原帖。 */
export function PostStrip({
  posts,
  emptyText,
  onOpen,
}: {
  posts: ForumPost[];
  emptyText: string;
  onOpen?: (postId: string) => void;
}) {
  if (posts.length === 0) return <p className="sr-pf-empty">{emptyText}</p>;
  return (
    <div className="sr-pf-strip" role="list">
      {posts.map((post) => {
        const cover = post.images?.[0];
        return (
          <button
            key={post.id}
            type="button"
            role="listitem"
            className="sr-pf-card"
            onClick={() => onOpen?.(post.id)}
            disabled={!onOpen}
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sr-pf-card-img" src={cover} alt="" />
            ) : (
              <span className="sr-pf-card-text">{post.body.slice(0, 80)}</span>
            )}
            <span className="sr-pf-card-foot">
              <span className="sr-pf-card-kind">{KIND_TEXT[post.kind]}</span>
              <span className="sr-pf-card-title">
                {post.title || (post.bookTitle ? `《${post.bookTitle}》` : post.body.slice(0, 16))}
              </span>
              <span className="sr-pf-card-meta">
                <Heart size={11} strokeWidth={1.8} /> {post.likedBy.length}
                <MessageCircle size={11} strokeWidth={1.8} /> {post.comments.length}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 两列作品 / 书单：没有封面时用文字封面。 */
export function TwoColumnGrid({
  items,
  emptyText,
}: {
  items: Array<{ key: string; title: string; meta?: string; onOpen?: () => void }>;
  emptyText: string;
}) {
  if (items.length === 0) return <p className="sr-pf-empty">{emptyText}</p>;
  return (
    <div className="sr-pf-grid">
      {items.map((item) => (
        <button key={item.key} type="button" className="sr-pf-tile" onClick={item.onOpen} disabled={!item.onOpen}>
          <span className="sr-pf-tile-cover">{item.title.slice(0, 12)}</span>
          <span className="sr-pf-tile-title">{item.title}</span>
          {item.meta && <span className="sr-pf-tile-meta">{item.meta}</span>}
        </button>
      ))}
    </div>
  );
}
