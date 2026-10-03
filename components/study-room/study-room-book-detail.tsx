"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, MessagesSquare, Quote, PenLine, Bookmark, Trash2, X, FileDown, Loader2 } from "lucide-react";

import { loadAllAnnotations, loadBookmarks, loadChapters, loadNotes, loadProgress } from "@/lib/reading-storage";
import type { Book, ReadingAnnotation, ReadingBookmark, ReadingNote, ReadingProgress } from "@/lib/reading-types";
import { loadCoreadRefs, type CoreadRef } from "@/lib/study-room-coread";
import { loadCharacters } from "@/lib/character-storage";
import { StudyRoomStageSummary } from "./study-room-stage-summary";
import { exportBookAsEpub, safeFileName } from "@/lib/study-room/export-epub";

type StudyRoomBookDetailProps = {
  book: Book;
  onClose: () => void;
  /** 开始/继续阅读；带章节/段落时跳到原文位置 */
  onRead: (book: Book, chapterIndex?: number, paragraphIndex?: number) => void;
  onOpenMessages: () => void;
  onRemove: (book: Book) => void;
  /** 手动排序时可左右移动 */
  onMove?: (delta: -1 | 1) => void;
  /** 额外入口（如赠书、送礼），由父组件提供 */
  extraActions?: ReactNode;
};

type DetailData = {
  chapterTitles: string[];
  progress: ReadingProgress | null;
  notes: ReadingNote[];
  bookmarks: ReadingBookmark[];
  /** 角色写的批注（只读，可跳回原文） */
  annotations: ReadingAnnotation[];
  coread: Array<CoreadRef & { name: string }>;
};

const TOC_PREVIEW = 8;
/** 长目录一次只多渲染这么多章，避免上千章全进 DOM */
const TOC_STEP = 60;

