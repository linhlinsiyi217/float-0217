"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, RefreshCw, Sparkles, BookOpen, Download, Compass, Shuffle } from "lucide-react";

import { importBookFromBlob } from "@/lib/study-room/import";
import {
  DRAW_CATEGORIES,
  categoryById,
  drawBooks,
  drawCategory,
  type DrawCandidate,
  type DrawCategory,
} from "@/lib/study-room/draw";
import type { Book } from "@/lib/reading-types";

type StudyRoomDrawProps = {
  onBack: () => void;
  onRead: (book: Book) => void;
  onImported: () => void;
};

type Stage = "category" | "cards";

const AVAILABILITY_LABEL: Record<DrawCandidate["availability"], string> = {
  shelf: "在我的书架",
  import: "可导入书房",
  preview: "可在线预览",
};

/**
 * 抽一本：先抽分类，再从「书架 / 真实可读书源」里给出候选。
 * 只出现真的能读的书；抽不到就如实说明，不摆空结果。
 * 没有付费、代币、稀有度或概率诱导。
 */
export function StudyRoomDraw({ onBack, onRead, onImported }: StudyRoomDrawProps) {
  const [stage, setStage] = useState<Stage>("category");
  const [category, setCategory] = useState<DrawCategory | null>(null);
  const [candidates, setCandidates] = useState<DrawCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [flipKey, setFlipKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runDraw = async (target: DrawCategory) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCategory(target);
    setStage("cards");
    setBusy(true);
    setCandidates(null);
    setNotice(null);
    try {
      const result = await drawBooks(target, 3, controller.signal);
      if (controller.signal.aborted) return;
      setCandidates(result);
      setFlipKey((key) => key + 1);
      if (result.length === 0) {
        setNotice(`「${target.label}」这一类暂时抽不到能读的书：书架里没有相关的，公共来源这次也没返回可导入的版本。`);
      }
    } catch {
      if (controller.signal.aborted) return;
      setCandidates([]);
      setNotice("这次没能取到候选书，可能是来源暂时不可用，换一类或过一会儿再试。");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const handleRedrawCategory = () => {
    void runDraw(drawCategory());
  };

  const handleImport = async (item: DrawCandidate) => {
    if (!item.importFile) return;
    setImportingId(item.id);
    try {
      const response = await fetch(`/api/study-room/fetch?url=${encodeURIComponent(item.importFile.url)}`);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      await importBookFromBlob(blob, `${item.title}.${item.importFile.format}`, undefined, item.cover);
      setNotice(`《${item.title}》已加入书架，可以开始读了。`);
      onImported();
    } catch {
      setNotice("导入失败，请稍后重试；也可以先点「查看详情」在原站看看。");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <section className="sr-app">
      <header className="sr-header">
        <div className="sr-header-safe" />
        <div className="sr-header-row">
          <button
            type="button"
            className="sr-icon-btn"
            onClick={() => (stage === "cards" ? setStage("category") : onBack())}
            aria-label={stage === "cards" ? "返回分类" : "返回书房"}
          >
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <div>
            <div className="sr-header-title">抽一本</div>
            <span className="sr-header-sub">{stage === "category" ? "先抽一个分类" : `分类：${category?.label ?? ""}`}</span>
          </div>
          <span style={{ width: 40 }} />
        </div>
      </header>

      <div className="sr-body">
        <div className="sr-tab-pane">
          {notice && (
            <div className="sr-note-card">
              <div className="sr-note-meta" style={{ lineHeight: 1.75 }}>{notice}</div>
            </div>
          )}

          {stage === "category" ? (
            <>
              <div className="sr-section-label">抽一个分类</div>
              <div className="sr-draw-cats">
                {DRAW_CATEGORIES.map((item) => (
                  <button key={item.id} type="button" className="sr-draw-cat" onClick={() => void runDraw(item)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="sr-actions" style={{ marginTop: 14 }}>
                <button type="button" className="sr-btn sr-btn-primary" onClick={handleRedrawCategory}>
                  <Shuffle size={16} strokeWidth={1.7} />
                  帮我抽一个
                </button>
              </div>
              <p className="sr-note-meta" style={{ marginTop: 12, lineHeight: 1.8 }}>
                只会抽出书房里真的能读的书：你已导入的书，或者公开来源里能导入 / 能预览的版本。
                没有付费、代币与稀有度。
              </p>
            </>
          ) : (
            <>
              <div className="sr-actions" style={{ marginBottom: 12 }}>
                <button type="button" className="sr-btn" onClick={() => void runDraw(category ?? drawCategory())} disabled={busy}>
                  {busy ? <Loader2 size={15} className="sr-spin" /> : <RefreshCw size={15} strokeWidth={1.7} />}
                  换一批
                </button>
                <button type="button" className="sr-btn" onClick={handleRedrawCategory} disabled={busy}>
                  <Shuffle size={15} strokeWidth={1.7} />
                  重抽分类
                </button>
              </div>

              {busy ? (
                <div className="sr-empty" style={{ paddingTop: 36 }}>
                  <Loader2 size={28} className="sr-spin" />
                  <p>正在从书架与公开来源里找…</p>
                </div>
              ) : candidates && candidates.length > 0 ? (
                <ul className="sr-draw-list">
                  {candidates.map((item, index) => (
                    <li key={item.id} className="sr-draw-card" style={{ animationDelay: `${index * 60}ms` }}>
                      <div className="sr-draw-cover" data-fallback={item.cover ? undefined : "true"}>
                        {item.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.cover} alt="" />
                        ) : (
                          <span>{(item.title || "书").slice(0, 1)}</span>
                        )}
                      </div>
                      <div className="sr-draw-main">
                        <div className="sr-draw-title">{item.title}</div>
                        <div className="sr-note-meta">
                          {[item.author, item.year, item.sourceLabel].filter(Boolean).join(" · ") || "来源未标注"}
                        </div>
                        {item.description && <p className="sr-draw-desc">{item.description}</p>}
                        <span className="sr-draw-badge" data-kind={item.availability}>
                          {AVAILABILITY_LABEL[item.availability]}
                        </span>
                        <div className="sr-css-actions">
                          {item.availability === "shelf" && item.book && (
                            <button type="button" className="sr-chip" onClick={() => onRead(item.book!)}>
                              <BookOpen size={13} strokeWidth={1.8} />开始阅读
                            </button>
                          )}
                          {item.availability === "import" && (
                            <button
                              type="button"
                              className="sr-chip"
                              onClick={() => void handleImport(item)}
                              disabled={importingId === item.id}
                            >
                              {importingId === item.id ? (
                                <Loader2 size={13} className="sr-spin" />
                              ) : (
                                <Download size={13} strokeWidth={1.8} />
                              )}
                              加入书架
                            </button>
                          )}
                          {item.externalUrl && (
                            <a className="sr-chip" href={item.externalUrl} target="_blank" rel="noopener noreferrer">
                              <Compass size={13} strokeWidth={1.8} />
                              查看详情
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="sr-empty" style={{ paddingTop: 28 }}>
                  <Sparkles size={34} strokeWidth={1} />
                  <p>
                    这一类暂时没有可读的候选。
                    <br />
                    可以重抽分类、换个分类试试，或者等网络恢复后再来。
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
