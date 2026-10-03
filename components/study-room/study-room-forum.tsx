"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  MessageSquare,
  PenLine,
  Send,
  Sparkles,
  Square,
  Users,
  EyeOff,
  BookOpen,
  Gift,
} from "lucide-react";

import { loadBooks } from "@/lib/reading-storage";
import type { Book } from "@/lib/reading-types";
import { avatarDataUrl } from "@/lib/study-room/npc-avatar";
import { GiftSheet } from "./gift-sheet";
import {
  KIND_TEXT,
  addComment,
  addPost,
  generateForumPosts,
  hidePost,
  loadForum,
  muteNpc,
  pickParticipants,
  saveForum,
  topicCooldownRemaining,
  toggleLike,
  unhidePost,
  type ForumNpc,
  type ForumPost,
  type ForumState,
  type ForumTopic,
} from "@/lib/study-room/forum";

const ME = "user";

type StudyRoomForumProps = {
  onOpenNpcPanel: () => void;
  onOpenBook: (book: Book) => void;
};

type Draft = { kind: ForumPost["kind"]; title: string; body: string; bookTitle: string; spoiler: boolean };

const EMPTY_DRAFT: Draft = { kind: "post", title: "", body: "", bookTitle: "", spoiler: false };

export function StudyRoomForum({ onOpenNpcPanel, onOpenBook }: StudyRoomForumProps) {
  const [state, setState] = useState<ForumState>(() => loadForum());
  const [filter, setFilter] = useState<"all" | ForumPost["kind"]>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [topicLabel, setTopicLabel] = useState("");
  const [topicPrompt, setTopicPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  // 含剧透的发言默认糊住，点开才显示
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string>>({});
  // 给某个帖子/某位书友送礼
  const [giftTarget, setGiftTarget] = useState<{ postId: string; npcId?: string; bookTitle?: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const books = useMemo(() => {
    const map: Record<string, Book> = {};
    for (const book of loadBooks()) map[book.id] = book;
    return map;
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const save = (next: ForumState) => {
    setState(next);
    saveForum(next);
  };

  const flash = (message: string, ms = 2400) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), ms);
  };

  const npcById = useMemo(() => {
    const map: Record<string, ForumNpc> = {};
    for (const npc of state.npcs) map[npc.id] = npc;
    return map;
  }, [state.npcs]);

  const visiblePosts = useMemo(() => {
    return state.posts
      .filter((post) => (showHidden ? true : !state.hiddenPostIds.includes(post.id)))
      .filter((post) => (filter === "all" ? true : post.kind === filter))
      .filter((post) => !(post.authorKind === "npc" && state.mutedNpcIds.includes(post.authorId)))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [state.posts, state.hiddenPostIds, state.mutedNpcIds, filter, showHidden]);

  const mutedCount = state.mutedNpcIds.length;
  const hiddenCount = state.hiddenPostIds.length;

  const handlePost = () => {
    const body = draft.body.trim();
    if (!body) {
      flash("先写点内容");
      return;
    }
    const post: ForumPost = {
      id: `fp_user_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      authorId: ME,
      authorName: "我",
      authorKind: "user",
      kind: draft.kind,
      title: draft.title.trim() || undefined,
      body,
      bookTitle: draft.bookTitle.trim() || undefined,
      spoiler: draft.spoiler,
      likedBy: [],
      comments: [],
      generated: false,
      createdAt: new Date().toISOString(),
    };
    save(addPost(state, post));
    setDraft(EMPTY_DRAFT);
    setComposing(false);
    flash("已发布");
  };

  const runGenerate = async () => {
    const label = topicLabel.trim() || draft.bookTitle.trim();
    if (!label) {
      flash("先说说想让大家聊什么");
      return;
    }
    if (state.npcs.length === 0) {
      flash("书友圈还没有人，先去「书友管理」生成几位书友", 3000);
      return;
    }
    const topic: ForumTopic = { key: label, label, prompt: topicPrompt.trim() || undefined };
    const remaining = topicCooldownRemaining(state, topic.key);
    if (remaining > 0 && !confirm(`这个话题刚聊过（约 ${Math.ceil(remaining / 60000)} 分钟内不建议重复），还要再来一轮？`)) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    try {
      const participants = pickParticipants(state, topic, 3);
      const posts = await generateForumPosts(state, topic, participants, controller.signal);
      const next: ForumState = {
        ...state,
        posts: [...posts, ...state.posts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        generatedAt: { ...state.generatedAt, [topic.key]: new Date().toISOString() },
      };
      save(next);
      setTopicLabel("");
      setTopicPrompt("");
      flash(`${participants.map((p) => p.nickname).join("、")} 聊了几句`, 3000);
    } catch (err) {
      if ((err as Error).name === "AbortError") flash("已停止生成");
      else flash((err as Error).message || "生成失败，可以重试", 3600);
    } finally {
      setGenerating(false);
    }
  };

  const handleComment = (post: ForumPost) => {
    const body = (commentDrafts[post.id] ?? "").trim();
    if (!body) return;
    const comment = {
      id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      authorId: ME,
      authorName: "我",
      authorKind: "user" as const,
      body,
      replyToId: replyTo[post.id],
      createdAt: new Date().toISOString(),
    };
    save(addComment(state, post.id, comment));
    setCommentDrafts((prev) => ({ ...prev, [post.id]: "" }));
    setReplyTo((prev) => ({ ...prev, [post.id]: "" }));
  };

  return (
    <div>
      <div className="sr-forum-head">
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--c-text-title)" }}>{state.name}</div>
          <div className="sr-note-meta">
            {state.npcs.length} 位书友 · {state.posts.length} 条发言
            {mutedCount > 0 ? ` · 已屏蔽 ${mutedCount} 人` : ""}
          </div>
        </div>
        <button type="button" className="sr-btn" onClick={onOpenNpcPanel}>
          <Users size={16} strokeWidth={1.7} />
          书友管理
        </button>
      </div>

      {notice && (
        <div className="sr-note-card">
          <div className="sr-note-meta">{notice}</div>
        </div>
      )}

      <div className="sr-chip-row">
        <button type="button" className="sr-chip" onClick={() => setComposing((v) => !v)}>
          <PenLine size={13} strokeWidth={1.8} style={{ marginRight: 5 }} />
          我要发言
        </button>
        {(["all", "post", "review", "recommend"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className="sr-chip"
            data-active={filter === key ? "true" : undefined}
            onClick={() => setFilter(key)}
          >
            {key === "all" ? "全部" : KIND_TEXT[key]}
          </button>
        ))}
        {(hiddenCount > 0 || showHidden) && (
          <button type="button" className="sr-chip" data-active={showHidden ? "true" : undefined} onClick={() => setShowHidden((v) => !v)}>
            <EyeOff size={13} strokeWidth={1.8} style={{ marginRight: 5 }} />
            {showHidden ? "隐藏已收起" : `已收起 ${hiddenCount} 条`}
          </button>
        )}
      </div>

      {composing && (
        <div className="sr-note-card">
          <div className="sr-chip-row" style={{ marginBottom: 8 }}>
            {(["post", "review", "recommend"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className="sr-chip"
                data-active={draft.kind === kind ? "true" : undefined}
                onClick={() => setDraft((prev) => ({ ...prev, kind }))}
              >
                {KIND_TEXT[kind]}
              </button>
            ))}
            <button
              type="button"
              className="sr-chip"
              data-active={draft.spoiler ? "true" : undefined}
              onClick={() => setDraft((prev) => ({ ...prev, spoiler: !prev.spoiler }))}
            >
              含剧透
            </button>
          </div>
          <input
            className="sr-appear-input"
            style={{ width: "100%", marginBottom: 8 }}
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="标题（可留空）"
            aria-label="帖子标题"
          />
          <input
            className="sr-appear-input"
            style={{ width: "100%", marginBottom: 8 }}
            value={draft.bookTitle}
            onChange={(e) => setDraft((prev) => ({ ...prev, bookTitle: e.target.value }))}
            placeholder="关联书籍（可留空，书架以外的书也能写）"
            aria-label="关联书籍"
          />
          <textarea
            className="sr-css-editor"
            rows={4}
            value={draft.body}
            onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
            placeholder="想说什么…"
            aria-label="帖子正文"
          />
          <div className="sr-css-actions">
            <button type="button" className="sr-btn sr-btn-primary" onClick={handlePost}>
              <Send size={15} strokeWidth={1.8} />
              发布
            </button>
            <button type="button" className="sr-btn" onClick={() => setComposing(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      <div className="sr-note-card">
        <div className="sr-note-meta" style={{ marginBottom: 8, lineHeight: 1.7 }}>
          让书友们聊聊：一次只为这个话题生成几条发言，可以随时停止；同一话题十分钟内不会重复生成。
        </div>
        <input
          className="sr-appear-input"
          style={{ width: "100%", marginBottom: 8 }}
          value={topicLabel}
          onChange={(e) => setTopicLabel(e.target.value)}
          placeholder="话题，例如「最近读到的结尾」或书名"
          aria-label="话题"
        />
        <textarea
          className="sr-css-editor"
          rows={2}
          value={topicPrompt}
          onChange={(e) => setTopicPrompt(e.target.value)}
          placeholder="想让他们聊什么（可留空）"
          aria-label="话题补充"
        />
        <div className="sr-css-actions">
          {generating ? (
            <button type="button" className="sr-btn" onClick={() => abortRef.current?.abort()}>
              <Square size={15} strokeWidth={2} />
              停止
            </button>
          ) : (
            <button type="button" className="sr-btn sr-btn-primary" onClick={() => void runGenerate()}>
              <Sparkles size={15} strokeWidth={1.7} />
              让书友聊聊
            </button>
          )}
        </div>
      </div>

      {visiblePosts.length === 0 ? (
        <div className="sr-empty" style={{ paddingTop: 28 }}>
          <Users size={40} strokeWidth={1} />
          <p>
            {state.posts.length === 0
              ? "还没有人发言。可以先「书友管理」生成几位书友，或者自己发第一条。"
              : "当前筛选下没有内容。"}
          </p>
        </div>
      ) : (
        visiblePosts.map((post) => {
          const npc = npcById[post.authorId];
          const avatar = post.authorKind === "user" ? undefined : npc?.avatarUrl ?? (npc ? avatarDataUrl(npc.avatar) : undefined);
          const liked = post.likedBy.includes(ME);
          const hidden = state.hiddenPostIds.includes(post.id);
          const book = post.bookId ? books[post.bookId] : undefined;
          return (
            <div key={post.id} className="sr-note-card" data-source={post.authorKind === "npc" ? "character" : undefined}>
              <div className="sr-forum-author">
                <span className="sr-forum-avatar" aria-hidden>
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" />
                  ) : (
                    <span>{(post.authorName || "我").slice(0, 1)}</span>
                  )}
                </span>
                <span className="sr-forum-author-main">
                  <span className="sr-forum-name">{post.authorName}</span>
                  <span className="sr-note-meta">
                    {KIND_TEXT[post.kind]}
                    {post.generated ? " · AI" : ""} · {new Date(post.createdAt).toLocaleString("zh-CN")}
                  </span>
                </span>
                {post.authorKind === "npc" && npc && (
                  <button
                    type="button"
                    className="sr-note-tool"
                    title={`屏蔽 ${npc.nickname}`}
                    onClick={() => {
                      if (!confirm(`屏蔽 ${npc.nickname}？TA 的发言之后不再显示。`)) return;
                      save(muteNpc(state, npc.id));
                      flash(`已屏蔽 ${npc.nickname}`);
                    }}
                  >
                    <EyeOff size={15} strokeWidth={1.7} />
                  </button>
                )}
              </div>

              {post.title && <p className="sr-forum-title">{post.title}</p>}
              {post.spoiler && !revealed[post.id] && (
                <button
                  type="button"
                  className="sr-forum-spoiler"
                  onClick={() => setRevealed((prev) => ({ ...prev, [post.id]: true }))}
                >
                  含剧透 · 点开查看
                </button>
              )}
              <p className="sr-forum-body" data-spoiler={post.spoiler && !revealed[post.id] ? "true" : undefined}>
                {post.body}
              </p>

              {post.bookTitle && (
                <div className="sr-forum-book">
                  <BookOpen size={13} strokeWidth={1.8} />
                  {book ? (
                    <button type="button" className="sr-forum-book-btn" onClick={() => onOpenBook(book)}>
                      在书房读《{post.bookTitle}》
                    </button>
                  ) : (
                    <span className="sr-note-meta">《{post.bookTitle}》· 不在书架上</span>
                  )}
                </div>
              )}

              <div className="sr-note-foot">
                <span className="sr-note-tools">
                  <button
                    type="button"
                    className="sr-note-tool"
                    title={liked ? "取消赞同" : "赞同"}
                    data-active={liked ? "true" : undefined}
                    onClick={() => save(toggleLike(state, post.id, ME))}
                  >
                    <Heart size={15} strokeWidth={1.7} fill={liked ? "currentColor" : "none"} />
                    {post.likedBy.length > 0 ? <span className="sr-forum-count">{post.likedBy.length}</span> : null}
                  </button>
                  <button
                    type="button"
                    className="sr-note-tool"
                    title="给这条发言送礼"
                    onClick={() =>
                      setGiftTarget({
                        postId: post.id,
                        npcId: post.authorKind === "npc" ? post.authorId : undefined,
                        bookTitle: post.bookTitle,
                      })
                    }
                  >
                    <Gift size={15} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    className="sr-note-tool"
                    title={hidden ? "恢复显示" : "不感兴趣"}
                    onClick={() => save(hidden ? unhidePost(state, post.id) : hidePost(state, post.id))}
                  >
                    <EyeOff size={15} strokeWidth={1.7} />
                  </button>
                </span>
                <span className="sr-note-meta">{post.comments.length > 0 ? `${post.comments.length} 条评论` : "还没有评论"}</span>
              </div>

              {post.comments.length > 0 && (
                <ul className="sr-forum-comments">
                  {post.comments.map((comment) => {
                    const target = comment.replyToId ? post.comments.find((item) => item.id === comment.replyToId) : undefined;
                    return (
                      <li key={comment.id}>
                        <span className="sr-forum-comment-author">{comment.authorName}</span>
                        {target ? <span className="sr-note-meta">回复 {target.authorName}：</span> : null}
                        <span className="sr-forum-comment-body">{comment.body}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="sr-forum-comment-box">
                <input
                  className="sr-appear-input"
                  value={commentDrafts[post.id] ?? ""}
                  onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                  placeholder={replyTo[post.id] ? `回复 ${post.comments.find((c) => c.id === replyTo[post.id])?.authorName ?? ""}…` : "写下评论…"}
                  aria-label="评论"
                />
                {replyTo[post.id] && (
                  <button type="button" className="sr-chip" onClick={() => setReplyTo((prev) => ({ ...prev, [post.id]: "" }))}>
                    取消回复
                  </button>
                )}
                <button type="button" className="sr-chip" onClick={() => handleComment(post)}>
                  <MessageSquare size={13} strokeWidth={1.8} style={{ marginRight: 4 }} />
                  发送
                </button>
              </div>
            </div>
          );
        })
      )}

      {giftTarget && (
        <GiftSheet
          mode="gift"
          postId={giftTarget.postId}
          presetRecipient={
            giftTarget.npcId
              ? (() => {
                  const npc = npcById[giftTarget.npcId!];
                  return npc ? { id: npc.id, name: npc.nickname, kind: "npc" as const } : undefined;
                })()
              : undefined
          }
          onClose={() => setGiftTarget(null)}
        />
      )}
    </div>
  );
}
