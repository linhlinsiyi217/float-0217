"use client";

import { useState } from "react";
import { Search, Download, ExternalLink, Loader2, Compass } from "lucide-react";

import {
  READABILITY_LABEL,
  KIND_LABEL,
  type BookKind,
  type BookSearchResult,
} from "@/lib/study-room/book-source";
import { importBookFromBlob } from "@/lib/study-room/import";

type KindFilter = BookKind | "all";

const KIND_CHIPS: Array<{ key: KindFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "novel", label: "小说" },
  { key: "comic", label: "漫画" },
  { key: "material", label: "资料" },
];

export function StudyRoomStore() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [results, setResults] = useState<BookSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setFailedSources([]);
    setNotice(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/study-room/search?q=${encodeURIComponent(q)}&kind=${kind}`);
      if (!res.ok) throw new Error("search failed");
      const data = (await res.json()) as { results: BookSearchResult[]; failed: string[] };
      setResults(data.results ?? []);
      setFailedSources(data.failed ?? []);
    } catch {
      setResults([]);
      setError("搜索服务暂时不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (item: BookSearchResult) => {
    if (!item.importFile) return;
    setImportingId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/study-room/fetch?url=${encodeURIComponent(item.importFile.url)}`);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      await importBookFromBlob(blob, `${item.title}.${item.importFile.format}`);
      setImportedIds((prev) => new Set(prev).add(item.id));
      setNotice(`《${item.title}》已导入书架，可在「书架」中阅读。`);
    } catch {
      setNotice("导入失败，请稍后重试。");
    } finally {
      setImportingId(null);
    }
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

      {notice && (
        <div className="sr-note-card">
          <div className="sr-note-meta">{notice}</div>
        </div>
      )}

      {failedSources.length > 0 && (
        <div className="sr-note-card">
          <div className="sr-note-meta">
            有来源暂时不可用：{failedSources.join("、")}。其他来源的结果仍会显示。
          </div>
        </div>
      )}

      {error && (
        <div className="sr-empty" style={{ paddingTop: 30 }}>
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="sr-empty" style={{ paddingTop: 40 }}>
          <Loader2 size={30} className="sr-spin" />
          <p>正在联网搜索…</p>
        </div>
      )}

      {!loading && !error && results && results.length === 0 && (
        <div className="sr-empty" style={{ paddingTop: 40 }}>
          <Compass size={42} strokeWidth={1} />
          <p>
            {searched ? "没有找到匹配的书。" : "输入书名或作者开始搜索。"}
            <br />
            可以试试书名片段、作者名，或去掉标点（如「简爱」而不是「简·爱」）。
          </p>
        </div>
      )}

      {!loading && !error && results && results.length > 0 && (
        <div className="sr-res-list">
          <div className="sr-res-count">
            {results.length} 个结果 · 来自 {Array.from(new Set(results.map((r) => r.sourceLabel))).join(" / ")}
          </div>
          {results.map((item) => {
            const imported = importedIds.has(item.id);
            const importing = importingId === item.id;
            return (
              <div key={item.id} className="sr-res-card">
                <div
                  className="sr-res-cover"
                  style={item.cover ? { backgroundImage: `url("${item.cover}")` } : undefined}
                >
                  {!item.cover && item.title.slice(0, 1)}
                </div>
                <div className="sr-res-main">
                  <div className="sr-res-title">{item.title}</div>
                  <div className="sr-res-meta">
                    {item.authors.length > 0 ? item.authors.join(" / ") : "佚名"}
                    {item.year ? ` · ${item.year}` : ""}
                  </div>
                  {item.description && <div className="sr-res-desc">{item.description}</div>}
                  <div className="sr-res-tags">
                    <span className="sr-res-source">{item.sourceLabel}</span>
                    <span className="sr-res-kind">{KIND_LABEL[item.kind]}</span>
                    <span className={`sr-res-read sr-res-read--${item.readability}`}>
                      {READABILITY_LABEL[item.readability]}
                    </span>
                  </div>
                </div>
                <div className="sr-res-actions">
                  {item.importFile && (
                    <button
                      type="button"
                      className="sr-res-btn sr-res-btn--primary"
                      onClick={() => handleImport(item)}
                      disabled={importing || imported}
                    >
                      {importing ? <Loader2 size={15} className="sr-spin" /> : <Download size={15} strokeWidth={1.8} />}
                      {imported ? "已导入" : "导入书架"}
                    </button>
                  )}
                  <a className="sr-res-btn" href={item.externalUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={15} strokeWidth={1.8} />
                    前往原站
                  </a>
                </div>
              </div>
            );
          })}
          <p className="sr-note-meta" style={{ marginTop: 16, textAlign: "center" }}>
            结果为各来源的公开书目，可读能力按上架状态标注；无法阅读全文的来源只提供跳转。
          </p>
        </div>
      )}
    </div>
  );
}
