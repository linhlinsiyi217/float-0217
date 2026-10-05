"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BookOpen,
  ChevronLeft,
  Coins,
  Compass,
  Download,
  FastForward,
  History,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  Wallet,
  X,
} from "lucide-react";

import { importBookFromBlob } from "@/lib/study-room/import";
import { HelpFoot, HelpTip } from "./help-tip";
import {
  AVAILABILITY_LABEL,
  CANDIDATES_PER_DRAW,
  DRAW_CATEGORIES,
  DRAW_PRICE,
  beginDraw,
  cardKey,
  clearDrawHistory,
  drawBooks,
  drawCategory,
  finishDraw,
  hasFreeDraw,
  loadDrawState,
  pityFreeAvailable,
  quoteDraw,
  saveDrawState,
  toggleSavedCard,
  walletBalance,
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

/** 第一步抽分类，第二步在分类里抽候选书。 */
type Step = "category" | "books";
/** 舞台节奏：蓄力 → 爆发 → 卡背落下 → 逐张翻牌 → 落定 */
type Phase = "idle" | "charge" | "burst" | "backs" | "reveal" | "done";

const SKIP_KEY = "sr_draw_skip_animation";
const PARTICLES = Array.from({ length: 14 }, (_, index) => index);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * 抽一本：随机抽出分类 → 在该分类里抽几张候选书 → 用户挑想读的一本。
 * 用的是小手机统一钱包；抽分类不收费，抽书时才扣费，扣费前先确认。
 * 扣费与结果按挂单幂等保存：重复点、中途关、重试都不会重复扣费。
 * 动画只表示这次的稀有感，不改变抽到什么；可以跳过或快速揭晓。
 */
export function StudyRoomDraw({ onBack, onRead, onImported }: StudyRoomDrawProps) {
  const [step, setStep] = useState<Step>("category");
  const [phase, setPhase] = useState<Phase>("idle");
  const [state, setState] = useState<DrawState>(() => loadDrawState());
  const [category, setCategory] = useState<DrawCategory | null>(null);
  const [candidates, setCandidates] = useState<DrawCandidate[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [selected, setSelected] = useState(0);
  const [confirming, setConfirming] = useState<1 | 5 | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookSearchResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [balance, setBalance] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const fastRef = useRef(false);
  const drawingRef = useRef(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
    try {
      setSkipAnimation(window.localStorage.getItem(SKIP_KEY) === "1");
    } catch {
      /* 读不到偏好就按默认 */
    }
    setBalance(walletBalance());
    if (loadDrawState().pending) {
      setNotice("上次有一次已经结算的抽取还没出结果。抽到分类后再抽书，会沿用那一次，不会再扣费。");
    }
    return () => {
      runRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const flash = (message: string, ms = 2800) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), ms);
  };

  const toggleSkip = () => {
    setSkipAnimation((value) => {
      try {
        window.localStorage.setItem(SKIP_KEY, value ? "0" : "1");
      } catch {
        /* 存不了就只在本次生效 */
      }
      return !value;
    });
  };

  /** 等一段动画时间；被打断（离开、重新开始）返回 false。跳过 / 快速揭晓时立即返回。 */
  const pause = (ms: number, run: number) =>
    new Promise<boolean>((resolve) => {
      const wait = fastRef.current ? 0 : reduced ? Math.min(ms, 160) : ms;
      if (wait <= 0) {
        resolve(runRef.current === run);
        return;
      }
      window.setTimeout(() => resolve(runRef.current === run), wait);
    });

  /**
   * 播放一轮抽卡。结果由 work 决定（动画开始前或同时就定了），动画只负责展示：
   * 跳过 / 快速揭晓只是少等，不会重新抽，也不会再扣费。
   */
  const play = async <T,>(work: Promise<T>, onResult: (result: T) => number): Promise<boolean> => {
    const run = ++runRef.current;
    fastRef.current = skipAnimation;
    setRevealed(0);
    setSelected(0);
    setPhase("charge");
    const [result] = await Promise.all([work, pause(1100, run)]);
    if (runRef.current !== run) return false;
    const count = onResult(result);
    if (count <= 0) {
      setPhase("idle");
      return false;
    }
    setPhase("burst");
    if (!(await pause(520, run))) return false;
    setPhase("backs");
    if (!(await pause(420, run))) return false;
    setPhase("reveal");
    for (let index = 1; index <= count; index += 1) {
      setRevealed(index);
      if (!(await pause(index === count ? 560 : 440, run))) return false;
    }
    setPhase("done");
    return true;
  };

  /** 快速揭晓：剩下的卡一次翻开（结果早已确定）。 */
  const revealAll = () => {
    fastRef.current = true;
    setRevealed(step === "category" ? 1 : candidates.length);
  };

  /** 第一步：随机抽分类（免费）。 */
  const drawCategoryCard = async () => {
    if (drawingRef.current) return;
    drawingRef.current = true;
    setStep("category");
    setCandidates([]);
    try {
      const pick = drawCategory();
      await play(Promise.resolve(pick), (value) => {
        setCategory(value);
        return 1;
      });
    } finally {
      drawingRef.current = false;
    }
  };

  const goToBooks = () => {
    setStep("books");
    setPhase("idle");
    setCandidates([]);
  };

  /** 点了抽书：要收费就先确认；免费或沿用已付的那一次直接开始。 */
  const requestDraw = (count: 1 | 5) => {
    if (drawingRef.current) return;
    const current = loadDrawState();
    if (current.pending || quoteDraw(current, count).free) {
      void runDraw(count);
      return;
    }
    setConfirming(count);
  };

  /** 第二步：结算（幂等）→ 抽候选 → 揭晓 → 选择。 */
  const runDraw = async (count: 1 | 5) => {
    if (!category || drawingRef.current) return;
    drawingRef.current = true;
    setConfirming(null);
    try {
      const { state: settled, payment, pending } = beginDraw(loadDrawState(), count);
      setState(settled);
      setBalance(walletBalance());
      if (!payment.ok || !pending) {
        flash(`${payment.error ?? "余额不足，无法抽取。"}没有扣费，也没有开始抽取。`, 3600);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setCandidates([]);
      setStep("books");
      const work = drawBooks(category, CANDIDATES_PER_DRAW[pending.count], controller.signal).catch(() => [] as DrawCandidate[]);
      let got = false;
      await play(work, (result) => {
        if (controller.signal.aborted) return 0;
        if (result.length === 0) {
          flash(
            `「${category.label}」这次没抽到能读的书（书架里没有相关的，公开来源也没返回可导入或可预览的版本）。` +
              "这一次已结算的抽取保留着：重试或换一类再抽都不会再扣费。",
            5200,
          );
          return 0;
        }
        setCandidates(result);
        // 结果一出来就入账并结掉挂单：之后关掉页面也不会丢结果、不会重复扣费
        setState(finishDraw(loadDrawState(), { category, candidates: result }));
        got = true;
        if (payment.resumed) flash("沿用了上次已结算的那一次，没有再扣费");
        else if (payment.free) flash("这次免费，没有扣余额");
        else flash(`已从钱包扣 ${payment.cost}`);
        return result.length;
      });
      if (!got) setPhase("idle");
    } finally {
      drawingRef.current = false;
      setBalance(walletBalance());
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
  const animating = phase !== "idle" && phase !== "done";
  const newCount = candidates.filter((item) => !item.duplicate).length;
  const rarity = newCount >= 4 ? "burst" : newCount >= 2 ? "shimmer" : "calm";
  const chosen = step === "books" && phase === "done" ? candidates[selected] : undefined;
  const confirmQuote = confirming ? quoteDraw(state, confirming) : null;

  return (
    <section className="sr-app">
      <header className="sr-header">
        <div className="sr-header-safe" />
        <div className="sr-header-row">
          <button
            type="button"
            className="sr-icon-btn"
            onClick={() => {
              if (step === "books" && !animating) {
                setStep("category");
                setPhase(category ? "done" : "idle");
              } else onBack();
            }}
            aria-label={step === "books" ? "返回分类" : "返回书房"}
          >
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
          <div>
            <div className="sr-header-title">抽一本</div>
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
              抽分类免费 · 单抽 {DRAW_PRICE.single} · 五连 {DRAW_PRICE.five}
              {free ? " · 今日首次单抽免费" : ""}
              {pity ? " · 保底：下次单抽免费" : ""}
            </span>
            <HelpTip id="draw-wallet" label="怎么收费、概率是多少">
              用的是小手机统一的虚拟钱包（和钱包应用里同一笔余额，不是真钱，也不另造币）。
              抽分类不收费；抽书时才扣费：单抽 {DRAW_PRICE.single}（翻开 {CANDIDATES_PER_DRAW[1]} 张候选），
              五连 {DRAW_PRICE.five}（翻开 {CANDIDATES_PER_DRAW[5]} 张）。每天第一次单抽免费；连续两次没抽到新书，下一次单抽免费。
              扣费前会先确认；余额不足不扣费、不开始。扣费后中途关掉，下次再抽会沿用这一次，不会重复扣。
              概率：{DRAW_CATEGORIES.length} 个分类各占 1/{DRAW_CATEGORIES.length}；候选书在该分类里随机，没抽到过的优先，
              重复的垫底并标出来。卡面光效只看这次有几本新书，和书的好坏无关，也不影响抽到什么。
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
                      className="sr-btn sr-btn-sm"
                      onClick={() => {
                        if (!confirm("清空抽取记录？（只是记录，不影响书架里的书，也不退款）")) return;
                        setState(clearDrawHistory());
                        flash("已清空记录", 2000);
                      }}
                    >
                      <X size={13} strokeWidth={1.8} /> 清空记录
                    </button>
                  </div>
                </>
              )}
              {state.savedCards.length > 0 && (
                <>
                  <div className="sr-section-label">收藏的卡（纪念用，不是购买）</div>
                  <div className="sr-chip-row">
                    {state.savedCards.slice(0, 30).map((card) => (
                      <span key={card.key} className="sr-note-tag">
                        {card.categoryLabel} ·《{card.title}》
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          <div className="sr-section-label">{step === "category" ? "第一步：抽分类（免费）" : `第二步：在「${category?.label ?? ""}」里抽书`}</div>

          {/* ── 抽卡舞台：局部深色，与日常纯白界面分开 ── */}
          <div
            className="sr-draw-stage"
            data-phase={phase}
            data-step={step}
            data-rarity={step === "books" && phase !== "idle" ? rarity : undefined}
            data-reduced={reduced ? "true" : undefined}
          >
            <span className="sr-draw-aura" aria-hidden />
            <span className="sr-draw-particles" aria-hidden>
              {PARTICLES.map((index) => (
                <i key={index} style={{ "--a": `${(360 / PARTICLES.length) * index}deg`, "--d": `${(index % 4) * 40}ms` } as CSSProperties} />
              ))}
            </span>

            {phase === "idle" && (
              <div className="sr-draw-idle">
                {step === "category" ? (
                  <div className="sr-draw-pile" aria-hidden>
                    {DRAW_CATEGORIES.slice(0, 5).map((item, index) => (
                      <span key={item.id} className="sr-draw-pile-card" style={{ "--i": index, "--accent": item.accent } as CSSProperties} />
                    ))}
                  </div>
                ) : (
                  category && <CategoryFace category={category} small />
                )}
              </div>
            )}

            {phase === "charge" && <div className="sr-draw-charge-text">{step === "category" ? "洗牌中…" : "正在从书架与公开来源里抽…"}</div>}

            {(phase === "backs" || phase === "reveal" || phase === "done") && (
              <div className="sr-draw-slots" data-count={step === "category" ? 1 : candidates.length}>
                {step === "category" && category ? (
                  <FlipCard index={0} flipped={revealed >= 1} kind="category" accent={category.accent}>
                    <CategoryFace category={category} />
                  </FlipCard>
                ) : (
                  candidates.map((item, index) => (
                    <FlipCard
                      key={item.id}
                      index={index}
                      flipped={revealed > index}
                      kind="book"
                      selected={phase === "done" && selected === index}
                      onSelect={phase === "done" ? () => setSelected(index) : undefined}
                      label={`选择《${item.title}》`}
                    >
                      <BookFace item={item} />
                    </FlipCard>
                  ))
                )}
              </div>
            )}

            {animating && (
              <div className="sr-draw-stage-tools">
                <button type="button" className="sr-draw-ghost" onClick={revealAll}>
                  <FastForward size={14} strokeWidth={1.8} />
                  {phase === "charge" ? "跳过动画" : "全部翻开"}
                </button>
              </div>
            )}
          </div>

          {/* ── 舞台下方的操作 ── */}
          {confirming && confirmQuote ? (
            <div className="sr-note-card sr-draw-confirm">
              <div className="sr-forum-name">确认抽书</div>
              <p className="sr-note-meta" style={{ lineHeight: 1.75, margin: "4px 0 10px" }}>
                这次{confirming === 5 ? "五连" : "单抽"}将从钱包扣 <strong>{confirmQuote.cost}</strong>（当前余额 {balance.toFixed(2)}），
                翻开 {CANDIDATES_PER_DRAW[confirming]} 张候选。扣费后即使中途关掉，下次也会沿用这一次，不会重复扣。
              </p>
              <div className="sr-actions">
                <button type="button" className="sr-btn" onClick={() => setConfirming(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className="sr-btn sr-btn-primary"
                  onClick={() => void runDraw(confirming)}
                  disabled={balance < confirmQuote.cost}
                >
                  {balance < confirmQuote.cost ? "余额不足" : `确认，扣 ${confirmQuote.cost}`}
                </button>
              </div>
            </div>
          ) : step === "category" ? (
            <div className="sr-actions" style={{ marginTop: 12 }}>
              {phase === "done" && category ? (
                <>
                  <button type="button" className="sr-btn sr-btn-primary" onClick={goToBooks}>
                    <BookOpen size={16} strokeWidth={1.7} />
                    就这一类，去抽书
                  </button>
                  <button type="button" className="sr-btn" onClick={() => void drawCategoryCard()}>
                    <RefreshCw size={15} strokeWidth={1.7} />
                    重抽分类
                  </button>
                </>
              ) : (
                <button type="button" className="sr-btn sr-btn-primary" onClick={() => void drawCategoryCard()} disabled={animating}>
                  <Layers size={16} strokeWidth={1.7} />
                  抽分类卡
                </button>
              )}
              <SkipToggle on={skipAnimation} onToggle={toggleSkip} />
            </div>
          ) : (
            <>
              {phase !== "done" && (
                <div className="sr-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="sr-btn sr-btn-primary" onClick={() => requestDraw(1)} disabled={animating}>
                    {animating ? <Loader2 size={15} className="sr-spin" /> : <Sparkles size={15} strokeWidth={1.7} />}
                    单抽 · {state.pending ? "已结算" : free || pity ? "免费" : DRAW_PRICE.single}
                  </button>
                  <button type="button" className="sr-btn" onClick={() => requestDraw(5)} disabled={animating}>
                    <Layers size={15} strokeWidth={1.7} />
                    五连 · {state.pending ? "已结算" : DRAW_PRICE.five}
                  </button>
                  <SkipToggle on={skipAnimation} onToggle={toggleSkip} />
                </div>
              )}

              {chosen && (
                <div className="sr-note-card sr-draw-chosen">
                  <div className="sr-draw-title">{chosen.title}</div>
                  <div className="sr-note-meta">
                    {[chosen.author, chosen.year, chosen.sourceLabel].filter(Boolean).join(" · ") || "来源未标注"}
                  </div>
                  {chosen.description && <p className="sr-draw-desc">{chosen.description}</p>}
                  <div className="sr-chip-row" style={{ marginTop: 6 }}>
                    <span className="sr-draw-badge" data-kind={chosen.availability}>
                      {AVAILABILITY_LABEL[chosen.availability]}
                    </span>
                    {chosen.duplicate && <span className="sr-draw-badge" data-kind="duplicate">已在书架 / 抽到过</span>}
                  </div>
                  <div className="sr-actions" style={{ marginTop: 10 }}>
                    {chosen.availability === "shelf" && chosen.book && (
                      <button type="button" className="sr-btn sr-btn-primary" onClick={() => onRead(chosen.book!)}>
                        <BookOpen size={15} strokeWidth={1.8} />
                        开始阅读
                      </button>
                    )}
                    {chosen.availability === "import" && (
                      <button
                        type="button"
                        className="sr-btn sr-btn-primary"
                        onClick={() => void handleImport(chosen)}
                        disabled={importingId === chosen.id}
                      >
                        {importingId === chosen.id ? <Loader2 size={15} className="sr-spin" /> : <Download size={15} strokeWidth={1.8} />}
                        加入书架
                      </button>
                    )}
                    {chosen.raw ? (
                      <button type="button" className="sr-btn" onClick={() => setDetail(chosen.raw!)}>
                        <Compass size={15} strokeWidth={1.8} />
                        查看详情
                      </button>
                    ) : (
                      chosen.externalUrl && (
                        <a className="sr-btn" href={chosen.externalUrl} target="_blank" rel="noopener noreferrer">
                          <Compass size={15} strokeWidth={1.8} />
                          查看详情
                        </a>
                      )
                    )}
                    <button
                      type="button"
                      className="sr-btn"
                      onClick={() => category && setState(toggleSavedCard(state, chosen, category.label))}
                      title="只是收藏这张卡留作纪念，不会买书或加进书架"
                    >
                      <Star
                        size={15}
                        strokeWidth={1.8}
                        fill={state.savedCards.some((card) => card.key === cardKey(chosen)) ? "currentColor" : "none"}
                      />
                      {state.savedCards.some((card) => card.key === cardKey(chosen)) ? "已收藏卡" : "收藏卡"}
                    </button>
                  </div>
                  <p className="sr-note-meta" style={{ marginTop: 8 }}>点上面的卡切换候选，挑一本想读的。</p>
                </div>
              )}

              {phase === "done" && (
                <div className="sr-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="sr-btn" onClick={() => setPhase("idle")}>
                    <Sparkles size={15} strokeWidth={1.7} />
                    再抽一次
                  </button>
                  <button
                    type="button"
                    className="sr-btn"
                    onClick={() => {
                      setStep("category");
                      setPhase("idle");
                      setCandidates([]);
                    }}
                  >
                    <RefreshCw size={15} strokeWidth={1.7} />
                    换一类
                  </button>
                </div>
              )}
            </>
          )}

          <HelpFoot id="draw-source-about" label="关于抽到的书">
            <Coins size={12} strokeWidth={1.8} style={{ verticalAlign: -1, marginRight: 4 }} />
            抽到的是书目与可读来源，不是正文版权：能导入的导入到书架，能预览的在书房内预览，只有书目的标「仅推荐」。
          </HelpFoot>
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

function SkipToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="sr-chip" data-active={on ? "true" : undefined} onClick={onToggle} aria-pressed={on}>
      跳过动画
    </button>
  );
}

/** 一张可翻的卡：背面是统一卡背，正面是分类或书。 */
function FlipCard({
  index,
  flipped,
  kind,
  accent,
  selected,
  onSelect,
  label,
  children,
}: {
  index: number;
  flipped: boolean;
  kind: "category" | "book";
  accent?: string;
  selected?: boolean;
  onSelect?: () => void;
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="sr-flip"
      data-kind={kind}
      data-flipped={flipped ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      style={{ "--i": index, "--accent": accent ?? "#5C6B8A" } as CSSProperties}
      onClick={onSelect}
      disabled={!onSelect}
      aria-label={label}
      aria-pressed={onSelect ? selected : undefined}
    >
      <span className="sr-flip-inner">
        <span className="sr-flip-face sr-flip-back" aria-hidden>
          <span className="sr-flip-emblem">书</span>
        </span>
        <span className="sr-flip-face sr-flip-front">{children}</span>
      </span>
    </button>
  );
}

function CategoryFace({ category, small }: { category: DrawCategory; small?: boolean }) {
  return (
    <span className="sr-draw-catface" data-small={small ? "true" : undefined} style={{ "--accent": category.accent } as CSSProperties}>
      <span className="sr-draw-catface-kicker">分类</span>
      <span className="sr-draw-catface-name">{category.label}</span>
      <span className="sr-draw-catface-tags">{category.tags.slice(0, 3).join(" · ")}</span>
    </span>
  );
}

function BookFace({ item }: { item: DrawCandidate }) {
  return (
    <span className="sr-draw-bookface">
      <span className="sr-draw-bookface-cover">
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover} alt="" loading="lazy" />
        ) : (
          <span className="sr-draw-bookface-initial">{(item.title || "书").slice(0, 1)}</span>
        )}
        {!item.duplicate && <span className="sr-draw-bookface-new">新</span>}
      </span>
      <span className="sr-draw-bookface-meta">
        <span className="sr-draw-bookface-title">{item.title}</span>
        <span className="sr-draw-bookface-sub">{item.author || "佚名"}</span>
        <span className="sr-draw-bookface-sub">{item.sourceLabel ?? AVAILABILITY_LABEL[item.availability]}</span>
      </span>
    </span>
  );
}

export { saveDrawState };
