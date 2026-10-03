// lib/reading-types.ts — Type definitions for the Reading (阅读) feature.

export type Book = {
    id: string;
    title: string;
    author?: string;
    format: "txt" | "epub" | "pdf";
    totalChapters: number;
    createdAt: string;
};

export type BookChapter = {
    id: string;
    bookId: string;
    index: number;
    title: string;
    paragraphs: string[];
    /** PDF only: synthetic page chunk start (1-based) */
    pageStart?: number;
    /** PDF only: synthetic page chunk end (1-based) */
    pageEnd?: number;
    /** PDF only: page number (1-based) for each paragraph */
    paragraphPages?: number[];
    /** PDF only: vertical position (0-1 ratio) within page for each paragraph */
    paragraphYPositions?: number[];
};

export type ReadingProgress = {
    bookId: string;
    chapterIndex: number;
    scrollPosition: number;
    companionCharacterId?: string;
    progressFraction?: number;
    progressCurrent?: number;
    progressTotal?: number;
    progressScope?: "book" | "chapter";
    /** 保存进度时的阅读模式；滚动模式下 scrollPosition 存的是章节内滚动比例(0-1) */
    readingMode?: "page" | "scroll";
    lastReadAt: string;
};

export type ReadingAnnotation = {
    id: string;
    bookId: string;
    chapterIndex: number;
    paragraphIndex: number;
    characterId: string;
    characterName: string;
    content: string;
    createdAt: string;
};

/** 阅读位置书签：记住某一章某一段（含章内滚动比例），方便回到原处。 */
export type ReadingBookmark = {
    id: string;
    bookId: string;
    chapterIndex: number;
    paragraphIndex: number;
    /** 保存时的章内滚动比例(0-1) */
    scrollFraction?: number;
    /** 保存时选中的原文片段（没有选中则为空） */
    excerpt?: string;
    label?: string;
    createdAt: string;
};

/**
 * 用户自己的书摘与批注。
 * kind="excerpt" 只保留原文摘录；kind="note" 在摘录之外还有用户写下的想法。
 * 与 ReadingAnnotation（AI 生成、带角色）分开存储，互不覆盖。
 */
export type ReadingNote = {
    id: string;
    bookId: string;
    chapterIndex: number;
    paragraphIndex: number;
    kind: "excerpt" | "note";
    /** 被标记的原文（高亮依据） */
    quote: string;
    /** 用户写下的想法；kind="excerpt" 时为空 */
    content?: string;
    createdAt: string;
    updatedAt: string;
};
