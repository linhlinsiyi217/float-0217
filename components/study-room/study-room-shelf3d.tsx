"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { Book } from "@/lib/reading-types";

type StudyRoomShelf3DProps = {
  books: Book[];
  onOpenBook: (book: Book) => void;
  onRemoveBook: (book: Book) => void;
  /** 从阅读器返回时，让这本书先以「抽出」状态出现再放回 */
  returnFromBookId?: string | null;
};

type CssVars = CSSProperties & Record<`--${string}`, string | number>;

type BookBox = {
  book: Book;
  width: number;
  height: number;
  tilt: number;
  lean: number;
  tone: string;
  ink: string;
};

/** 书本本身的作品色（没有真实封面图时，按书名稳定地取一个克制的书封色）。 */
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

const SHELF_ROW_WIDTH = 336;
const BOOK_DEPTH = 112;
const MIN_THICKNESS = 22;
const MAX_THICKNESS = 54;
const BASE_HEIGHT = 248;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function bookThickness(book: Book): number {
  const byChapters = MIN_THICKNESS + book.totalChapters * 0.6;
  const jitter = (hashString(book.id) % 7) - 3;
  return Math.max(MIN_THICKNESS, Math.min(MAX_THICKNESS, Math.round(byChapters + jitter)));
}

function toBookBox(book: Book, index: number): BookBox {
  const hash = hashString(book.id || book.title);
  const width = bookThickness(book);
  const height = BASE_HEIGHT + (hash % 4) * 7;
  const tilt = ((hash >> 3) % 5) - 2;
  const lean = index % 7 === 3 ? -3 : 0;
  const cover = COVER_TONES[hash % COVER_TONES.length];
  return { book, width, height, tilt, lean, tone: cover.tone, ink: cover.ink };
}

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

export function StudyRoomShelf3D({ books, onOpenBook, onRemoveBook, returnFromBookId }: StudyRoomShelf3DProps) {
  const [selectedId, setSelectedId] = useState<string | null>(returnFromBookId ?? null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openTimerRef = useRef<number | null>(null);

  const rows = useMemo(() => layoutRows(books.map(toBookBox)), [books]);
  const selected = books.find((b) => b.id === selectedId) ?? null;

  // 从阅读器返回：先以抽出状态呈现，随后滑回架上（放回动效）
  useEffect(() => {
    if (!returnFromBookId) return;
    const timer = window.setTimeout(() => setSelectedId((current) => (current === returnFromBookId ? null : current)), 420);
    return () => window.clearTimeout(timer);
  }, [returnFromBookId]);

  useEffect(() => () => {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
  }, []);

  const handleBookClick = (book: Book) => {
    if (openingId) return;
    if (selectedId === book.id) {
      // 抽出后再点：向读者方向抬起，随后进入阅读
      setOpeningId(book.id);
      openTimerRef.current = window.setTimeout(() => {
        onOpenBook(book);
        setOpeningId(null);
      }, 340);
      return;
    }
    setSelectedId(book.id);
  };

  return (
    <div className="sr3-stage" onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
      <div className="sr3-case">
        {rows.map((row, rowIndex) => (
          <div className="sr3-row" key={rowIndex}>
            <span className="sr3-board" aria-hidden />
            <span className="sr3-board-edge" aria-hidden />
            {row.map(({ book, width, height, tilt, lean, tone, ink }) => {
              const open = selectedId === book.id;
              const opening = openingId === book.id;
              const style: CssVars = {
                "--w": `${width}px`,
                "--h": `${height}px`,
                "--d": `${BOOK_DEPTH}px`,
                "--tilt": `${open || opening ? 0 : tilt}deg`,
                "--lean": `${open || opening ? 0 : lean}deg`,
                "--tone": tone,
                "--ink": ink,
                transformOrigin: lean ? "bottom left" : "bottom center",
              };
              return (
                <button
                  key={book.id}
                  type="button"
                  className="sr3-book"
                  data-open={open ? "true" : undefined}
                  data-opening={opening ? "true" : undefined}
                  style={style}
                  onClick={(e) => { e.stopPropagation(); handleBookClick(book); }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onRemoveBook(book);
                  }}
                  aria-label={book.title}
                  title={open ? `打开《${book.title}》` : book.title}
                >
                  <span className="sr3-face sr3-spine">
                    <span className="sr3-spine-title">{book.title}</span>
                  </span>
                  <span className="sr3-face sr3-fore" />
                  <span className="sr3-face sr3-cover sr3-cover-right">
                    <span className="sr3-cover-band" aria-hidden />
                    <span className="sr3-cover-title">{book.title}</span>
                    {book.author && <span className="sr3-cover-author">{book.author}</span>}
                  </span>
                  <span className="sr3-face sr3-cover sr3-cover-left" />
                  <span className="sr3-face sr3-top" />
                  <span className="sr3-face sr3-bottom" />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="sr3-hint">
        {selected ? `再点一次打开《${selected.title}》` : "点一本书从架上抽出"}
      </p>
    </div>
  );
}
