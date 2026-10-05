"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronLeft, Compass, Loader2, MessageSquare, PenLine, RotateCw, Search, Square, X } from "lucide-react";

import { loadBooks } from "@/lib/reading-storage";
import type { Book } from "@/lib/reading-types";
import { avatarDataUrl } from "@/lib/study-room/npc-avatar";
import {
  addComment,
  generateForumPosts,
  pickParticipants,
  hidePost,
  loadForum,
  makeFriendFromNpc,
  resolveForumApiConfig,
  saveForum,
  toggleLike,
  unhidePost,
  unmuteNpc,
  type ForumNpc,
  type ForumPost,
  type ForumState,
  type PendingReply,
} from "@/lib/study-room/forum";
import {
  CHANNEL_LABEL,
  FEED_REFRESH_KEY,
  applyComment,
  blockNpc,
  channelPosts,
  clearPostReplies,
  consumeReply,
  dedupePosts,
  deleteOwnComment,
  dueReplies,
  ensureSeeded,
  feedRefreshDue,
  generateComment,
  normalizeRules,
  pickFeedTopic,
  type CommentResult,
  isFollowing,
  markNotificationsRead,
  pushNotification,
  scheduleReplies,
  searchForum,
  toggleCollect,
  toggleFollowNpc,
  toggleStarNpc,
  isStarred,
  unreadNotifications,
  type ForumChannel,
} from "@/lib/study-room/forum-social";
import { GiftSheet } from "./gift-sheet";
import { StudyRoomForumCompose } from "./study-room-forum-compose";
import { StudyRoomForumDrawer } from "./study-room-forum-drawer";
import { StudyRoomForumPostCard, StudyRoomForumPostView } from "./study-room-forum-post";
import { StudyRoomForumProfile } from "./study-room-forum-profile";
import { StudyRoomForumSettings } from "./study-room-forum-settings";

type StudyRoomForumProps = {
  onOpenNpcPanel: () => void;
  onOpenBook: (book: Book) => void;
  /** 进入「我的」（用户主页复用书房既有的我的） */
  onOpenMine: () => void;
  /** 从「我的主页」点动态卡进来时直接打开原帖 */
  initialPostId?: string;
};

const ME = "user";
/** 停留在书友圈时多久看一次排队的回应（离开书友圈就不再生成，回来后接着来）。 */
const REPLY_TICK_MS = 8_000;

/** 书友回应出的问题：没配模型（排队的回应保留），或某一条生成失败（可重试）。 */
type ReplyIssue =
  | { kind: "no-api" }
  | { kind: "error"; postId: string; npcName: string; message: string; reply: PendingReply };

function openApiSettings() {
  // 复用宿主的设置应用，直接打开「API 设置」页
  window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "settings", settingsPage: "api" } }));
}

function shortError(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text || "未知原因";
}

/**
 * 书友圈：进来就是能读的信息流。
 * 普通用户不需要先写话题或提示词：书友与内容会自己生成和维护；
 * 想看什么就搜、想说什么就发，其余交给书友按人设回应。
 */
