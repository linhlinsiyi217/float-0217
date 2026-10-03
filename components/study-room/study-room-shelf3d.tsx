"use client";

import { useMemo, useState, type CSSProperties } from "react";

import type { Book } from "@/lib/reading-types";

type CssVars = CSSProperties & Record<`--${string}`, string | number>;

type StudyRoomShelf3DProps = {
  books: Book[];
  onOpenBook: (book: Book) => void;
  onRemoveBook: (book: Book) => void;
};

type BookBox = {
  book: Book;
  width: number;
  height: number;
  tilt: number;
  lean: number;
};

const SHELF_ROW_WIDTH = 340;
const BOOK_DEPTH = 96;
const MIN_THICKNESS = 17;
const MAX_THICKNESS = 44;
const BASE_HEIGHT = 150;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

/** 由书的体量推厚度：章节越多越厚，再按标题哈希做细微区分。 */
function bookThickness(book: Book): number {
  const byChapters = MIN_THICKNESS + book.totalChapters * 0.5;
  const jitter = (hashString(book.id) % 7) - 3;
  return Math.max(MIN_THICKNESS, Math.min(MAX_THICKNESS, Math.round(byChapters + jitter)));
}

function toBookBox(book: Book, index: number): BookBox {
  const hash = hashString(book.id);
  const width = bookThickness(book);
  const height = BASE_HEIGHT + (hash % 3) * 9;
  // 极轻的朝向差，让整排书不是一张贴纸
  const tilt = ((hash >> 3) % 5) - 2;
  // 少量书倾斜靠着邻居
  const lean = index % 7 === 3 ? -7 : 0;
  return { book, width, height, tilt, lean };
}

/** 把书按书脊宽度铺进若干排，宽度超出就换排。 */
function layoutRows(boxes: BookBox[]): BookBox[][] {
  const rows: BookBox[][] = [];
  let current: BookBox[] = [];
  let used = 0;
  for (const box of boxes) {
    const need = box.width + 3;
    if (current.length > 0 && used + need > SHELF_ROW_WIDTH) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push(box);
    used += need;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

export function StudyRoomShelf3D({ books, onOpenBook, onRemoveBook }: StudyRoomShelf3DProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => layoutRows(books.map(toBookBox)), [books]);
  const selected = books.find((b) => b.id === selectedId) ?? null;

  const handleBookClick = (book: Book) => {
    if (selectedId === book.id) {
      onOpenBook(book);
      return;
    }
    setSelectedId(book.id);
  };

  return (
    <div className="sr3-stage">
      {rows.map((row, rowIndex) => (
        <div className="sr3-row" key={rowIndex}>
          <span className="sr3-board" aria-hidden />
          {row.map(({ book, width, height, tilt, lean }) => {
            const open = selectedId === book.id;
            const style: CssVars = {
              "--w": `${width}px`,
              "--h": `${height}px`,
              "--d": `${BOOK_DEPTH}px`,
              "--tilt": `${open ? 0 : tilt}deg`,
              "--lean": `${open ? 0 : lean}deg`,
              transformOrigin: lean ? "bottom left" : "bottom center",
            };
            return (
              <button
                key={book.id}
                type="button"
                className="sr3-book"
                data-open={open ? "true" : undefined}
                style={style}
                onClick={() => handleBookClick(book)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onRemoveBook(book);
                }}
                aria-label={book.title}
                title={open ? `打开《${book.title}》` : book.title}
              >
                {/* 书脊 */}
                <span className="sr3-face sr3-spine">
                  <span className="sr3-spine-title">{book.title}</span>
                </span>
                {/* 书页一侧（对面） */}
                <span className="sr3-face sr3-fore" />
                {/* 封面 / 封底 */}
                <span className="sr3-face sr3-cover sr3-cover-right">
                  <span className="sr3-cover-title">{book.title}</span>
                  {book.author && <span className="sr3-cover-author">{book.author}</span>}
                </span>
                <span className="sr3-face sr3-cover sr3-cover-left" />
                {/* 书顶 */}
                <span className="sr3-face sr3-top" />
              </button>
            );
          })}
        </div>
      ))}

      <p className="sr3-hint">
        {selected ? `再点一次打开《${selected.title}》` : "点一本书从架上抽出"}
      </p>
    </div>
  );
}