export function StudyRoomBookDetail({ book, onClose, onRead, onOpenMessages, onRemove, onMove, extraActions }: StudyRoomBookDetailProps) {
  const [data, setData] = useState<DetailData | null>(null);
  const [tocLimit, setTocLimit] = useState(TOC_PREVIEW);
  const [coverFailed, setCoverFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setTocLimit(TOC_PREVIEW);
    setCoverFailed(false);
    void (async () => {
      const [chapters, progress, notes, bookmarks, allAnnotations] = await Promise.all([
        loadChapters(book.id).catch(() => []),
        loadProgress(book.id).catch(() => null),
        loadNotes(book.id).catch(() => []),
        loadBookmarks(book.id).catch(() => []),
        loadAllAnnotations().catch(() => []),
      ]);
      if (cancelled) return;
      const characters = loadCharacters();
      const coread = loadCoreadRefs()
        .filter((ref) => ref.bookId === book.id)
        .map((ref) => ({ ...ref, name: characters.find((c) => c.id === ref.characterId)?.name ?? "未知角色" }));
      setData({
        chapterTitles: chapters.map((c) => c.title),
        progress,
        notes: [...notes].sort((a, b) => (a.chapterIndex - b.chapterIndex) || (a.paragraphIndex - b.paragraphIndex)),
        bookmarks,
        annotations: allAnnotations
          .filter((item) => item.bookId === book.id)
          .sort((a, b) => (a.chapterIndex - b.chapterIndex) || (a.paragraphIndex - b.paragraphIndex)),
        coread,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = data?.chapterTitles.length ?? book.totalChapters;
  const progress = data?.progress ?? null;
  const started = Boolean(progress && progress.lastReadAt);
  // 真实进度：按「已读章节 + 本章滚动比例」折算，不估算阅读时长
  const percent = useMemo(() => {
    if (!progress || total <= 0) return 0;
    const inChapter = progress.readingMode === "scroll" ? Math.min(Math.max(progress.scrollPosition, 0), 1) : 0;
    return Math.min(100, Math.round(((progress.chapterIndex + inChapter) / total) * 100));
  }, [progress, total]);

  /** 导出这本为 EPUB：正文按章重建，批注用高亮＋附录两种方式带上。 */
  const handleExportEpub = async () => {
    setExporting(true);
    setExportNote(null);
    try {
      const result = await exportBookAsEpub(book);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeFileName(book.title) + ".epub";
      anchor.click();
      URL.revokeObjectURL(url);
      setExportNote(
        `已导出 ${result.chapters} 章、${result.notes + result.annotations} 条批注` +
          (result.cover ? "，含封面。" : "（这本书没有封面可不带）。") +
          "原书内嵌的插图不在书房正文数据里，导出文件中不会出现。",
      );
    } catch {
      setExportNote("导出失败，请稍后重试。");
    } finally {
      setExporting(false);
    }
  };

  const toc = data ? data.chapterTitles.slice(0, tocLimit) : [];
  const cover = book.cover && !coverFailed ? book.cover : undefined;

  return (
    <div className="sr-detail-mask" onClick={onClose}>
      <section
        className="sr-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`《${book.title}》详情`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sr-detail-grip" aria-hidden />
        <button type="button" className="sr-icon-btn sr-detail-close" onClick={onClose} aria-label="关闭详情，把书放回书架">
          <X size={20} strokeWidth={1.7} />
        </button>

        <div className="sr-detail-head">
          <div className="sr-detail-cover" data-fallback={cover ? undefined : "true"}>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={`《${book.title}》封面`} onError={() => setCoverFailed(true)} />
            ) : (
              <>
                <span className="sr-detail-cover-title">{book.title}</span>
                <span className="sr-detail-cover-tag">暂无封面</span>
              </>
            )}
          </div>
          <div className="sr-detail-info">
            <h2 className="sr-detail-title">{book.title}</h2>
            <div className="sr-detail-author">{book.author || "作者未知"}</div>
            <div className="sr-detail-meta">
              {book.format.toUpperCase()} · {total} 章
              {book.sourceLabel ? ` · 来自 ${book.sourceLabel}` : ""}
            </div>
            {book.tags && book.tags.length > 0 && (
              <div className="sr-detail-tags">
                {book.tags.slice(0, 6).map((tag) => <span key={tag} className="sr-detail-tag">{tag}</span>)}
              </div>
            )}
            <div className="sr-detail-progress" aria-label={`阅读进度 ${percent}%`}>
              <div className="sr-progress"><i style={{ width: `${percent}%` }} /></div>
              <span>{started ? `已读 ${percent}%` : "未开始"}</span>
            </div>
          </div>
        </div>

        <div className="sr-detail-actions">
          <button
            type="button"
            className="sr-btn sr-btn-primary"
            onClick={() => onRead(book)}
          >
            <BookOpen size={18} strokeWidth={1.7} />
            {started ? `继续阅读${progress ? ` · 第 ${progress.chapterIndex + 1} 章` : ""}` : "开始阅读"}
          </button>
        </div>
        {extraActions && <div className="sr-detail-extra">{extraActions}</div>}
        {exportNote && <p className="sr-note-meta" style={{ margin: "8px 2px 0", lineHeight: 1.7 }}>{exportNote}</p>}

        <div className="sr-detail-scroll">
          <h3 className="sr-detail-h">简介</h3>
          <p className="sr-detail-desc">
            {book.description?.trim() || "来源没有提供简介。"}
          </p>

          <h3 className="sr-detail-h">目录</h3>
          {data === null ? (
            <p className="sr-detail-muted">正在读取目录…</p>
          ) : data.chapterTitles.length === 0 ? (
            <p className="sr-detail-muted">这本书没有可识别的章节。</p>
          ) : (
            <ol className="sr-detail-toc">
              {toc.map((title, index) => (
                <li key={index}>
                  <button type="button" onClick={() => onRead(book, index, 0)} data-current={progress?.chapterIndex === index ? "true" : undefined}>
                    <span className="sr-detail-toc-no">{index + 1}</span>
                    <span className="sr-detail-toc-title">{title || `第 ${index + 1} 章`}</span>
                  </button>
                </li>
              ))}
              {data.chapterTitles.length > TOC_PREVIEW && (
                <li>
                  {tocLimit < data.chapterTitles.length ? (
                    <button
                      type="button"
                      className="sr-detail-more"
                      onClick={() =>
                        setTocLimit((limit) => Math.min(limit + TOC_STEP, data.chapterTitles.length))
                      }
                    >
                      再看 {Math.min(TOC_STEP, data.chapterTitles.length - tocLimit)} 章（共 {data.chapterTitles.length} 章）
                    </button>
                  ) : (
                    <button type="button" className="sr-detail-more" onClick={() => setTocLimit(TOC_PREVIEW)}>
                      收起目录
                    </button>
                  )}
                </li>
              )}
            </ol>
          )}

          <h3 className="sr-detail-h">我的笔记与划线</h3>
          {data === null ? null : data.notes.length === 0 && data.bookmarks.length === 0 ? (
            <p className="sr-detail-muted">还没有笔记。阅读时选中文字即可书摘或批注。</p>
          ) : (
            <ul className="sr-detail-notes">
              {data.bookmarks.map((mark) => (
                <li key={mark.id}>
                  <button type="button" onClick={() => onRead(book, mark.chapterIndex, mark.paragraphIndex)}>
                    <Bookmark size={14} strokeWidth={1.8} />
                    <span className="sr-detail-note-text">书签 · {data.chapterTitles[mark.chapterIndex] || `第 ${mark.chapterIndex + 1} 章`}</span>
                  </button>
                </li>
              ))}
              {data.notes.map((note) => (
                <li key={note.id}>
                  <button type="button" onClick={() => onRead(book, note.chapterIndex, note.paragraphIndex)}>
                    {note.kind === "note" ? <PenLine size={14} strokeWidth={1.8} /> : <Quote size={14} strokeWidth={1.8} />}
                    <span className="sr-detail-note-text">
                      {note.emoji ? `${note.emoji} ` : null}
                      「{note.quote.length > 40 ? `${note.quote.slice(0, 40)}…` : note.quote}」
                      {note.content ? <em> {note.content}</em> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {data !== null && data.annotations.length > 0 && (
            <>
              <h3 className="sr-detail-h">角色批注</h3>
              <ul className="sr-detail-notes">
                {data.annotations.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => onRead(book, item.chapterIndex, item.paragraphIndex)}>
                      <MessagesSquare size={14} strokeWidth={1.8} />
                      <span className="sr-detail-note-text">
                        {item.emoji ? `${item.emoji} ` : null}
                        <strong>{item.characterName}</strong>：{item.content.length > 46 ? `${item.content.slice(0, 46)}…` : item.content}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <StudyRoomStageSummary book={book} onOpenChapter={(chapterIndex) => onRead(book, chapterIndex, 0)} />

          <h3 className="sr-detail-h">共读记录</h3>
          {data === null ? null : data.coread.length === 0 ? (
            <p className="sr-detail-muted">还没有和角色共读这本书。阅读时点右上角共读按钮开始。</p>
          ) : (
            <ul className="sr-detail-notes">
              {data.coread.map((ref) => (
                <li key={ref.sessionId}>
                  <button type="button" onClick={onOpenMessages}>
                    <MessagesSquare size={14} strokeWidth={1.8} />
                    <span className="sr-detail-note-text">与 {ref.name} 共读 · {new Date(ref.updatedAt).toLocaleDateString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="sr-detail-footer">
            {onMove && (
              <>
                <button type="button" className="sr-btn" onClick={() => onMove(-1)} aria-label="在书架上左移一格">
                  <ChevronLeft size={16} strokeWidth={1.8} /> 左移
                </button>
                <button type="button" className="sr-btn" onClick={() => onMove(1)} aria-label="在书架上右移一格">
                  右移 <ChevronRight size={16} strokeWidth={1.8} />
                </button>
              </>
            )}
            {book.sourceUrl && (
              <a className="sr-btn" href={book.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} strokeWidth={1.8} /> 来源页
              </a>
            )}
            <button type="button" className="sr-btn" onClick={() => void handleExportEpub()} disabled={exporting}>
              {exporting ? <Loader2 size={16} className="sr-spin" /> : <FileDown size={16} strokeWidth={1.8} />}
              导出 EPUB
            </button>
            <button type="button" className="sr-btn sr-btn-danger" onClick={() => onRemove(book)}>
              <Trash2 size={16} strokeWidth={1.8} /> 移出书架
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