export function StudyRoomForum({ onOpenNpcPanel, onOpenBook, onOpenMine, initialPostId }: StudyRoomForumProps) {
  const [state, setState] = useState<ForumState>(() => loadForum());
  const [channel, setChannel] = useState<ForumChannel>("recommend");
  const [view, setView] = useState<
    | { kind: "feed" }
    | { kind: "post"; postId: string }
    | { kind: "compose"; draftId?: string }
    | { kind: "profile"; npcId: string }
    | { kind: "search"; query: string }
    | { kind: "settings" }
  >(() => (initialPostId ? { kind: "post", postId: initialPostId } : { kind: "feed" }));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [giftTarget, setGiftTarget] = useState<{ postId: string; npcId?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  /** 正在「打字」的书友：真实的进行中请求，停止即中断 */
  const [typing, setTyping] = useState<{ postId: string; npcName: string } | null>(null);
  const [replyIssue, setReplyIssue] = useState<ReplyIssue | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const feedAbortRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const books = useMemo(() => {
    const map: Record<string, Book> = {};
    for (const book of loadBooks()) map[book.id] = book;
    return map;
  }, []);

  const mutate = useCallback((updater: (prev: ForumState) => ForumState) => {
    setState((prev) => {
      const next = updater(prev);
      saveForum(next);
      return next;
    });
  }, []);

  const flash = useCallback((message: string, ms = 2600) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), ms);
  }, []);

  /**
   * 刷新首页：请几位书友按「热门话题」各发一条新帖。
   * 过程可见、可停止；没配模型就引导去设置，失败就如实说并给重试。
   */
  const refreshFeed = useCallback(
    async (auto: boolean) => {
      if (feedAbortRef.current) return;
      const current = loadForum();
      const active = current.npcs.filter((npc) => !current.mutedNpcIds.includes(npc.id));
      if (active.length === 0) {
        if (!auto) flash("书友圈里还没有能发帖的书友，先去「书友管理」请几位");
        return;
      }
      if (!resolveForumApiConfig()) {
        setReplyIssue({ kind: "no-api" });
        return;
      }
      const controller = new AbortController();
      feedAbortRef.current = controller;
      setBusy("feed");
      setFeedError(null);
      try {
        const rules = normalizeRules(current.rules);
        const topic = pickFeedTopic(current);
        const participants = pickParticipants(current, topic, Math.max(2, Math.min(rules.feedCount, 4)));
        const created = await generateForumPosts(current, topic, participants, controller.signal);
        if (controller.signal.aborted) return;
        const fresh = dedupePosts(loadForum().posts, created).slice(0, Math.max(1, rules.feedCount));
        const stamp = new Date().toISOString();
        mutate((prev) => ({
          ...prev,
          posts: [...dedupePosts(prev.posts, fresh), ...prev.posts],
          generatedAt: { ...prev.generatedAt, [FEED_REFRESH_KEY]: stamp },
        }));
        if (!auto || fresh.length === 0) {
          flash(fresh.length > 0 ? `书友们发了 ${fresh.length} 条新帖` : "这次的内容和已有帖子重复了，没有加进来");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setFeedError(shortError(error instanceof Error ? error.message : String(error)));
        }
      } finally {
        if (feedAbortRef.current === controller) feedAbortRef.current = null;
        setBusy((value) => (value === "feed" ? null : value));
      }
    },
    [flash, mutate],
  );

  const stopFeed = () => {
    feedAbortRef.current?.abort();
    feedAbortRef.current = null;
    setBusy((value) => (value === "feed" ? null : value));
    flash("已停止，这次没有新帖");
  };

  // 首次进入：没有书友就先建一批（本地生成，不依赖 API）；
  // 没有帖子、或很久没刷新过，就请书友们发几条新帖（只在打开书友圈时进行）
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const { state: seeded, created } = ensureSeeded(loadForum());
    if (created > 0) {
      saveForum(seeded);
      setState(seeded);
    }
    if (initialPostId) return;
    if (seeded.posts.length === 0 || feedRefreshDue(seeded)) void refreshFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 排队的书友回应：到点就生成一条。一次只跑一个请求，过程可见、可停止；
  // 失败的那条留着给重试，没配模型就暂停（回应留在队列里，配置好后接着来）。
  const processDueReplies = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      for (let round = 0; round < 2; round += 1) {
        const current = loadForum();
        const reply = dueReplies(current)[0];
        if (!reply) return;
        const post = current.posts.find((item) => item.id === reply.postId);
        const npc = current.npcs.find((item) => item.id === reply.npcId);
        if (!post || !npc || current.mutedNpcIds.includes(npc.id)) {
          mutate((prev) => consumeReply(prev, reply.id));
          continue;
        }
        if (!resolveForumApiConfig()) {
          setReplyIssue({ kind: "no-api" });
          return;
        }
        const controller = new AbortController();
        replyAbortRef.current = controller;
        setTyping({ postId: post.id, npcName: npc.nickname });
        let result: CommentResult;
        try {
          result = await generateComment(post, npc, normalizeRules(current.rules), controller.signal);
        } catch (error) {
          result = { status: "error", message: error instanceof Error ? error.message : String(error) };
        } finally {
          setTyping(null);
          if (replyAbortRef.current === controller) replyAbortRef.current = null;
        }
        if (controller.signal.aborted) return;
        if (result.status === "ok") {
          const body = result.body;
          mutate((prev) => applyComment(prev, reply, body));
          setReplyIssue((issue) => (issue?.kind === "no-api" ? null : issue));
        } else if (result.status === "no-api") {
          setReplyIssue({ kind: "no-api" });
          return;
        } else {
          // 失败的这条先移出队列（避免一直重复失败），保留下来给用户手动重试
          mutate((prev) => consumeReply(prev, reply.id));
          setReplyIssue({ kind: "error", postId: post.id, npcName: npc.nickname, message: shortError(result.message), reply });
          return;
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [mutate]);

  useEffect(() => {
    const timer = window.setInterval(() => void processDueReplies(), REPLY_TICK_MS);
    const initial = window.setTimeout(() => void processDueReplies(), 2500);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initial);
    };
  }, [processDueReplies]);

  // 离开书友圈：进行中的请求一并中断（排队的回应留着，回来后接着生成）
  useEffect(
    () => () => {
      replyAbortRef.current?.abort();
      feedAbortRef.current?.abort();
    },
    [],
  );

  /** 停止某条帖子的回应：中断正在输入的那位，并取消剩下排队的。 */
  const stopReplies = (postId: string) => {
    if (typing?.postId === postId) replyAbortRef.current?.abort();
    setTyping((value) => (value?.postId === postId ? null : value));
    mutate((prev) => clearPostReplies(prev, postId));
    flash("已停止，这条帖子剩下的回应不再生成");
  };

  const retryReply = () => {
    if (replyIssue?.kind !== "error") return;
    const reply: PendingReply = { ...replyIssue.reply, dueAt: new Date().toISOString() };
    mutate((prev) => ({
      ...prev,
      pendingReplies: [...prev.pendingReplies.filter((item) => item.id !== reply.id), reply],
    }));
    setReplyIssue(null);
    window.setTimeout(() => void processDueReplies(), 300);
  };

  /** 用户主动请书友回应（不受「自动回复」开关影响，人数与上限照旧）。 */
  const requestReplies = (postId: string) => {
    if (!resolveForumApiConfig()) {
      setReplyIssue({ kind: "no-api" });
      return;
    }
    const before = loadForum();
    const planned = scheduleReplies(before, postId, { manual: true, soon: true });
    if (planned.pendingReplies.length === before.pendingReplies.length) {
      flash("这条帖子里书友已经聊得够多了，换一条试试");
      return;
    }
    mutate((prev) => scheduleReplies(prev, postId, { manual: true, soon: true }));
    window.setTimeout(() => void processDueReplies(), 1800);
  };

  /** 发帖或评论后：按「自动回复」设置安排书友回应，并如实说明什么时候会出现。 */
  const afterUserActivity = (postId: string, done: string) => {
    const current = loadForum();
    if (current.rules.autoReply === false) {
      flash(`${done}。自动回复已关闭，想听书友说什么可以点「请书友回应」`, 3600);
      return;
    }
    if (!resolveForumApiConfig()) {
      setReplyIssue({ kind: "no-api" });
      flash(done);
      return;
    }
    mutate((prev) => scheduleReplies(prev, postId));
    flash(`${done}。停留在书友圈时，书友会陆续回应；离开后暂停，回来接着来`, 3600);
  };

  const handleBlock = (npcId: string) => {
    const npc = state.npcs.find((item) => item.id === npcId);
    mutate((prev) => blockNpc(prev, npcId));
    flash(`已屏蔽 ${npc?.nickname ?? "这位书友"}，可以在「书友管理」里解除`);
  };

  const handleLike = (post: ForumPost) => {
    const liked = post.likedBy.includes(ME);
    mutate((prev) => toggleLike(prev, post.id, ME));
    if (!liked && post.authorId !== ME) {
      mutate((prev) =>
        pushNotification(prev, {
          kind: "like",
          fromId: post.authorId,
          fromName: post.authorName,
          postId: post.id,
        }),
      );
    }
  };

  const handleComment = (post: ForumPost, body: string, replyToId?: string) => {
    const text = body.trim();
    if (!text) return;
    mutate((prev) =>
      addComment(prev, post.id, {
        id: `fc_user_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        authorId: ME,
        authorName: "我",
        authorKind: "user",
        body: text,
        replyToId,
        createdAt: new Date().toISOString(),
      }),
    );
    // 用户参与后，按设置安排书友错时回应
    afterUserActivity(post.id, "已评论");
  };

  const handleFollow = (npc: ForumNpc) => {
    const following = isFollowing(state, npc.id);
    mutate((prev) => toggleFollowNpc(prev, npc.id));
    flash(following ? `已取消关注 ${npc.nickname}` : `已关注 ${npc.nickname}`);
  };

  const handleAddFriend = async (npc: ForumNpc) => {
    setBusy(npc.id);
    try {
      const result = await makeFriendFromNpc(state, npc);
      if (result.created) {
        mutate((prev) => ({
          ...prev,
          npcs: prev.npcs.map((item) =>
            item.id === npc.id ? { ...item, characterId: result.characterId, source: "character" } : item,
          ),
        }));
      }
      flash(result.alreadyFriend ? `${npc.nickname} 本来就在聊天好友里` : `已把 ${npc.nickname} 加为好友，去聊天应用里找 TA`);
    } finally {
      setBusy(null);
    }
  };

  const handleOpenChat = (npc: ForumNpc) => {
    if (!npc.characterId) {
      flash("先加为好友才能在聊天里找到 TA");
      return;
    }
    // 复用宿主的聊天应用：直接跳到这个角色的会话
    void import("@/lib/chat-storage").then(({ loadChatContacts, createOrGetSession, addChatContact }) => {
      let contact = loadChatContacts().find((item) => item.characterId === npc.characterId);
      if (!contact) contact = addChatContact(npc.characterId!) ?? undefined;
      if (!contact) {
        flash("聊天里还没加上这位好友");
        return;
      }
      const session = createOrGetSession(contact.id);
      window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "chat", sessionId: session.id } }));
    });
  };

  const posts = useMemo(() => channelPosts(state, channel), [state, channel]);

  const hiddenInFeed = useMemo(
    () => channelPosts({ ...state, hiddenPostIds: [] }, channel).filter((post) => state.hiddenPostIds.includes(post.id)),
    [state, channel],
  );

  const unread = unreadNotifications(state);

  /** 没配模型时的提示：如实说明，并给出去设置的入口。 */
  const noApiCard =
    replyIssue?.kind === "no-api" ? (
      <div className="sr-note-card">
        <div className="sr-note-meta" style={{ lineHeight: 1.7 }}>
          还没有配置模型 API，书友暂时没法发帖和回应。配置好后回到这里，排队的回应会接着出现。
        </div>
        <div className="sr-css-actions">
          <button type="button" className="sr-btn-text" onClick={() => setReplyIssue(null)}>
            知道了
          </button>
          <button type="button" className="sr-chip" data-active="true" onClick={openApiSettings}>
            去设置模型
          </button>
        </div>
      </div>
    ) : null;

  /** 帖子详情里的书友回应状态：正在输入 / 排队中 / 失败重试 / 请书友回应。 */
  const renderReplyPanel = (postId: string) => {
    const queued = state.pendingReplies.filter((item) => item.postId === postId).length;
    const typingHere = typing?.postId === postId ? typing : null;
    const failed = replyIssue?.kind === "error" && replyIssue.postId === postId ? replyIssue : null;
    return (
      <div className="sr-forum-reply-panel" style={{ margin: "10px 0" }}>
        {noApiCard}
        {failed && (
          <div className="sr-note-card">
            <div className="sr-note-meta" style={{ lineHeight: 1.7 }}>
              {failed.npcName} 没回上来：{failed.message}
            </div>
            <div className="sr-css-actions">
              <button type="button" className="sr-btn-text" onClick={() => setReplyIssue(null)}>
                算了
              </button>
              <button type="button" className="sr-chip" data-active="true" onClick={retryReply}>
                <RotateCw size={13} strokeWidth={1.8} />
                重试
              </button>
            </div>
          </div>
        )}
        {typingHere || queued > 0 ? (
          <div className="sr-css-actions" style={{ alignItems: "center" }}>
            <span className="sr-note-meta" style={{ marginRight: "auto", lineHeight: 1.6 }}>
              {typingHere ? (
                <>
                  <Loader2 size={12} className="sr-spin" /> {typingHere.npcName} 正在输入…
                </>
              ) : (
                `还有 ${queued} 位书友准备回应（停留在书友圈时陆续出现，离开后暂停）`
              )}
            </span>
            <button type="button" className="sr-btn sr-btn-sm" onClick={() => stopReplies(postId)}>
              <Square size={12} strokeWidth={1.8} />
              停止回应
            </button>
          </div>
        ) : (
          !failed && (
            <div className="sr-css-actions">
              <button type="button" className="sr-btn sr-btn-sm" onClick={() => requestReplies(postId)}>
                <MessageSquare size={13} strokeWidth={1.8} />
                请书友回应
              </button>
            </div>
          )
        )}
      </div>
    );
  };

  // ── 子视图 ──
  if (view.kind === "compose") {
    return (
      <StudyRoomForumCompose
        state={state}
        draftId={view.draftId}
        onClose={() => setView({ kind: "feed" })}
        onMutate={mutate}
        onPublished={(postId) => {
          setView({ kind: "feed" });
          afterUserActivity(postId, "已发布");
        }}
        onNotice={flash}
        onOpenSettings={() => setView({ kind: "settings" })}
      />
    );
  }

  if (view.kind === "settings") {
    return (
      <StudyRoomForumSettings
        state={state}
        onBack={() => setView({ kind: "feed" })}
        onMutate={mutate}
        onNotice={flash}
        onOpenNpcPanel={onOpenNpcPanel}
      />
    );
  }

  if (view.kind === "post") {
    const post = state.posts.find((item) => item.id === view.postId);
    if (!post) {
      return (
        <div className="sr-empty">
          <p>这条帖子已经不在了。</p>
          <button type="button" className="sr-btn" onClick={() => setView({ kind: "feed" })}>返回</button>
        </div>
      );
    }
    return (
      <StudyRoomForumPostView
        post={post}
        state={state}
        books={books}
        onBack={() => setView({ kind: "feed" })}
        onOpenBook={onOpenBook}
        onLike={() => handleLike(post)}
        onComment={(body, replyToId) => handleComment(post, body, replyToId)}
        onCollect={() => mutate((prev) => toggleCollect(prev, post.id))}
        onGift={() => setGiftTarget({ postId: post.id, npcId: post.authorKind === "npc" ? post.authorId : undefined })}
        onOpenAuthor={(npcId) => setView({ kind: "profile", npcId })}
        onEdit={(body) =>
          mutate((prev) => ({
            ...prev,
            posts: prev.posts.map((item) => (item.id === post.id ? { ...item, body } : item)),
          }))
        }
        onDelete={() => {
          mutate((prev) => ({ ...prev, posts: prev.posts.filter((item) => item.id !== post.id) }));
          setView({ kind: "feed" });
          flash("已删除这条帖子");
        }}
        onDeleteComment={(commentId) => {
          mutate((prev) => deleteOwnComment(prev, post.id, commentId));
          flash("已删除这条评论");
        }}
        onBlockAuthor={
          post.authorKind === "npc"
            ? () => {
                handleBlock(post.authorId);
                setView({ kind: "feed" });
              }
            : undefined
        }
        replyPanel={renderReplyPanel(post.id)}
      />
    );
  }

  if (view.kind === "profile") {
    const npc = state.npcs.find((item) => item.id === view.npcId);
    if (!npc) {
      return (
        <div className="sr-empty">
          <p>找不到这位书友。</p>
          <button type="button" className="sr-btn" onClick={() => setView({ kind: "feed" })}>返回</button>
        </div>
      );
    }
    return (
      <StudyRoomForumProfile
        npc={npc}
        state={state}
        onBack={() => setView({ kind: "feed" })}
        onFollow={() => handleFollow(npc)}
        onStar={() => {
          const was = isStarred(state, npc.id);
          mutate((prev) => toggleStarNpc(prev, npc.id));
          flash(was ? `已取消特别关注 ${npc.nickname}` : `已特别关注 ${npc.nickname}`);
        }}
        onAddFriend={() => void handleAddFriend(npc)}
        onChat={() => handleOpenChat(npc)}
        onOpenPost={(postId) => setView({ kind: "post", postId })}
        busy={busy === npc.id}
        onToggleBlock={() => {
          if (state.mutedNpcIds.includes(npc.id)) {
            mutate((prev) => unmuteNpc(prev, npc.id));
            flash(`已解除屏蔽 ${npc.nickname}`);
          } else {
            handleBlock(npc.id);
          }
        }}
      />
    );
  }

  if (view.kind === "search") {
    const result = searchForum(state, view.query);
    return (
      <div className="sr-forum-sub">
        <div className="sr-forum-sub-head">
          <button type="button" className="sr-icon-btn" onClick={() => setView({ kind: "feed" })} aria-label="返回">
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <span className="sr-forum-sub-title">搜索「{view.query}」</span>
        </div>
        <div className="sr-forum-sub-body">
          {result.posts.length + result.npcs.length + result.books.length + result.topics.length === 0 ? (
            <div className="sr-empty">
              <Compass size={38} strokeWidth={1} />
              <p>没有找到相关内容。可以换个关键词，或直接发一条帖子问问书友们。</p>
            </div>
          ) : (
            <>
              {result.npcs.length > 0 && (
                <>
                  <div className="sr-section-label">书友</div>
                  {result.npcs.map((npc) => (
                    <button
                      key={npc.id}
                      type="button"
                      className="sr-forum-row"
                      onClick={() => setView({ kind: "profile", npcId: npc.id })}
                    >
                      <span className="sr-forum-avatar" aria-hidden>
                        {npc.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={npc.avatarUrl} alt="" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarDataUrl(npc.avatar)} alt="" />
                        )}
                      </span>
                      <span className="sr-forum-author-main">
                        <span className="sr-forum-name">{npc.nickname}</span>
                        <span className="sr-note-meta">{npc.occupation}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {result.books.length > 0 && (
                <>
                  <div className="sr-section-label">书籍</div>
                  <div className="sr-chip-row">
                    {result.books.map((title) => (
                      <span key={title} className="sr-chip">《{title}》</span>
                    ))}
                  </div>
                </>
              )}
              {result.topics.length > 0 && (
                <>
                  <div className="sr-section-label">话题</div>
                  <div className="sr-chip-row">
                    {result.topics.map((topic) => (
                      <span key={topic} className="sr-chip">#{topic}</span>
                    ))}
                  </div>
                </>
              )}
              {result.posts.length > 0 && (
                <>
                  <div className="sr-section-label">帖子</div>
                  {result.posts.map((post) => (
                    <StudyRoomForumPostCard
                      key={post.id}
                      post={post}
                      state={state}
                      books={books}
                      onOpen={() => setView({ kind: "post", postId: post.id })}
                      onLike={() => handleLike(post)}
                      onOpenBook={onOpenBook}
                      onOpenAuthor={(npcId) => setView({ kind: "profile", npcId })}
                      onGift={() => setGiftTarget({ postId: post.id, npcId: post.authorKind === "npc" ? post.authorId : undefined })}
                      onHide={() => mutate((prev) => hidePost(prev, post.id))}
                      onBlock={() => handleBlock(post.authorId)}
                      busy={false}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── 信息流 ──
  return (
    <div className="sr-forum">
      <div className="sr-forum-head">
        <button
          type="button"
          className="sr-forum-me"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开个人菜单"
        >
          <span className="sr-forum-avatar" aria-hidden>
            <span>我</span>
          </span>
        </button>
        <form
          className="sr-forum-search"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const input = form.elements.namedItem("q") as HTMLInputElement | null;
            const value = input?.value.trim() ?? "";
            if (value) setView({ kind: "search", query: value });
          }}
        >
          <Search size={15} strokeWidth={1.8} aria-hidden />
          <input name="q" placeholder="搜帖子、书友、书或话题" aria-label="搜索书友圈" />
        </form>
        <button
          type="button"
          className="sr-forum-icon"
          aria-label={`通知${unread.length > 0 ? `（${unread.length} 条未读）` : ""}`}
          onClick={() => {
            setDrawerOpen(true);
            mutate((prev) => markNotificationsRead(prev, ["comment", "reply", "like", "mention"]));
          }}
        >
          <Bell size={19} strokeWidth={1.7} />
          {unread.length > 0 && <i className="sr-forum-dot" aria-hidden />}
        </button>
      </div>

      <div className="sr-chip-row sr-forum-channels">
        {(Object.keys(CHANNEL_LABEL) as ForumChannel[]).map((key) => (
          <button
            key={key}
            type="button"
            className="sr-chip"
            data-active={channel === key ? "true" : undefined}
            onClick={() => setChannel(key)}
          >
            {CHANNEL_LABEL[key]}
          </button>
        ))}
        <button
          type="button"
          className="sr-btn sr-btn-sm"
          onClick={() => void refreshFeed(false)}
          disabled={busy === "feed"}
          aria-label="请书友们发新帖"
        >
          <RotateCw size={13} strokeWidth={1.8} />
          刷新
        </button>
        <button type="button" className="sr-btn sr-btn-sm" onClick={() => setView({ kind: "settings" })}>
          生成规则
        </button>
      </div>

      {notice && (
        <div className="sr-note-card">
          <div className="sr-note-meta">{notice}</div>
        </div>
      )}

      {noApiCard}

      {busy === "feed" && (
        <div className="sr-css-actions" style={{ alignItems: "center" }}>
          <span className="sr-note-meta" style={{ marginRight: "auto", lineHeight: 1.7 }}>
            <Loader2 size={13} className="sr-spin" /> 书友们正在写新帖…
          </span>
          <button type="button" className="sr-btn sr-btn-sm" onClick={stopFeed}>
            <Square size={12} strokeWidth={1.8} />
            停止
          </button>
        </div>
      )}

      {feedError && busy !== "feed" && (
        <div className="sr-note-card">
          <div className="sr-note-meta" style={{ lineHeight: 1.7 }}>新帖没生成出来：{feedError}</div>
          <div className="sr-css-actions">
            <button type="button" className="sr-btn-text" onClick={() => setFeedError(null)}>
              算了
            </button>
            <button type="button" className="sr-chip" data-active="true" onClick={() => void refreshFeed(false)}>
              <RotateCw size={13} strokeWidth={1.8} />
              重试
            </button>
          </div>
        </div>
      )}

      {typing && (
        <div className="sr-css-actions" style={{ alignItems: "center" }}>
          <span className="sr-note-meta" style={{ marginRight: "auto", lineHeight: 1.7 }}>
            <Loader2 size={12} className="sr-spin" /> {typing.npcName} 正在回应一条帖子…
          </span>
          <button type="button" className="sr-btn sr-btn-sm" onClick={() => stopReplies(typing.postId)}>
            <Square size={12} strokeWidth={1.8} />
            停止
          </button>
        </div>
      )}

      {replyIssue?.kind === "error" && (
        <div className="sr-note-card">
          <div className="sr-note-meta" style={{ lineHeight: 1.7 }}>
            {replyIssue.npcName} 没回上来：{replyIssue.message}
          </div>
          <div className="sr-css-actions">
            <button type="button" className="sr-btn-text" onClick={() => setReplyIssue(null)}>
              算了
            </button>
            <button type="button" className="sr-chip" data-active="true" onClick={retryReply}>
              <RotateCw size={13} strokeWidth={1.8} />
              重试
            </button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="sr-empty" style={{ paddingTop: 30 }}>
          {state.npcs.length === 0 ? (
            <>
              <Loader2 size={28} className="sr-spin" />
              <p>正在准备书友…</p>
            </>
          ) : (
            <>
              <PenLine size={38} strokeWidth={1} />
              <p>
                这个频道还没有内容。
                <br />
                点右下角「写帖子」发一条，书友们会来回应；也可以去「书友管理」多请几位书友。
              </p>
            </>
          )}
        </div>
      ) : (
        posts.map((post) => (
          <StudyRoomForumPostCard
            key={post.id}
            post={post}
            state={state}
            books={books}
            onOpen={() => setView({ kind: "post", postId: post.id })}
            onLike={() => handleLike(post)}
            onOpenBook={onOpenBook}
            onOpenAuthor={(npcId) => setView({ kind: "profile", npcId })}
            onGift={() => setGiftTarget({ postId: post.id, npcId: post.authorKind === "npc" ? post.authorId : undefined })}
            onHide={() => mutate((prev) => hidePost(prev, post.id))}
            onBlock={() => handleBlock(post.authorId)}
            busy={false}
          />
        ))
      )}

      {hiddenInFeed.length > 0 && (
        <button
          type="button"
          className="sr-material-toggle"
          onClick={() => setShowHidden((value) => !value)}
        >
          <X size={14} strokeWidth={1.8} />
          {showHidden ? "隐藏已收起的内容" : `已收起 ${hiddenInFeed.length} 条不感兴趣的内容`}
        </button>
      )}
      {showHidden && hiddenInFeed.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {hiddenInFeed.map((post) => (
            <div key={post.id} className="sr-note-card">
              <div className="sr-note-meta">{post.authorName}：{post.body.slice(0, 40)}…</div>
              <button type="button" className="sr-btn sr-btn-sm" onClick={() => mutate((prev) => unhidePost(prev, post.id))}>
                恢复显示
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="sr-forum-fab" onClick={() => setView({ kind: "compose" })} aria-label="写帖子">
        <PenLine size={20} strokeWidth={1.9} />
        <span>写帖子</span>
      </button>

      {drawerOpen && (
        <StudyRoomForumDrawer
          state={state}
          unread={unread}
          onClose={() => setDrawerOpen(false)}
          onMutate={mutate}
          onOpenCompose={(draftId) => setView({ kind: "compose", draftId })}
          onOpenPost={(postId) => setView({ kind: "post", postId })}
          onOpenMine={() => {
            setDrawerOpen(false);
            onOpenMine();
          }}
          onOpenSettings={() => setView({ kind: "settings" })}
          onOpenProfile={(npcId) => {
            setDrawerOpen(false);
            setView({ kind: "profile", npcId });
          }}
          onOpenChat={() => {
            // 私信沿用宿主的聊天应用，不在书房另造一套
            setDrawerOpen(false);
            window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "chat" } }));
          }}
        />
      )}

      {giftTarget && (
        <GiftSheet
          mode="gift"
          postId={giftTarget.postId}
          presetRecipient={giftTarget.npcId ? (() => {
            const npc = state.npcs.find((item) => item.id === giftTarget.npcId);
            return npc ? { id: npc.id, name: npc.nickname, kind: "npc" as const } : undefined;
          })() : undefined}
          onClose={() => setGiftTarget(null)}
        />
      )}
    </div>
  );
}
