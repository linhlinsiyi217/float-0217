"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Loader2, Compass, RotateCw, Heart, BookOpen, Eye, Upload, Info, ChevronDown } from "lucide-react";

import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  KIND_LABEL,
  READABILITY_LABEL,
  hasCJK,
  type BookCategory,
  type BookKind,
  type BookSearchResult,
  type Readability,
  type SearchFailure,
} from "@/lib/study-room/book-source";
import { groupVersions, type ResultGroup } from "@/lib/study-room/search-rank";
import { addToWishlist, loadWishlist, removeFromWishlist } from "@/lib/study-room/wishlist";
import type { Book } from "@/lib/reading-types";
import { StudyRoomSourceDetail } from "./study-room-source-detail";

type KindFilter = BookKind | "all";

const KIND_CHIPS: Array<{ key: KindFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "novel", label: "小说" },
  { key: "comic", label: "漫画" },
  { key: "material", label: "资料" },
];

/** 可读能力筛选：默认先看能读的。 */
const READ_CHIPS: Array<{ key: Readability | "all"; label: string }> = [
  { key: "all", label: "全部状态" },
  { key: "readable", label: "全文可读" },
  { key: "preview", label: "可预览" },
  { key: "import", label: "需自行导入" },
];

const ERA_OPTIONS: Array<{ key: string; label: string; test: (year?: string) => boolean }> = [
  { key: "all", label: "不限年代", test: () => true },
  { key: "new", label: "2000 年后", test: (year) => Number(year ?? 0) >= 2000 },
  { key: "old", label: "1950 年前", test: (year) => Number(year ?? 9999) <= 1950 },
];

type StudyRoomStoreProps = {
  /** 导入或打开书架里的书 */
  onRead: (book: Book) => void;
};

