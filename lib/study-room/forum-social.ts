// lib/study-room/forum-social.ts — 书友圈的互动层：频道、关注、通知、草稿、评论计划与生成规则。
//
// 原则：
//  - 所有互动都是真实状态并持久化（点赞、关注、收藏、通知、草稿、待回复计划）；
//  - 书友按人设持续发言，刷新只补充新内容，不推倒重来；
//  - 生成规则可编辑，但默认开箱可用；生成按需触发、可停止、带冷却。

import { simpleLLMCall } from "@/lib/api-helpers";
import { avatarFromKey } from "./npc-avatar";
import {
  DEFAULT_FORUM_RULES,
  generateNpc,
  pickParticipants,
  resolveForumApiConfig,
  type ForumComment,
  type ForumDraft,
  type ForumNpc,
  type ForumNotification,
  type ForumPost,
  type ForumRules,
  type ForumState,
  type ForumTopic,
  type PendingReply,
} from "./forum";

const USER_ID = "user";

// ── 生成规则 ──

export function updateForumRules(state: ForumState, patch: Partial<ForumRules>): ForumState {
  return { ...state, rules: { ...state.rules, ...patch } };
}

export function singleDefaultRule<K extends keyof ForumRules>(key: K): ForumRules[K] {
  return DEFAULT_FORUM_RULES[key];
}

/** 规则里用户写得比较随意，这里做一次规整，避免空值把提示词弄坏。 */
export function normalizeRules(rules: ForumRules): ForumRules {
  const clamp = (value: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.min(Math.max(Math.round(value), min), max) : min;
  return {
    ...rules,
    feedTypes: rules.feedTypes?.trim() || DEFAULT_FORUM_RULES.feedTypes,
    feedCount: clamp(Number(rules.feedCount), 1, 8),
    feedScope: rules.feedScope?.trim() || DEFAULT_FORUM_RULES.feedScope,
    searchScope: rules.searchScope?.trim() || DEFAULT_FORUM_RULES.searchScope,
    commentLength: rules.commentLength?.trim() || DEFAULT_FORUM_RULES.commentLength,
    commentTone: rules.commentTone?.trim() || DEFAULT_FORUM_RULES.commentTone,
    commentRelation: rules.commentRelation?.trim() || DEFAULT_FORUM_RULES.commentRelation,
    commentFollowUp: rules.commentFollowUp !== false,
    dailyPosts: clamp(Number(rules.dailyPosts), 0, 12),
    dailyLikes: clamp(Number(rules.dailyLikes), 0, 40),
    dailyFollows: clamp(Number(rules.dailyFollows), 0, 10),
    dailyGifts: clamp(Number(rules.dailyGifts), 0, 10),
    dailyFriends: clamp(Number(rules.dailyFriends), 0, 5),
    hotTopics: rules.hotTopics?.trim() || DEFAULT_FORUM_RULES.hotTopics,
  };
}

// ── 首次进入：先有书友，再有内容 ──

/** 论坛为空时生成一批不同领域的书友（本地生成，不依赖 API）。 */
export function ensureSeeded(state: ForumState): { state: ForumState; created: number } {
  if (state.seeded && state.npcs.length > 0) return { state, created: 0 };
  const seeds = [11, 29, 47, 83, 101, 137, 173];
  const created: ForumNpc[] = [];
  const used = new Set(state.npcs.map((npc) => npc.nickname));
  for (const seed of seeds) {
    if (state.npcs.length + created.length >= 7) break;
    const npc = generateSeededNpc(seed, used);
    if (npc) {
      created.push(npc);
      used.add(npc.nickname);
    }
  }
  return {
    state: { ...state, npcs: [...state.npcs, ...created], seeded: true },
    created: created.length,
  };
}

/** 用给定种子生成人设：与「随机生成」同一套池子，结果稳定可复现。 */
function generateSeededNpc(seed: number, usedNames: Set<string>): ForumNpc | null {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const npc = generateNpc({ seed: seed + attempt * 7 });
    if (!usedNames.has(npc.nickname)) {
      npc.id = `npc_seed_${seed}`;
      // 头像按最终 id 重新算一次，保证同一批种子每次生成的头像一致
      npc.avatar = avatarFromKey(npc.id);
      return npc;
    }
  }
  return null;
}

// ── 频道 ──

