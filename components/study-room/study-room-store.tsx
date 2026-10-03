"use client";

import { useState } from "react";
import { Search, Compass } from "lucide-react";

type ContentKind = "all" | "novel" | "comic" | "material";

const KIND_CHIPS: Array<{ key: ContentKind; label: string }> = [
  { key: "all", label: "全部" },
  { key: "novel", label: "小说" },
  { key: "comic", label: "漫画" },
  { key: "material", label: "资料" },
];

export function StudyRoomStore() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ContentKind>("all");
  const [notice, setNotice] = useState<string | null>(null);

  // 阶段一：书城框架就位，真实联网书源在后续阶段接入。
  // 这里不做假结果——搜索会明确说明当前状态，而不是用演示书单填充。
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setNotice("联网书源尚未接入：真实搜索会在书源阶段启用。现在可在「书架」导入本地 TXT / EPUB / PDF 阅读。");
  };

  return (
    <div>
      <form className="sr-search" onSubmit={handleSubmit}>
        <Search size={18} strokeWidth={1.6} color="var(--c-icon)" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (notice) setNotice(null);
          }}
          placeholder="搜书名、作者，或片段"
          aria-label="搜索书籍"
        />
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

      <div className="sr-empty" style={{ paddingTop: notice ? 22 : 46 }}>
        <Compass size={42} strokeWidth={1} />
        <p>
          书城用于联网找书。
          <br />
          结果会标注「书房内可读 / 仅可预览 / 前往原站」，
          <br />
          同一作品的不同译本会分开显示。
        </p>
      </div>
    </div>
  );
}
