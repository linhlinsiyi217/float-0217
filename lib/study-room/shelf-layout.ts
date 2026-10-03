// lib/study-room/shelf-layout.ts — 实体书架排布（纯函数，便于测试）。
//
// 规则：
//  - 从左到右逐本放入，按「实际书脊宽度 + 间距」占位；本层放不下才换到下一层。
//  - 至少两层（书少时下层保留真实空位，不复制假书填满）。
//  - 书多就加层，由外层滚动；不会因为书变多把所有书缩小。
//  - 只有每层最后一本、且右侧还有空位时才允许向右倾斜，倾斜不会压到邻书。

import type { Book } from "@/lib/reading-types";

export type ShelfSort = "import" | "manual" | "recent";

export type ShelfBookBox = {
  book: Book;
  /** 书脊厚度（占位宽度，未乘缩放） */
  spine: number;
  /** 书高（未乘缩放） */
  height: number;
  /** 左右微转角度（只影响视觉，不改变占位） */
  tilt: number;
  /** 倾斜角（度，正值向右倒）；0 表示直立 */
  lean: number;
  /** 无真实封面时的备用底色（不是真实书封，只是占位样式） */
  tone: string;
  ink: string;
};

export const BOOK_GAP = 4;
export const MIN_SPINE = 20;
export const MAX_SPINE = 46;
export const BASE_BOOK_HEIGHT = 196;
export const ROW_PADDING_LEFT = 14;
export const ROW_PADDING_RIGHT = 14;
export const MIN_ROWS = 2;
const LEAN_DEG = 5;

/** 备用配色：仅在书本没有真实封面图时使用。 */
const COVER_TONES: Array<{ tone: string; ink: string }> = [
  { tone: "#33465e", ink: "#eef2f8" },
  { tone: "#5a3f36", ink: "#f4ece6" },
  { tone: "#3d4d41", ink: "#edf2ed" },
  { tone: "#5c3a46", ink: "#f6ecef" },
  { tone: "#413f4e", ink: "#f0f0f5" },
  { tone: "#2f4b4c", ink: "#eaf3f3" },
  { tone: "#5d4a2e", ink: "#f6f0e4" },
  { tone: "#3a4150", ink: "#eef1f6" },
  { tone: "#4c3a55", ink: "#f3ecf6" },
  { tone: "#355168", ink: "#eaf2f8" },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

/** 每本书的尺寸只由它自己决定（章节数 + 稳定哈希），不随书量变化。 */
export function measureBook(book: Book): Omit<ShelfBookBox, "lean"> {
  const hash = hashString(book.id || book.title);
  const spine = Math.max(MIN_SPINE, Math.min(MAX_SPINE, Math.round(MIN_SPINE + Math.min(book.totalChapters, 60) * 0.35 + ((hash % 7) - 3))));
  const height = BASE_BOOK_HEIGHT - 12 + (hash % 4) * 6;
  const tilt = ((hash >> 3) % 3) - 1;
  const tone = COVER_TONES[hash % COVER_TONES.length];
  return { book, spine, height, tilt, tone: tone.tone, ink: tone.ink };
}

/** 倾斜 θ 度时书顶向右水平位移 = h·sinθ；给它让出的空位。 */
function leanOffset(height: number, deg: number): number {
  return Math.ceil(height * Math.sin((deg * Math.PI) / 180)) + 2;
}

/**
 * 按实际可用宽度从左到右排布。
 * @param rowWidth 一层内可放书的宽度（px，已扣除左右边距）
 * @param scale    书本缩放（外观设置），用于把未缩放尺寸换算成实际占位
 */
export function layoutShelf(books: Book[], rowWidth: number, scale = 1): ShelfBookBox[][] {
  const usable = Math.max(rowWidth, 60);
  const rows: ShelfBookBox[][] = [];
  let current: ShelfBookBox[] = [];
  let used = 0;

  for (const book of books) {
    const box: ShelfBookBox = { ...measureBook(book), lean: 0 };
    const need = (box.spine + BOOK_GAP) * scale;
    if (current.length > 0 && used + need > usable) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push(box);
    used += need;
  }
  if (current.length > 0) rows.push(current);

  // 每层最后一本：右侧剩余空间足够才向右倾斜靠在「空气」上，不会压到任何邻书
  rows.forEach((row) => {
    if (row.length < 3) return;
    const width = row.reduce((sum, box) => sum + (box.spine + BOOK_GAP) * scale, 0);
    const last = row[row.length - 1];
    const extra = leanOffset(last.height * scale, LEAN_DEG);
    if (usable - width > extra + 8) {
      last.lean = LEAN_DEG;
    }
  });

  while (rows.length < MIN_ROWS) rows.push([]);
  return rows;
}

/** 书架排序：默认导入顺序（先导入的在左），阅读后不会自动重排。 */
export function sortShelfBooks(
  books: Book[],
  sort: ShelfSort,
  options: { manualOrder?: string[]; lastReadAt?: Record<string, string> } = {},
): Book[] {
  const byImport = [...books].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
  if (sort === "recent") {
    const read = options.lastReadAt ?? {};
    return byImport
      .map((book, index) => ({ book, index, at: read[book.id] ? new Date(read[book.id]).getTime() : 0 }))
      .sort((a, b) => (b.at - a.at) || (a.index - b.index))
      .map((entry) => entry.book);
  }
  if (sort === "manual" && options.manualOrder && options.manualOrder.length > 0) {
    const position = new Map(options.manualOrder.map((id, index) => [id, index]));
    // 手动顺序里没有的新书接在末尾，仍按导入顺序
    return byImport
      .map((book, index) => ({ book, key: position.has(book.id) ? position.get(book.id)! : options.manualOrder!.length + index }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.book);
  }
  return byImport;
}

/** 手动排序：把某本书向左/右移动一格，返回新的完整顺序。 */
export function moveInOrder(order: string[], bookId: string, delta: -1 | 1): string[] {
  const index = order.indexOf(bookId);
  if (index < 0) return order;
  const target = index + delta;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** 封面比例：读取源图宽高比，限定在实体书合理范围，读不到时用常见 0.68。 */
export const DEFAULT_COVER_RATIO = 0.68;
export function clampCoverRatio(ratio: number | undefined): number {
  if (!ratio || !Number.isFinite(ratio)) return DEFAULT_COVER_RATIO;
  return Math.min(0.82, Math.max(0.56, ratio));
}