export type ForumChannel = "recommend" | "following" | "latest" | "hot" | "review" | "discussion" | "creation";

export const CHANNEL_LABEL: Record<ForumChannel, string> = {
  recommend: "推荐",
  following: "关注",
  latest: "最新",
  hot: "热门",
  review: "书评",
  discussion: "讨论",
  creation: "创作",
};

/** 各频道的内容口径：推荐看互动与新鲜度，关注只看关注的作者，最新按时间，书评只看书评。 */
export function channelPosts(state: ForumState, channel: ForumChannel): ForumPost[] {
  const visible = state.posts.filter((post) => !state.hiddenPostIds.includes(post.id));
  const now = Date.now();
  const score = (post: ForumPost) => {
    const hours = Math.max((now - new Date(post.createdAt).getTime()) / 3600_000, 0.5);
    const engagement = post.likedBy.length * 2 + post.comments.length * 3;
    const followed = state.following.includes(post.authorId) ? 6 : 0;
    return engagement + followed + 12 / hours;
  };
  switch (channel) {
    case "following":
      return visible
        .filter((post) => state.following.includes(post.authorId) || post.authorId === USER_ID)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "latest":
      return [...visible].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "review":
      return visible.filter((post) => post.kind === "review").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "discussion":
      return visible.filter((post) => post.kind === "post").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "creation":
      return visible.filter((post) => post.kind === "creation").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "hot":
      // 热门只看互动（点赞 + 评论），不看新旧
      return [...visible].sort((a, b) => b.likedBy.length * 2 + b.comments.length - (a.likedBy.length * 2 + a.comments.length));
    default:
      return [...visible].sort((a, b) => score(b) - score(a));
  }
}

// ── 互动：收藏 / 关注 / 通知 ──

export function toggleCollect(state: ForumState, postId: string, actorId = USER_ID): ForumState {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return state;
  const list = post.collectedBy ?? [];
  const next = list.includes(actorId) ? list.filter((id) => id !== actorId) : [...list, actorId];
  return { ...state, posts: state.posts.map((item) => (item.id === postId ? { ...item, collectedBy: next } : item)) };
}

export function isCollected(post: ForumPost, actorId = USER_ID): boolean {
  return (post.collectedBy ?? []).includes(actorId);
}

export function toggleFollowNpc(state: ForumState, npcId: string): ForumState {
  const following = state.following.includes(npcId)
    ? state.following.filter((id) => id !== npcId)
    : [...state.following, npcId];
  // 书友的粉丝列表同步（真实状态，刷新后仍在）
  const npcs = state.npcs.map((npc) => {
    if (npc.id !== npcId) return npc;
    const followers = npc.followers ?? [];
    const nextFollowers = following.includes(npcId)
      ? Array.from(new Set([...followers, USER_ID]))
      : followers.filter((id) => id !== USER_ID);
    return { ...npc, followers: nextFollowers };
  });
  // 取消关注时特别关注一起取消
  const starred = following.includes(npcId) ? state.starred : state.starred.filter((id) => id !== npcId);
  return { ...state, following, npcs, starred };
}

export function isFollowing(state: ForumState, npcId: string): boolean {
  return state.following.includes(npcId);
}

/** 特别关注（星标）：没关注的会顺带关注上。 */
export function toggleStarNpc(state: ForumState, npcId: string): ForumState {
  if (state.starred.includes(npcId)) {
    return { ...state, starred: state.starred.filter((id) => id !== npcId) };
  }
  const followed = state.following.includes(npcId) ? state : toggleFollowNpc(state, npcId);
  return { ...followed, starred: [...followed.starred, npcId] };
}

export function isStarred(state: ForumState, npcId: string): boolean {
  return state.starred.includes(npcId);
}

export function followerCount(npc: ForumNpc): number {
  return (npc.followers ?? []).length;
}

export function followingCount(npc: ForumNpc): number {
  return (npc.following ?? []).length;
}

