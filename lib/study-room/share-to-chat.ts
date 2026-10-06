// lib/study-room/share-to-chat.ts — 把书房里的书或帖子分享到小手机的聊天。
//
// 不另造聊天系统：接收人来自现有聊天联系人，消息走 pushChatMessage，
// 卡片复用聊天里已有的「应用卡片」（app_card），所以预览、通知和 AI 上下文都沿用原有链路。
// 卡片点开时由聊天气泡发 open-app，书房按 launchContext 回到对应的书或帖子。

import {
  createOrGetSession,
  hydrateChatStorage,
  loadChatContacts,
  pushChatMessage,
} from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import type { Book } from "@/lib/reading-types";
import type { ForumPost } from "./forum";

export const STUDYROOM_APP_ID = "studyroom";

/** 帖子含剧透时，卡片和 AI 上下文里都只放这句，不带正文 */
export const SHARE_SPOILER_SUMMARY = "含剧透内容，进入书友圈后点开查看";

export type StudyRoomShareTarget =
  | { kind: "book"; bookId: string }
  | { kind: "post"; postId: string };

export type StudyRoomShareItem = {
  target: StudyRoomShareTarget;
  /** 卡片顶部的小标签：书籍 / 书友圈帖子 */
  label: string;
  title: string;
  subtitle?: string;
  summary: string;
  image?: string;
};

export type ShareContact = {
  characterId: string;
  name: string;
  avatar?: string;
};

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** 卡片图片只放网络地址：本地导入的封面是大体积 data URL，不塞进聊天记录 */
function shareableImage(src: string | undefined | null): string | undefined {
  if (!src) return undefined;
  if (!/^https?:\/\//i.test(src) || src.length > 2000) return undefined;
  return src;
}

export function shareItemFromBook(book: Book): StudyRoomShareItem {
  const author = book.author?.trim();
  return {
    target: { kind: "book", bookId: book.id },
    label: "书籍",
    title: `《${book.title}》`,
    subtitle: author ? author : undefined,
    summary: clip(book.description || (author ? `${author} 著` : "书房里的一本书"), 120),
    image: shareableImage(book.cover),
  };
}

export function shareItemFromPost(post: ForumPost): StudyRoomShareItem {
  const book = post.bookTitle ? `《${post.bookTitle}》` : "";
  if (post.spoiler) {
    // 含剧透：标题与正文都不带出去，只给书名和提示
    return {
      target: { kind: "post", postId: post.id },
      label: "书友圈帖子",
      title: book ? `${book}的书友圈帖子` : "书友圈帖子",
      subtitle: `${post.authorName} · 含剧透`,
      summary: SHARE_SPOILER_SUMMARY,
    };
  }
  return {
    target: { kind: "post", postId: post.id },
    label: "书友圈帖子",
    title: clip(post.title || post.body, 40) || "书友圈帖子",
    subtitle: [post.authorName, book].filter(Boolean).join(" · "),
    summary: clip(post.body, 120),
  };
}

/** 现有聊天联系人（单聊），带角色名字与头像；找不到角色的联系人不列出 */
export async function loadShareContacts(): Promise<ShareContact[]> {
  await hydrateChatStorage().catch(() => undefined);
  const characters = new Map(loadCharacters().map((character) => [character.id, character]));
  const seen = new Set<string>();
  const out: ShareContact[] = [];
  for (const contact of loadChatContacts()) {
    if (seen.has(contact.characterId)) continue;
    const character = characters.get(contact.characterId);
    if (!character) continue;
    seen.add(contact.characterId);
    const avatar = character.avatar && character.avatar !== "none" ? character.avatar : undefined;
    out.push({ characterId: character.id, name: contact.nickname?.trim() || character.name, avatar });
  }
  return out;
}

/** 发送一张书房分享卡片到这个联系人的聊天；返回会话 id */
export function sendStudyRoomShare(characterId: string, item: StudyRoomShareItem): string {
  const session = createOrGetSession(characterId);
  pushChatMessage({
    sessionId: session.id,
    role: "user",
    content: `分享了书房${item.label}：${item.title}`,
    mediaType: "app_card",
    mediaData: {
      appId: STUDYROOM_APP_ID,
      appName: "书房",
      appCardTitle: item.title,
      appCardSummary: item.summary,
      appCardBody: item.summary,
      appHistoryText: `[书房${item.label}:${item.title}]${item.subtitle ? `（${item.subtitle}）` : ""}${item.summary}`,
      appCardLayout: {
        appLabel: `书房 · ${item.label}`,
        title: item.title,
        subtitle: item.subtitle,
        body: item.summary,
        image: item.image,
        studyRoomTarget: item.target,
      },
    },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
  }
  return session.id;
}

/** 从聊天卡片的 layout 里读出要回到的书或帖子 */
export function readStudyRoomTarget(value: unknown): StudyRoomShareTarget | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as { studyRoomTarget?: unknown }).studyRoomTarget;
  if (!raw || typeof raw !== "object") return null;
  const target = raw as Record<string, unknown>;
  if (target.kind === "book" && typeof target.bookId === "string") return { kind: "book", bookId: target.bookId };
  if (target.kind === "post" && typeof target.postId === "string") return { kind: "post", postId: target.postId };
  return null;
}