export function StudyRoomStore({ onRead }: StudyRoomStoreProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [category, setCategory] = useState<BookCategory | "all">("all");
  const [readability, setReadability] = useState<Readability | "all">("all");
  const [source, setSource] = useState<string>("all");
  const [language, setLanguage] = useState<string>("all");
  const [era, setEra] = useState<string>("all");
  const [results, setResults] = useState<BookSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedSources, setFailedSources] = useState<SearchFailure[]>([]);
  const [aliasNote, setAliasNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [detail, setDetail] = useState<{ item: BookSearchResult; versions: BookSearchResult[] } | null>(null);
  const [showMaterial, setShowMaterial] = useState(false);
  const [wished, setWished] = useState<Set<string>>(() => new Set(loadWishlist().map((item) => item.id)));

  // 旧请求不能覆盖新搜索
  const abortRef = useRef<AbortController | null>(null);

  const flash = (message: string, ms = 2400) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), ms);
  };

  const runSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setFailedSources([]);
    setAliasNote(null);
    setNotice(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/study-room/search?q=${encodeURIComponent(q)}&kind=${kind}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("search failed");
      const data = (await res.json()) as { results: BookSearchResult[]; failed: SearchFailure[]; alias?: string };
      if (controller.signal.aborted) return;
      setResults(data.results ?? []);
      setFailedSources(data.failed ?? []);
      setAliasNote(data.alias ?? null);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setResults([]);
      setError("搜索服务暂时不可用，请稍后重试。");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const toggleWish = (item: BookSearchResult) => {
    const next = new Set(wished);
    if (next.has(item.id)) {
      removeFromWishlist(item.id);
      next.delete(item.id);
      flash("已从想读里移除");
    } else {
      addToWishlist(item);
      next.add(item.id);
      flash("已记在想读，可在「我的 → 想读的书」查看");
    }
    setWished(next);
  };

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const item of results ?? []) set.add(item.sourceLabel);
    return Array.from(set);
  }, [results]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const item of results ?? []) if (item.language) set.add(item.language);
    return Array.from(set).slice(0, 8);
  }, [results]);

  const filtered = useMemo(() => {
    const eraTest = ERA_OPTIONS.find((option) => option.key === era)?.test ?? (() => true);
    return (results ?? []).filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (readability !== "all" && item.readability !== readability) return false;
      if (source !== "all" && item.sourceLabel !== source) return false;
      if (language !== "all" && item.language !== language) return false;
      if (!eraTest(item.year)) return false;
      return true;
    });
  }, [results, category, readability, source, language, era]);

  // 能读的在前，仅资料的收在下方「资料」区
  const readableGroups = useMemo(() => groupVersions(filtered.filter((item) => item.readability !== "material")), [filtered]);
  const materialGroups = useMemo(() => groupVersions(filtered.filter((item) => item.readability === "material")), [filtered]);

  const cardActions = (item: BookSearchResult) => (
    <>
      {item.readability === "readable" && (
        <button
          type="button"
          className="sr-res-btn sr-res-btn--primary"
          onClick={() => setDetail({ item, versions: [] })}
        >
          <BookOpen size={15} strokeWidth={1.8} />
          开始阅读
        </button>
      )}
      {item.readability === "preview" && (
        <button type="button" className="sr-res-btn sr-res-btn--primary" onClick={() => setDetail({ item, versions: [] })}>
          <Eye size={15} strokeWidth={1.8} />
          应用内预览
        </button>
      )}
      {item.readability === "import" && (
        <button type="button" className="sr-res-btn" onClick={() => setDetail({ item, versions: [] })}>
          <Upload size={15} strokeWidth={1.8} />
          导入我的文件
        </button>
      )}
      <button
        type="button"
        className="sr-res-btn"
        data-active={wished.has(item.id) ? "true" : undefined}
        onClick={() => toggleWish(item)}
      >
        <Heart size={15} strokeWidth={1.8} fill={wished.has(item.id) ? "currentColor" : "none"} />
        {wished.has(item.id) ? "已想读" : "想读"}
      </button>
    </>
  );

  const renderGroup = (group: ResultGroup) => {
    const item = group.leader;
    const book = item;
    return (
      <div key={group.key} className="sr-res-card">
        <div className="sr-res-cover" style={book.cover ? { backgroundImage: `url("${book.cover}")` } : undefined}>
          {!book.cover && book.title.slice(0, 1)}
        </div>
        <div className="sr-res-main">
          <button
            type="button"
            className="sr-res-title sr-res-title--link"
            onClick={() => setDetail({ item, versions: group.versions })}
          >
            {book.title}
          </button>
          <div className="sr-res-meta">
            {book.authors.length > 0 ? book.authors.join(" / ") : "佚名"}
            {book.year ? ` · ${book.year}` : ""}
          </div>
          {book.description && <div className="sr-res-desc">{book.description}</div>}
          <div className="sr-res-tags">
            <span className="sr-res-source">{book.sourceLabel}</span>
            {book.category && <span className="sr-res-kind">{CATEGORY_LABEL[book.category]}</span>}
            {!book.category && <span className="sr-res-kind">{KIND_LABEL[book.kind]}</span>}
            <span className={`sr-res-read sr-res-read--${book.readability}`}>{READABILITY_LABEL[book.readability]}</span>
            {group.versions.length > 0 && (
              <button
                type="button"
                className="sr-res-more"
                onClick={() => setDetail({ item, versions: group.versions })}
              >
                另 {group.versions.length} 个版本
              </button>
            )}
          </div>
        </div>
        <div className="sr-res-actions">{cardActions(book)}</div>
      </div>
    );
  };

  return (
    <div>
      <form className="sr-search" onSubmit={runSearch}>
        <Search size={18} strokeWidth={1.6} color="var(--c-icon)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜书名、作者，或片段"
          aria-label="搜索书籍"
        />
        <button type="submit" className="sr-search-go" disabled={loading || !query.trim()}>
          {loading ? <Loader2 size={16} className="sr-spin" /> : "搜索"}
        </button>
      </form>

      <div className="sr-chip-row">
        {KIND_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="sr-chip"
            data-active={kind === chip.key ? "true" : undefined}
            onClick={() => setKind(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <details className="sr-filters">
        <summary>
          <Info size={14} strokeWidth={1.7} />
          分类与筛选
        </summary>
        <div className="sr-chip-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="sr-chip"
            data-active={category === "all" ? "true" : undefined}
            onClick={() => setCategory("all")}
          >
            全部类型
          </button>
          {CATEGORY_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className="sr-chip"
              data-active={category === key ? "true" : undefined}
              onClick={() => setCategory(key)}
            >
              {CATEGORY_LABEL[key]}
            </button>
          ))}
        </div>
        <div className="sr-chip-row" style={{ marginTop: 6 }}>
          {READ_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="sr-chip"
              data-active={readability === chip.key ? "true" : undefined}
              onClick={() => setReadability(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="sr-chip-row" style={{ marginTop: 6 }}>
          {ERA_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className="sr-chip"
              data-active={era === option.key ? "true" : undefined}
              onClick={() => setEra(option.key)}
            >
              {option.label}
            </button>
          ))}
          {sources.map((item) => (
            <button
              key={item}
              type="button"
              className="sr-chip"
              data-active={source === item ? "true" : undefined}
              onClick={() => setSource(source === item ? "all" : item)}
            >
              {item}
            </button>
          ))}
          {languages.map((item) => (
            <button
              key={item}
              type="button"
              className="sr-chip"
              data-active={language === item ? "true" : undefined}
              onClick={() => setLanguage(language === item ? "all" : item)}
            >
              {item}
            </button>
          ))}
        </div>
      </details>

      {notice && (
        <div className="sr-note-card">
          <div className="sr-note-meta">{notice}</div>
        </div>
      )}

      {aliasNote && (
        <div className="sr-note-card">
          <div className="sr-note-meta">已按别名「{aliasNote}」在各来源一并检索。</div>
        </div>
      )}

      {failedSources.length > 0 && (
        <div className="sr-note-card">
          <div className="sr-note-meta">
            这些来源这次没有返回结果：{failedSources.map((src) => src.label).join("、")}（
            {Array.from(new Set(failedSources.map((src) => src.reason ?? "暂时不可用"))).join("、")}）。其它来源的结果照常显示。
          </div>
        </div>
      )}

      {error && (
        <div className="sr-empty" style={{ paddingTop: 30 }}>
          <p>{error}</p>
          <button type="button" className="sr-btn" onClick={() => void runSearch()} style={{ marginTop: 10 }}>
            <RotateCw size={15} strokeWidth={1.8} /> 重新搜索
          </button>
        </div>
      )}

      {loading && (
        <div className="sr-empty" style={{ paddingTop: 40 }}>
          <Loader2 size={30} className="sr-spin" />
          <p>正在联网搜索…</p>
        </div>
      )}

      {!loading && !error && results && filtered.length === 0 && (
        <div className="sr-empty" style={{ paddingTop: 40 }}>
          <Compass size={42} strokeWidth={1} />
          <p>
            {searched ? "没有找到匹配的书。" : "输入书名或作者开始搜索。"}
            <br />
            可以试试书名片段或作者名；标点和繁简体都可以（「简爱」「简·爱」「Jane Eyre」都行）。
          </p>
          {kind === "comic" && hasCJK(query) && (
            <p style={{ marginTop: 8 }}>
              漫画来源以日文原名与英文名为主，中文名可能查不到：试试原作名（如 ONE PIECE），或切到「全部」看看其他来源。
            </p>
          )}
          <p style={{ marginTop: 8 }}>
            也可以放宽上面的筛选条件，或在「书架」页用「导入本地书」直接导入自己的 TXT / EPUB。
          </p>
        </div>
      )}

      {!loading && !error && readableGroups.length > 0 && (
        <div className="sr-res-list">
          <div className="sr-res-count">
            {readableGroups.length} 本可读或可预览 · 来自{" "}
            {Array.from(new Set(readableGroups.map((group) => group.leader.sourceLabel))).join(" / ")}
          </div>
          {readableGroups.map(renderGroup)}
        </div>
      )}

      {!loading && !error && materialGroups.length > 0 && (
        <div className="sr-res-list">
          <button type="button" className="sr-material-toggle" onClick={() => setShowMaterial((value) => !value)} aria-expanded={showMaterial}>
            <ChevronDown size={15} strokeWidth={1.8} style={{ transform: showMaterial ? "rotate(180deg)" : undefined }} />
            资料（{materialGroups.length}）
            <span className="sr-note-meta">公告、判决、纯书目等，没有正文阅读</span>
          </button>
          {showMaterial && materialGroups.map(renderGroup)}
        </div>
      )}

      {!loading && !error && (readableGroups.length > 0 || materialGroups.length > 0) && (
        <p className="sr-note-meta" style={{ marginTop: 16, textAlign: "center", lineHeight: 1.8 }}>
          可读状态按来源实际上架情况标注：全文可读可以直接导入书房，可预览在应用内看预览，
          需自行导入的书房拿不到正文。不会把只有封面的条目说成能读。
        </p>
      )}

      {detail && (
        <StudyRoomSourceDetail
          item={detail.item}
          versions={detail.versions}
          onClose={() => setDetail(null)}
          onRead={(book) => {
            setDetail(null);
            onRead(book);
          }}
          onSwitch={(item) => setDetail({ item, versions: [] })}
        />
      )}
    </div>
  );
}