export function pushNotification(state: ForumState, notification: Omit<ForumNotification, "id" | "createdAt" | "read">): ForumState {
  const entry: ForumNotification = {
    ...notification,
    id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  // 同一来源同一条帖子只留最近一条，避免刷屏
  const filtered = state.notifications.filter(
    (item) => !(item.kind === notification.kind && item.fromId === notification.fromId && item.postId === notification.postId),
  );
  return { ...state, notifications: [entry, ...filtered].slice(0, 120) };
}

export function unreadNotifications(state: ForumState): ForumNotification[] {
  return state.notifications.filter((item) => !item.read);
}

export function markNotificationsRead(state: ForumState, kinds?: ForumNotification["kind"][]): ForumState {
  return {
    ...state,
    notifications: state.notifications.map((item) =>
      !kinds || kinds.includes(item.kind) ? { ...item, read: true } : item,
    ),
  };
}

// ── 草稿箱 ──

export function saveDraft(state: ForumState, draft: Omit<ForumDraft, "updatedAt">): ForumState {
  const entry: ForumDraft = { ...draft, updatedAt: new Date().toISOString() };
  const exists = state.drafts.some((item) => item.id === draft.id);
  return {
    ...state,
    drafts: exists ? state.drafts.map((item) => (item.id === draft.id ? entry : item)) : [entry, ...state.drafts],
  };
}

export function deleteDraft(state: ForumState, draftId: string): ForumState {
  return { ...state, drafts: state.drafts.filter((item) => item.id !== draftId) };
}

// ── 评论：分批错时出现 ──

export function scheduleReplies(state: ForumState, postId: string, count = 3): ForumState {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return state;
  const topic: ForumTopic = {
    key: post.topics?.[0] ?? post.bookTitle ?? post.title ?? "帖子",
    label: post.title ?? post.bookTitle ?? "这条帖子",
    bookTitle: post.bookTitle,
  };
  const participants = pickParticipants(state, topic, Math.max(2, Math.min(count, 4)));
  const existing = new Set(state.pendingReplies.map((item) => `${item.postId}:${item.npcId}`));
  const now = Date.now();
  const planned: PendingReply[] = [];
  participants.forEach((npc, index) => {
    const key = `${postId}:${npc.id}`;
    if (existing.has(key)) return;
    // 20–110 秒内错开出现，避免发布瞬间刷出一排
    const delay = 20_000 + index * 18_000 + Math.random() * 22_000;
    planned.push({
      id: `pr_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 5)}`,
      postId,
      npcId: npc.id,
      dueAt: new Date(now + delay).toISOString(),
    });
  });
  if (planned.length === 0) return state;
  return { ...state, pendingReplies: [...state.pendingReplies, ...planned] };
}

export function dueReplies(state: ForumState, now = Date.now()): PendingReply[] {
  return state.pendingReplies.filter((item) => new Date(item.dueAt).getTime() <= now);
}

export function consumeReply(state: ForumState, replyId: string): ForumState {
  return { ...state, pendingReplies: state.pendingReplies.filter((item) => item.id !== replyId) };
}

export function buildCommentPrompt(post: ForumPost, npc: ForumNpc, rules: ForumRules): string {
  return [
    `你是${npc.nickname}，读书论坛「书友圈」里的书友。`,
    npc.occupation ? `职业/领域：${npc.occupation}。` : "",
    npc.personality ? `性格：${npc.personality}。` : "",
    npc.speechStyle ? `说话习惯：${npc.speechStyle}。` : "",
    npc.readingTaste ? `阅读偏好：${npc.readingTaste}。` : "",
    npc.relations ? `与对方的关系：${npc.relations}` : "",
    "",
    "下面是论坛里的一条帖子，请用这个身份回一条评论。",
    `作者：${post.authorName}${post.authorId === USER_ID ? "（和你认识的用户）" : ""}`,
    post.bookTitle ? `关联书籍：《${post.bookTitle}》` : "",
    post.title ? `标题：${post.title}` : "",
    `正文：${post.body.slice(0, 600)}`,
    "",
    `评论要求：${rules.commentLength}；${rules.commentTone}；${rules.commentRelation}。`,
    "写法：像真人在论坛回帖——可以只回一句，也可以问一句；不要客服腔、不要说教、不要每次都用同一种句式。",
    "不要把用户的书架、阅读进度或现实生活当成已知事实；不知道就别装作知道。",
    rules.commentFollowUp ? "如果有想问的，可以顺着追问一句。" : "不要反问，直接回应就好。",
    "允许剧透，但不要辱骂、不要攻击现实中的群体。",
    "只输出评论本身，不要加引号、不要写自己的昵称。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function cleanComment(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/```$/, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
  if (!text) return null;
  // 模型偶尔会把昵称加在前面，去掉
  return text.replace(/^[一-龥A-Za-z0-9_]{1,12}[：:]\s*/, "").slice(0, 300);
}

export async function generateComment(
  post: ForumPost,
  npc: ForumNpc,
  rules: ForumRules,
  signal?: AbortSignal,
): Promise<string | null> {
  const apiConfig = resolveForumApiConfig();
  if (!apiConfig) return null;
  const result = await simpleLLMCall(apiConfig, [{ role: "user", content: buildCommentPrompt(post, npc, rules) }], {
    temperature: 0.9,
    max_tokens: 400,
    signal,
    label: "studyroom-forum-comment",
  });
  if (result.error || !result.content) return null;
  return cleanComment(result.content);
}

export function makeComment(npc: ForumNpc, body: string): ForumComment {
  return {
    id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    authorId: npc.id,
    authorName: npc.nickname,
    authorKind: "npc",
    body,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 把一条待回复变成真正的评论：同时按生成规则里「NPC 日常活动」的节奏，
 * 顺带产生赞同 / 关注 / 好友申请（都是真实状态，刷新后仍在）。
 */
export function applyComment(state: ForumState, reply: PendingReply, body: string): ForumState {
  const npc = state.npcs.find((item) => item.id === reply.npcId);
  const post = state.posts.find((item) => item.id === reply.postId);
  if (!npc || !post) return consumeReply(state, reply.id);

  let next: ForumState = {
    ...state,
    posts: state.posts.map((item) =>
      item.id === post.id ? { ...item, comments: [...item.comments, makeComment(npc, body)] } : item,
    ),
  };

  if (post.authorId === USER_ID) {
    next = pushNotification(next, {
      kind: "comment",
      fromId: npc.id,
      fromName: npc.nickname,
      postId: post.id,
      text: body.slice(0, 60),
    });

    // 按规则里的节奏顺带点赞
    if (state.rules.dailyLikes > 0 && Math.random() < Math.min(state.rules.dailyLikes / 12, 0.8)) {
      const target = next.posts.find((item) => item.id === post.id);
      if (target && !target.likedBy.includes(npc.id)) {
        next = {
          ...next,
          posts: next.posts.map((item) =>
            item.id === post.id ? { ...item, likedBy: [...item.likedBy, npc.id] } : item,
          ),
        };
      }
    }

    // 顺带关注（只记真实关注关系与通知）
    if (state.rules.dailyFollows > 0 && Math.random() < 0.25 && !state.following.includes(npc.id)) {
      next = { ...next, npcs: next.npcs.map((item) => (item.id === npc.id ? { ...item, followers: Array.from(new Set([...(item.followers ?? []), USER_ID])) } : item)) };
      next = pushNotification(next, { kind: "follow", fromId: npc.id, fromName: npc.nickname });
    }

    // 顺带发一条好友申请（对方还没有成为好友时）
    if (state.rules.dailyFriends > 0 && !npc.characterId && Math.random() < 0.15) {
      next = pushNotification(next, { kind: "friend", fromId: npc.id, fromName: npc.nickname });
    }
  }

  return consumeReply(next, reply.id);
}

// ── 搜索：帖子 / 书友 / 书籍 / 话题 ──

export type ForumSearchResult = {
  posts: ForumPost[];
  npcs: ForumNpc[];
  books: string[];
  topics: string[];
};

export function searchForum(state: ForumState, query: string): ForumSearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return { posts: [], npcs: [], books: [], topics: [] };
  const hit = (text: string | undefined) => (text ?? "").toLowerCase().includes(q);
  const posts = state.posts.filter(
    (post) => hit(post.title) || hit(post.body) || hit(post.bookTitle) || (post.topics ?? []).some(hit),
  );
  const npcs = state.npcs.filter(
    (npc) => hit(npc.nickname) || hit(npc.occupation) || hit(npc.readingTaste) || npc.interests.some(hit),
  );
  const books = Array.from(
    new Set(
      state.posts
        .map((post) => post.bookTitle)
        .filter((title): title is string => Boolean(title) && hit(title)),
    ),
  );
  const topics = Array.from(new Set(state.posts.flatMap((post) => post.topics ?? []).filter(hit)));
  return { posts, npcs, books, topics };
}

export function parseDraftField(text: string): string[] {
  return text
    .split(/[、,，\s]+/)
    .map((item) => item.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}
