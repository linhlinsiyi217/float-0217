"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  Coins,
  Compass,
  Download,
  History,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";

import { importBookFromBlob } from "@/lib/study-room/import";
import { HelpTip } from "./help-tip";
import {
  AVAILABILITY_LABEL,
  DRAW_CATEGORIES,
  DRAW_PRICE,
  clearDrawHistory,
  drawBooks,
  hasFreeDraw,
  loadDrawState,
  payForDraw,
  pityFreeAvailable,
  recordDraw,
  saveDrawState,
  type DrawCandidate,
  type DrawCategory,
  type DrawState,
} from "@/lib/study-room/draw";
import type { Book } from "@/lib/reading-types";
import type { BookSearchResult } from "@/lib/study-room/book-source";
import { StudyRoomSourceDetail } from "./study-room-source-detail";

type StudyRoomDrawProps = {
  onBack: () => void;
  onRead: (book: Book) => void;
  onImported: () => void;
};

type Stage = "category" | "candidates";

/**
 * 抽一本：两阶段。
 * 第一步抽书籍分类卡，第二步在该分类内抽候选书（单抽 / 五连），再由用户选择阅读。
 * 用的是小手机统一虚拟钱包；视觉等级只表示这次动画的稀有感，不表示书的好坏。
 */
export function StudyRoomDraw({ onBack, onRead, onImported }: StudyRoomDrawProps) {
  const [stage, setStage] = useState<Stage>("category");
  const [state, setState] = useState<DrawState>(() => loadDrawState());
  const [category, setCategory] = useState<DrawCategory | null>(null);
  const [candidates, setCandidates] = useState<DrawCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookSearchResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [flipping, setFlipping] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    // 余额读自宿主钱包（同一份数据，不另造币）
    void import("@/lib/wallet-storage").then(({ loadWalletState, getWalletBalance }) => {
      setBalance(getWalletBalance(loadWalletState()));
    });
  }, [candidates, state]);

  const flash = (message: string, ms = 2600) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), ms);
  };

  /** 第一步：抽分类卡（翻牌揭晓）。 */
  const drawCategoryCard = () => {
    const pick = DRAW_CATEGORIES[Math.floor(Math.random() * DRAW_CATEGORIES.length)];
    setFlipping(true);
    window.setTimeout(
      () => {
        setCategory(pick);
        setFlipping(false);
        setStage("candidates");
        setCandidates(null);
      },
      skipAnimation ? 0 : 420,
    );
  };

  /** 第二步：在分类里抽候选书。 */
  const runDraw = async (target: DrawCategory, count: 1 | 5) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setCandidates(null);
    setNotice(null);

    const pityFree = pityFreeAvailable(state) && count === 1;
    const { state: paidState, payment } = payForDraw(state, count, pityFree);
    if (!payment.ok) {
      setBusy(false);
      flash(payment.error ?? "余额不足，无法抽取。", 3400);
      return;
    }
    setState(paidState);

    try {
      const result = await drawBooks(target, count, controller.signal);
      if (controller.signal.aborted) return;
      setCandidates(result);
      if (result.length === 0) {
        flash(`「${target.label}」这一类暂时抽不到能读的书：书架里没有相关的，公共来源这次也没返回可导入的版本。可以换一类再抽。`, 4600);
        return;
      }
      const next = recordDraw(paidState, { category: target, candidates: result, count, cost: payment.cost, free: payment.free });
      setState(next);
      if (payment.free) flash(pityFree ? "这次保底免费，没有扣余额" : "今天第一次免费，没有扣余额", 2600);
    } catch {
      if (!controller.signal.aborted) {
        setCandidates([]);
        flash("这次没能取到候选书，可能是来源暂时不可用；可以重试或换一类。", 3400);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const handleImport = async (item: DrawCandidate) => {
    if (!item.importFile) return;
    setImportingId(item.id);
    try {
      const url = item.importFile.url.startsWith("/")
        ? item.importFile.url
        : `/api/study-room/fetch?url=${encodeURIComponent(item.importFile.url)}`;
      const response = await fetch(url);
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

  const free = hasFreeDraw(state);
  const pity = pityFreeAvailable(state);

  return (
    <section className="sr-app">
      <header className="sr-header">
        <div className="sr-header-safe" />
        <div className="sr-header-row">
          <button
            type="button"
            className="sr-icon-btn"
            onClick={() => (stage === "candidates" ? setStage("category") : onBack())}
            aria-label={stage === "candidates" ? "返回分类" : "返回书房"}
          >
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <div>
            <div className="sr-header-title">抽一本</div>
            <span className="sr-header-sub">
              {stage === "category" ? "第一步：抽分类" : `第二步：抽书 · ${category?.label ?? ""}`}
            </span>
          </div>
          <button type="button" className="sr-icon-btn" onClick={() => setShowHistory((v) => !v)} aria-label="抽取记录" title="抽取记录">
            <History size={20} strokeWidth={1.7} />
          </button>
        </div>
      </header>

      <div className="sr-body">
        <div className="sr-tab-pane">
          {notice && (
            <div className="sr-note-card">
              <div className="sr-note-meta" style={{ lineHeight: 1.75 }}>{notice}</div>
            </div>
          )}

          <div className="sr-draw-wallet">
            <span>
              <Wallet size={14} strokeWidth={1.7} /> 余额 {balance.toFixed(2)}
            </span>
            <span className="sr-note-meta">
              单抽 {DRAW_PRICE.single} · 五连 {DRAW_PRICE.five}
              {free ? " · 今日首次免费" : ""}
              {pity ? " · 已触发保底（下次单抽免费）" : ""}
            </span>
            <HelpTip id="draw-wallet" label="抽一本怎么收费">
              抽一本用的是小手机统一的虚拟钱包（和钱包应用里是同一笔余额），不是另造的币。
              今天第一次抽不扣费；之后单抽 {DRAW_PRICE.single}、五连 {DRAW_PRICE.five}。余额不足会直接提示，不会扣费也不会出结果。
              连续两次没抽到新书时，下一次单抽免费——这只是保底不扣费，不改变抽到什么。
            </HelpTip>
          </div>

          {showHistory && (
            <>
              <div className="sr-section-label">抽取记录</div>
              {state.records.length === 0 ? (
                <p className="sr-note-meta">还没有抽取记录。</p>
              ) : (
                <>
                  <ul className="sr-review-list">
                    {state.records.slice(0, 12).map((record) => (
                      <li key={record.id}>
                        <span className="sr-detail-note-text">
                          {new Date(record.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {record.categoryLabel} · {record.count === 5 ? "五连" : "单抽"} ·{" "}
                          {record.free ? "免费" : `${record.cost} 币`}
                          <br />
                          {record.titles.join("、")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="sr-css-actions">
                    <button
                      type="button"
                      className="sr-chip"
                      onClick={() => {
                        if (!confirm("清空抽取记录？（只是记录，不影响书架里的书）")) return;
                        setState(clearDrawHistory());
                        flash("已清空记录", 2000);
                      }}
                    >
                      <X size={13} strokeWidth={1.8} /> 清空记录
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {stage === "category" ? (
            <>
              <div className="sr-section-label">第一步：抽一张分类卡</div>
              <div className="sr-draw-deck">
                {DRAW_CATEGORIES.map((item, index) => (
                  <span
                    key={item.id}
                    className="sr-draw-back"
                    data-flipping={flipping && index === 0 ? "true" : undefined}
                    style={{ animationDelay: `${index * 40}ms`, ["--accent" as string]: item.accent }}
                    aria-hidden
                  />
                ))}
              </div>
              <div className="sr-actions" style={{ marginTop: 12 }}>
                <button type="button" className="sr-btn sr-btn-primary" onClick={drawCategoryCard} disabled={flipping}>
                  <Layers size={16} strokeWidth={1.7} />
                  抽一张分类卡
                </button>
                <button
                  type="button"
                  className="sr-chip"
                  data-active={skipAnimation ? "true" : undefined}
                  onClick={() => setSkipAnimation((value) => !value)}
                >
                  跳过动画
                </button>
              </div>
              <p className="sr-note-meta" style={{ marginTop: 12, lineHeight: 1.8 }}>
                先抽到分类，再从该分类里抽书。候选只出现真的能读的书：你已导入的、能导入的公版正文、或能预览的版本。
                没有付费诱导、没有稀有度影响书的质量。
              </p>
            </>
          ) : (
            <>
              <div className="sr-draw-category">
                <span className="sr-draw-category-check" aria-hidden>
                  <Sparkles size={15} strokeWidth={1.8} />
                </span>
                抽到分类：<strong>{category?.label}</strong>
                <span className="sr-note-meta">（{category?.tags.slice(0, 3).join(" / ")}）</span>
              </div>

              <div className="sr-actions" style={{ marginBottom: 10 }}>
                <button type="button" className="sr-btn sr-btn-primary" onClick={() => category && void runDraw(category, 1)} disabled={busy}>
                  {busy ? <Loader2 size={15} className="sr-spin" /> : <Sparkles size={15} strokeWidth={1.7} />}
                  单抽（{free || pity ? "免费" : `${DRAW_PRICE.single} 币`}）
                </button>
                <button type="button" className="sr-btn" onClick={() => category && void runDraw(category, 5)} disabled={busy}>
                  <Layers size={15} strokeWidth={1.7} />
                  五连（{DRAW_PRICE.five} 币）
                </button>
                <button type="button" className="sr-btn" onClick={() => setStage("category")} disabled={busy}>
                  <RefreshCw size={15} strokeWidth={1.7} />
                  重抽分类
                </button>
              </div>

              {busy ? (
                <div className="sr-empty" style={{ paddingTop: 30 }}>
                  <Loader2 size={28} className="sr-spin" />
                  <p>正在从书架与公开来源里抽…</p>
                </div>
              ) : candidates && candidates.length > 0 ? (
                <ul className="sr-draw-list">
                  {candidates.map((item, index) => (
                    <li
                      key={item.id}
                      className="sr-draw-card"
                      data-flipping={skipAnimation ? undefined : "true"}
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
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
                        <div className="sr-chip-row" style={{ marginTop: 4 }}>
                          <span className="sr-draw-badge" data-kind={item.availability}>
                            {AVAILABILITY_LABEL[item.availability]}
                          </span>
                          {item.duplicate && <span className="sr-draw-badge" data-kind="duplicate">已在书架 / 抽到过</span>}
                        </div>
                        <div className="sr-css-actions">
                          {item.availability === "shelf" && item.book && (
                            <button type="button" className="sr-chip" onClick={() => onRead(item.book!)}>
                              <BookOpen size={13} strokeWidth={1.8} />开始阅读
                            </button>
                          )}
                          {item.availability === "import" && (
                            <button type="button" className="sr-chip" onClick={() => void handleImport(item)} disabled={importingId === item.id}>
                              {importingId === item.id ? <Loader2 size={13} className="sr-spin" /> : <Download size={13} strokeWidth={1.8} />}
                              加入书架
                            </button>
                          )}
                          {item.raw ? (
                            <button type="button" className="sr-chip" onClick={() => setDetail(item.raw!)}>
                              <Compass size={13} strokeWidth={1.8} />查看详情
                            </button>
                          ) : (
                            item.externalUrl && (
                              <a className="sr-chip" href={item.externalUrl} target="_blank" rel="noopener noreferrer">
                                <Compass size={13} strokeWidth={1.8} />查看详情
                              </a>
                            )
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="sr-empty" style={{ paddingTop: 26 }}>
                  <Sparkles size={34} strokeWidth={1} />
                  <p>
                    这一步还没有抽取结果。
                    <br />
                    点上面的「单抽」或「五连」抽一批；抽不到能读的书时会如实说明。
                  </p>
                </div>
              )}
            </>
          )}

          <p className="sr-note-meta" style={{ marginTop: 14, lineHeight: 1.8 }}>
            <Coins size={12} strokeWidth={1.8} style={{ verticalAlign: -1, marginRight: 4 }} />
            抽到的是书目与可读来源，不是正文版权：能导入的会导入到书架，能预览的在书房内预览，
            只有书目的会标「仅推荐」。动画只表示这次的稀有感，不表示书好坏。
          </p>
        </div>
      </div>

      {detail && (
        <StudyRoomSourceDetail
          item={detail}
          onClose={() => setDetail(null)}
          onRead={(book) => {
            setDetail(null);
            onRead(book);
          }}
        />
      )}
    </section>
  );
}

export { saveDrawState };
