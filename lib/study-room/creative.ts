// lib/study-room/creative.ts — 书桌里的手写与 AI 创作。
//
// 写作可以完全手打，也可以让 AI 写：用宿主已配置的 API（写作模型或已有角色卡），
// 不在这里写任何密钥。生成支持取消、失败重试，草稿始终留在本地，
// 只有用户明确「加入书架」才会变成一本书。

import { simpleLLMCall } from "@/lib/api-helpers";
import { loadCharacters } from "@/lib/character-storage";
import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import { addBook, saveChapters } from "@/lib/reading-storage";
import type { Book, BookChapter } from "@/lib/reading-types";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "@/lib/settings-storage";

const DRAFTS_KEY = "ai_phone_studyroom_creative_drafts_v1";
registerKvMigration(DRAFTS_KEY);

export type CreativeChapter = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

/** 写作身份：写作助手（模型）或用一张已有角色卡来写。 */
export type CreativeWriter = {
  mode: "assistant" | "character";
  /** mode="assistant" 时选定使用的 API 配置；留空表示用宿主默认 */
  apiConfigId?: string;
  /** mode="character" 时使用哪张角色卡 */
  characterId?: string;
};

export type CreativeDraft = {
  id: string;
  title: string;
  /** 署名：可以是笔名，也可以留空 */
  author?: string;
  /** 书籍简介（发布到书架时用） */
  synopsis?: string;
  tags: string[];
  templateId?: string;
  genre?: string;
  style?: string;
  world?: string;
  /** 人物设定：自由文本，一人一段 */
  cast?: string;
  /** 全书大纲：可自己写，也可以让 AI 先给一版 */
  outline?: string;
  /** 每章目标字数，给 AI 的参考 */
  targetWords?: number;
  serialization: "serial" | "finished";
  cover?: string;
  extra?: string;
  writer: CreativeWriter;
  chapters: CreativeChapter[];
  /** 已发布到书架时的书籍 id */
  publishedBookId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreativeTemplate = {
  id: string;
  name: string;
  desc: string;
  fields: Partial<Pick<CreativeDraft, "genre" | "style" | "world" | "cast" | "targetWords" | "tags" | "serialization">>;
};

/** 参考模板：只是把常见的写法填进设定里，任何字段都可以改，也可以全不填。 */
export const CREATIVE_TEMPLATES: CreativeTemplate[] = [
  { id: "blank", name: "空白开始", desc: "什么模板都不用，想到哪写到哪", fields: {} },
  {
    id: "urban",
    name: "都市日常",
    desc: "现代都市、生活流、节奏舒缓",
    fields: {
      genre: "都市日常",
      style: "口语化、细节多、少抒情",
      targetWords: 2000,
      tags: ["都市", "日常"],
      serialization: "serial",
    },
  },
  {
    id: "mystery",
    name: "悬疑推理",
    desc: "案件推进、线索与反转",
    fields: {
      genre: "悬疑推理",
      style: "克制的第三人称，短句，多用环境与动作推动",
      targetWords: 2500,
      tags: ["悬疑", "推理"],
      serialization: "serial",
    },
  },
  {
    id: "fantasy",
    name: "奇幻冒险",
    desc: "架空世界观、旅途与成长",
    fields: {
      genre: "奇幻冒险",
      style: "画面感强，设定通过情节自然带出",
      targetWords: 2500,
      tags: ["奇幻", "冒险"],
      serialization: "serial",
    },
  },
  {
    id: "romance",
    name: "言情",
    desc: "人物关系与情绪推进",
    fields: {
      genre: "言情",
      style: "细腻的心理描写，对话占比高",
      targetWords: 2000,
      tags: ["言情"],
      serialization: "serial",
    },
  },
  {
    id: "scifi",
    name: "科幻",
    desc: "近未来设定、技术与人的关系",
    fields: {
      genre: "科幻",
      style: "冷静的叙述节奏，概念在情节中展开",
      targetWords: 2500,
      tags: ["科幻"],
      serialization: "serial",
    },
  },
];

export function loadDrafts(): CreativeDraft[] {
  try {
    const raw = kvGet(DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CreativeDraft => Boolean(item) && typeof item === "object" && typeof (item as CreativeDraft).id === "string");
  } catch {
    return [];
  }
}

export function saveDrafts(list: CreativeDraft[]): void {
  kvSet(DRAFTS_KEY, JSON.stringify(list));
}

export function upsertDraft(list: CreativeDraft[], draft: CreativeDraft): CreativeDraft[] {
  const next = list.some((item) => item.id === draft.id)
    ? list.map((item) => (item.id === draft.id ? draft : item))
    : [...list, draft];
  saveDrafts(next);
  return next;
}

export function removeDraft(list: CreativeDraft[], id: string): CreativeDraft[] {
  const next = list.filter((item) => item.id !== id);
  saveDrafts(next);
  return next;
}

export function createDraft(templateId = "blank"): CreativeDraft {
  const template = CREATIVE_TEMPLATES.find((item) => item.id === templateId) ?? CREATIVE_TEMPLATES[0];
  const now = new Date().toISOString();
  return {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: "",
    tags: template.fields.tags ? [...template.fields.tags] : [],
    templateId: template.id,
    genre: template.fields.genre,
    style: template.fields.style,
    world: template.fields.world,
    cast: template.fields.cast,
    targetWords: template.fields.targetWords ?? 2000,
    serialization: template.fields.serialization ?? "serial",
    writer: { mode: "assistant" },
    chapters: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function wordCount(text: string): number {
  // 中文按字数、英文按词数粗算，够用来提示进度
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]+/g) ?? []).length;
  return cjk + latin;
}

