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
  /** 书脊厚度（书架占位宽度） */
  spine: number;
  /** 书高 */
  height: number;
  /** 封面宽度（深度方向），按实体书比例 */
  cover: number;
  tilt: number;
  lean: number;
  /** 无真实封面时的备用底色（不是真实书封，只是占位样式） */
  tone: string;
  ink: string;
};

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

const SHELF_ROW_WIDTH = 320;
const BOOK_GAP = 4;
const MIN_SPINE = 20;
const MAX_SPINE = 46;
/** 实体书封面宽高比（宽 / 高），用于抽出后展示完整正常比例的封面 */
const COVER_RATIO = 0.66;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function toBookBox(book: Book, index: number, height: number): BookBox {
  const hash = hashString(book.id || book.title);
  const spine = Math.max(MIN_SPINE, Math.min(MAX_SPINE, Math.round(MIN_SPINE + book.totalChapters * 0.5 + ((hash % 7) - 3))));
  const boxHeight = height + (hash % 3) * 6;
  const tilt = ((hash >> 3) % 5) - 2;
  const lean = index % 7 === 3 ? -3 : 0;
  const tone = COVER_TONES[hash % COVER_TONES.length];
  return {
    book,
    spine,
    height: boxHeight,
    cover: Math.round(boxHeight * COVER_RATIO),
    tilt,
    lean,
    tone: tone.tone,
    ink: tone.ink,
  };
}

/**
 * 把书分配到若干层书架。默认至少两层（上下两层实体书架），
 * 书多时按宽度继续加层（外层可滚动）；书很少时保持真实空位，不复制书填充。
 */
function distributeRows(boxes: BookBox[], rowWidth: number): BookBox[][] {
  if (boxes.length === 0) return [];
  if (boxes.length === 1) return [boxes];

  const totalWidth = boxes.reduce((sum, box) => sum + box.spine + BOOK_GAP, 0);
  let rowCount = Math.max(2, Math.ceil(totalWidth / rowWidth));
  rowCount = Math.min(rowCount, boxes.length);

  const rows: BookBox[][] = Array.from({ length: rowCount }, () => []);
  const perRow = boxes.length / rowCount;
  boxes.forEach((box, index) => {
    const rowIndex = Math.min(rowCount - 1, Math.floor(index / perRow));
    rows[rowIndex].push(box);
  });
  return rows;
}

export function StudyRoomShelf3D({ books, onOpenBook, onRemoveBook, returnFromBookId }: StudyRoomShelf3DProps) {
  const [selectedId, setSelectedId] = useState<string | null>(returnFromBookId ?? null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  // 真实封面加载失败的书：退回备用样式，不留破图
  const [failedCovers, setFailedCovers] = useState<Set<string>>(new Set());
  const openTimerRef = useRef<number | null>(null);

  const markCoverFailed = (bookId: string) =>
    setFailedCovers((prev) => (prev.has(bookId) ? prev : new Set(prev).add(bookId)));
  const coverOf = (book: Book): string | undefined =>
    book.cover && !failedCovers.has(book.id) ? book.cover : undefined;

  // 书高按层数自适应：层数越多每层越矮，保证两层能在手机可用高度内完整呈现
  const rows = useMemo(() => {
    const baseHeight = books.length <= 8 ? 200 : 176;
    const boxes = books.map((book, index) => toBookBox(book, index, baseHeight));
    return distributeRows(boxes, SHELF_ROW_WIDTH);
  }, [books]);

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
      <div className="sr3-shelves">
        {rows.map((row, rowIndex) => (
          <div className="sr3-shelf" key={rowIndex}>
            <div className="sr3-row">
              {row.map(({ book, spine, height, cover, tilt, lean, tone, ink }) => {
                const open = selectedId === book.id;
                const opening = openingId === book.id;
                const coverUrl = coverOf(book);
                const style: CssVars = {
                  "--w": `${spine}px`,
                  "--h": `${height}px`,
                  "--d": `${cover}px`,
                  "--tilt": `${open || opening ? 0 : tilt}deg`,
                  "--lean": `${open || opening ? 0 : lean}deg`,
                  "--tone": tone,
                  "--ink": ink,
                  transformOrigin: lean ? "bottom left" : "bottom center",
                  // 倾斜的书绕左下角转，顶部会向左压到邻居，补一点左边距让开
                  marginLeft: lean ? 10 : undefined,
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
                      {book.author && <span className="sr3-spine-author">{book.author}</span>}
                    </span>
                    <span className="sr3-face sr3-fore" />
                    <span className="sr3-face sr3-cover sr3-cover-right">
                      {coverUrl ? (
                        // 需要 onError 退回备用样式；next/image 的失败回退不便于此处的 3D 面
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="sr3-cover-art"
                          src={coverUrl}
                          alt=""
                          loading="lazy"
                          onError={() => markCoverFailed(book.id)}
                        />
                      ) : (
                        <>
                          <span className="sr3-cover-band" aria-hidden />
                          <span className="sr3-cover-title">{book.title}</span>
                          {book.author && <span className="sr3-cover-author">{book.author}</span>}
                        </>
                      )}
                    </span>
                    <span className="sr3-face sr3-cover sr3-cover-left" />
                    <span className="sr3-face sr3-top" />
                    <span className="sr3-face sr3-bottom" />
                  </button>
                );
              })}
            </div>
            <span className="sr3-board" aria-hidden />
            <span className="sr3-board-edge" aria-hidden />
            <span className="sr3-contact" aria-hidden />
          </div>
        ))}
      </div>

      <p className="sr3-hint">
        {selected ? `再点一次打开《${selected.title}》` : "点一本书从架上抽出"}
      </p>
    </div>
  );
}
