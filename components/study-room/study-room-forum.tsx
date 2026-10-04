"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronLeft, Compass, Loader2, PenLine, Search, X } from "lucide-react";

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
  saveForum,
  toggleLike,
  unhidePost,
  type ForumNpc,
  type ForumPost,
  type ForumState,
  type ForumTopic,
} from "@/lib/study-room/forum";
import {
  CHANNEL_LABEL,
  applyComment,
  channelPosts,
  consumeReply,
  dueReplies,
  ensureSeeded,
  generateComment,
  isFollowing,
  markNotificationsRead,
  pushNotification,
  scheduleReplies,
  searchForum,
  toggleCollect,
  toggleFollowNpc,
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
};

const ME = "user";
const REPLY_TICK_MS = 20_000;

/**
 * 书友圈：进来就是能读的信息流。
 * 普通用户不需要先写话题或提示词：书友与内容会自己生成和维护；
 * 想看什么就搜、想说什么就发，其余交给书友按人设回应。
 */
export function StudyRoomForum({ onOpenNpcPanel, onOpenBook, onOpenMine }: StudyRoomForumProps) {
  const [state, setState] = useState<ForumState>(() => loadForum());
  const [channel, setChannel] = useState<ForumChannel>("recommend");
  const [view, setView] = useState<
    | { kind: "feed" }
    | { kind: "post"; postId: string }
    | { kind: "compose"; draftId?: string }
    | { kind: "profile"; npcId: string }
    | { kind: "search"; query: string }
    | { kind: "settings" }
  >({ kind: "feed" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [giftTarget, setGiftTarget] = useState<{ postId: string; npcId?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bootstrappedRef = useRef(false);
  const feedBootstrappedRef = useRef(false);
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

  // 首次进入：没有书友就先建一批（本地生成，不依赖 API）
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const { state: seeded, created } = ensureSeeded(loadForum());
    if (created > 0) {
      saveForum(seeded);
      setState(seeded);
    }
  }, []);

  // 首次进入且还没有帖子：让书友先聊几句（按生成规则里的数量），生成不了就如实说明
  useEffect(() => {
    if (feedBootstrappedRef.current) return;
    const current = loadForum();
    if (current.posts.length > 0 || current.npcs.length === 0) return;
    feedBootstrappedRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      setBusy("feed");
      try {
        const topic: ForumTopic = {
          key: "首页动态",
          label: current.rules.hotTopics.slice(0, 40) || "最近在读什么",
          prompt: current.rules.feedTypes,
        };
        const participants = pickParticipants(current, topic, Math.max(2, Math.min(current.rules.feedCount, 4)));
        const created = await generateForumPosts(current, topic, participants, controller.signal);
        if (controller.signal.aborted) return;
        mutate((prev) => ({ ...prev, posts: [...created.slice(0, Math.max(1, prev.rules.feedCount)), ...prev.posts] }));
      } catch {
        if (!controller.signal.aborted) {
          flash("暂时生成不了初始内容（可能还没绑定模型，或来源暂时不可用）。你可以自己发一条，或到「生成规则」里检查设置。", 4600);
        }
      } finally {
        if (!controller.signal.aborted) setBusy(null);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 计划中的书友评论：到点就生成一条（错时出现，刷新后继续）
  const processDueReplies = useCallback(async () => {
    const current = loadForum();
    const due = dueReplies(current).slice(0, 2);
    if (due.length === 0) return;
    for (const reply of due) {
      const post = current.posts.find((item) => item.id === reply.postId);
      const npc = current.npcs.find((item) => item.id === reply.npcId);
      if (!post || !npc) {
        mutate((prev) => consumeReply(prev, reply.id));
        continue;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const body = await generateComment(post, npc, current.rules, controller.signal);
        if (controller.signal.aborted) return;
        if (!body) {
          mutate((prev) => consumeReply(prev, reply.id));
          continue;
        }
        mutate((prev) => applyComment(prev, reply, body));
      } catch {
        mutate((prev) => consumeReply(prev, reply.id));
      }
    }
  }, [mutate]);

  useEffect(() => {
    const timer = window.setInterval(() => void processDueReplies(), REPLY_TICK_MS);
    const initial = window.setTimeout(() => void processDueReplies(), 4000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initial);
    };
  }, [processDueReplies]);

  useEffect(() => () => abortRef.current?.abort(), []);

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
    // 用户参与后，安排书友在稍后错时回应
    mutate((prev) => scheduleReplies(prev, post.id, 3));
    flash("已评论，书友们过一会儿会陆续回应");
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

  const posts = useMemo(() => {
    const list = channelPosts(state, channel);
    return showHidden ? list : list;
  }, [state, channel, showHidden]);

  const hiddenInFeed = useMemo(
    () => channelPosts({ ...state, hiddenPostIds: [] }, channel).filter((post) => state.hiddenPostIds.includes(post.id)),
    [state, channel],
  );

  const unread = unreadNotifications(state);

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
          mutate((prev) => scheduleReplies(prev, postId, 3));
          flash("已发布，书友们的回应会陆续出现");
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
        onAddFriend={() => void handleAddFriend(npc)}
        onChat={() => handleOpenChat(npc)}
        onOpenPost={(postId) => setView({ kind: "post", postId })}
        busy={busy === npc.id}
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
        <button type="button" className="sr-chip" onClick={() => setView({ kind: "settings" })}>
          生成规则
        </button>
      </div>

      {notice && (
        <div className="sr-note-card">
          <div className="sr-note-meta">{notice}</div>
        </div>
      )}

      {busy === "feed" && (
        <p className="sr-note-meta" style={{ textAlign: "center", lineHeight: 1.7 }}>
          <Loader2 size={13} className="sr-spin" /> 书友们正在开个头…
        </p>
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
              <button type="button" className="sr-chip" onClick={() => mutate((prev) => unhidePost(prev, post.id))}>
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