export function draftWordCount(draft: CreativeDraft): number {
  return draft.chapters.reduce((total, chapter) => total + wordCount(chapter.content), 0);
}

/** 使用哪份 API 配置：写作助手模式优先用指定配置，否则用默认；角色模式用角色自己的绑定。 */
export function resolveWriterConfig(draft: CreativeDraft): { apiConfigId: string | null; writerLabel: string } {
  if (draft.writer.mode === "character" && draft.writer.characterId) {
    const character = loadCharacters().find((c) => c.id === draft.writer.characterId);
    const binding = resolveBinding(loadBindingConfig(), draft.writer.characterId, "cocreate");
    return { apiConfigId: binding.apiConfigId ?? null, writerLabel: character?.name ?? "角色" };
  }
  const configs = loadApiConfigs();
  const chosen = draft.writer.apiConfigId
    ? configs.find((c) => c.id === draft.writer.apiConfigId)
    : undefined;
  return { apiConfigId: chosen?.id ?? null, writerLabel: "写作助手" };
}

function identityInstruction(draft: CreativeDraft, secondPerson: string): string {
  if (draft.writer.mode === "character" && draft.writer.characterId) {
    const character = loadCharacters().find((c) => c.id === draft.writer.characterId);
    const name = character?.name ?? "角色";
    return `你是${name}，现在以「作者」的身份写作。注意区分：书里的角色是虚构人物，不等同于你自己，也不等同于用户的现实身份；不要把设定或情节说成用户现实中发生过的事。`;
  }
  return `你是${secondPerson}。写的都是虚构故事，不要把设定或情节说成用户的真实经历。`;
}

function draftBrief(draft: CreativeDraft): string {
  const lines = [
    `书名：${draft.title || "（未定）"}`,
    draft.author ? `署名：${draft.author}` : "",
    draft.genre ? `题材：${draft.genre}` : "",
    draft.style ? `文风：${draft.style}` : "",
    draft.tags.length > 0 ? `标签：${draft.tags.join("、")}` : "",
    draft.world ? `世界观：${draft.world}` : "",
    draft.cast ? `人物：${draft.cast}` : "",
    draft.outline ? `大纲：${draft.outline}` : "",
    draft.serialization === "finished" ? "形态：完结短篇" : "形态：连载",
    draft.targetWords ? `每章目标字数：约 ${draft.targetWords} 字` : "",
    draft.extra ? `补充要求：${draft.extra}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/** 最近两章的开头/结尾作为衔接参考，避免把整本都发出去。 */
function recentContext(draft: CreativeDraft): string {
  const recent = draft.chapters.slice(-2);
  if (recent.length === 0) return "（还没有已写的章节，这一章是开头。）";
  return recent
    .map((chapter) => {
      const text = chapter.content;
      const tail = text.slice(-600);
      return `【已写：${chapter.title || "未命名"}】\n……${tail}`;
    })
    .join("\n\n");
}

export function buildOutlinePrompt(draft: CreativeDraft): string {
  return [
    identityInstruction(draft, "写作助手"),
    "",
    "请根据下面的设定，给出这本书的大纲：分 5–8 幕，每幕一到两句写清推进；再列 3–5 个主要人物，写清他们是谁、想要什么。",
    "只输出大纲本身，不要客套话。",
    "",
    draftBrief(draft),
  ].join("\n");
}

export function buildChapterPrompt(draft: CreativeDraft, chapterNumber: number): string {
  return [
    identityInstruction(draft, "写作助手"),
    "",
    `请写第 ${chapterNumber} 章的正文。`,
    "要求：直接开始写正文，第一行用「第N章 标题」格式给出本章标题，之后是正文；不要写解说、不要总结自己的过程。",
    draft.targetWords ? `篇幅控制在 ${draft.targetWords} 字左右。` : "",
    "保持与前文一致的人称、时态与人物口吻。",
    "",
    "【设定】",
    draftBrief(draft),
    "",
    "【前文（结尾片段）】",
    recentContext(draft),
  ]
    .filter(Boolean)
    .join("\n");
}

export type GenerateResult = { title: string; content: string };

/** 把模型输出拆成「标题 + 正文」。没按格式给标题时，用兜底标题。 */
export function parseChapterOutput(raw: string, chapterNumber: number, fallbackTitle?: string): GenerateResult {
  const text = raw.trim();
  const lines = text.split("\n");
  const first = (lines[0] ?? "").trim().replace(/^#+\s*/, "");
  const looksLikeTitle =
    first.length > 0 && first.length <= 40 && /^(第\s*[0-9一二三四五六七八九十百千]+\s*[章节回]|序章|楔子|尾声|终章)/.test(first);
  if (looksLikeTitle) {
    return { title: first, content: lines.slice(1).join("\n").trim() };
  }
  return { title: fallbackTitle?.trim() || `第 ${chapterNumber} 章`, content: text };
}

async function callWriter(
  draft: CreativeDraft,
  prompt: string,
  signal?: AbortSignal,
  maxTokens = 3000,
): Promise<string> {
  const { apiConfigId } = resolveWriterConfig(draft);
  const configs = loadApiConfigs();
  const config = apiConfigId
    ? configs.find((c) => c.id === apiConfigId) ?? null
    : configs.find((c) => c.id === loadBindingConfig().globalDefaults.apiConfigId) ?? configs[0] ?? null;
  if (!config) throw new Error("还没有可用的 API：请先在设置里配置模型");
  const result = await simpleLLMCall(config, [{ role: "user", content: prompt }], {
    temperature: 0.85,
    max_tokens: maxTokens,
    signal,
    label: "studyroom-creative",
  });
  if (result.error) throw new Error(result.error);
  if (!result.content) throw new Error("模型没有返回内容");
  return result.content;
}

export async function generateOutline(draft: CreativeDraft, signal?: AbortSignal): Promise<string> {
  return (await callWriter(draft, buildOutlinePrompt(draft), signal, 1200)).trim();
}

export async function generateChapter(
  draft: CreativeDraft,
  chapterNumber: number,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const maxTokens = Math.min(Math.max((draft.targetWords ?? 2000) * 2, 800), 8000);
  const raw = await callWriter(draft, buildChapterPrompt(draft, chapterNumber), signal, maxTokens);
  return parseChapterOutput(raw, chapterNumber);
}

export function makeChapter(title: string, content: string): CreativeChapter {
  const now = new Date().toISOString();
  return {
    id: `cc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

/** 正文 → 段落数组：按空行切，没空行就按单行切。 */
export function toParagraphs(content: string): string[] {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  return content.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * 把草稿发布到书架：生成书目与章节，之后就能像别的书一样阅读、批注、共读。
 * 同 id 重复发布时按最新内容覆盖，不会在书架上留下两本一样的书。
 */
export async function publishDraft(draft: CreativeDraft): Promise<Book> {
  const chapters = draft.chapters.filter((chapter) => chapter.content.trim());
  if (chapters.length === 0) throw new Error("还没有正文，写点内容再发布");
  const bookId = draft.publishedBookId ?? `book_creative_${draft.id}`;
  const book: Book = {
    id: bookId,
    title: draft.title.trim() || "未命名作品",
    author: draft.author?.trim() || "佚名",
    format: "txt",
    totalChapters: chapters.length,
    createdAt: new Date().toISOString(),
    cover: draft.cover,
    description: draft.synopsis?.trim() || undefined,
    tags: draft.tags,
    sourceLabel: "书房创作",
    draftId: draft.id,
  };
  await addBook(book);
  const bookChapters: BookChapter[] = chapters.map((chapter, index) => ({
    id: `${bookId}_${index}`,
    bookId,
    index,
    title: chapter.title || `第 ${index + 1} 章`,
    paragraphs: toParagraphs(chapter.content),
  }));
  await saveChapters(bookId, bookChapters);
  return book;
}
