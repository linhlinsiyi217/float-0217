"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, PenLine, Plus, Sparkles, Trash2 } from "lucide-react";

import { loadBooks } from "@/lib/reading-storage";
import {
  CREATIVE_TEMPLATES,
  createDraft,
  draftWordCount,
  loadDrafts,
  removeDraft,
  saveDrafts,
  upsertDraft,
  type CreativeDraft,
} from "@/lib/study-room/creative";

type CreativePanelProps = {
  onOpenDraft: (draftId: string) => void;
};

/** 书桌里的创作区：列出草稿，按模板新建。写作界面在独立页面里。 */
export function CreativePanel({ onOpenDraft }: CreativePanelProps) {
  const [drafts, setDrafts] = useState<CreativeDraft[]>(() => loadDrafts());
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [published, setPublished] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPublished(new Set(loadBooks().filter((book) => book.draftId).map((book) => book.draftId as string)));
  }, []);

  const handleCreate = (templateId: string) => {
    const draft = createDraft(templateId);
    setDrafts(upsertDraft(drafts, draft));
    setPickingTemplate(false);
    onOpenDraft(draft.id);
  };

  const handleDelete = (draft: CreativeDraft) => {
    if (!confirm(`删除草稿「${draft.title.trim() || "未命名作品"}」？已发布到书架的书不会被删掉。`)) return;
    const next = removeDraft(drafts, draft.id);
    saveDrafts(next);
    setDrafts(next);
  };

  return (
    <>
      <div className="sr-section-label">我的创作</div>

      <div className="sr-actions" style={{ marginBottom: 12 }}>
        <button type="button" className="sr-btn sr-btn-primary" onClick={() => setPickingTemplate((v) => !v)}>
          <Plus size={16} strokeWidth={1.8} />
          新建作品
        </button>
      </div>

      {pickingTemplate && (
        <>
          <div className="sr-note-meta" style={{ marginBottom: 8 }}>
            选一个参考模板开始（模板只填几个设定，随时可以改；也可以选「空白开始」）
          </div>
          <div className="sr-chip-row">
            {CREATIVE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="sr-chip"
                title={template.desc}
                onClick={() => handleCreate(template.id)}
              >
                {template.name}
              </button>
            ))}
          </div>
        </>
      )}

      {drafts.length === 0 ? (
        <div className="sr-note-card">
          <div className="sr-note-meta" style={{ lineHeight: 1.9 }}>
            还没有创作。可以自己手写，也可以让 AI 按你的设定写：书名、署名、题材、文风、世界观、人物、大纲、每章字数都能填，
            写到满意再「加入书架」，之后就能像别的书一样阅读、批注与共读。
          </div>
        </div>
      ) : (
        <ul className="sr-creative-list">
          {drafts
            .slice()
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
            .map((draft) => (
              <li key={draft.id} className="sr-note-card">
                <button type="button" className="sr-creative-item" onClick={() => onOpenDraft(draft.id)}>
                  <span className="sr-creative-item-icon" aria-hidden>
                    {draft.chapters.length > 0 ? <BookOpen size={18} strokeWidth={1.6} /> : <PenLine size={18} strokeWidth={1.6} />}
                  </span>
                  <span className="sr-creative-item-main">
                    <span className="sr-creative-item-title">{draft.title.trim() || "未命名作品"}</span>
                    <span className="sr-note-meta">
                      {draft.chapters.length} 章 · {draftWordCount(draft)} 字
                      {workLabel(draft)}
                      {published.has(draft.id) ? " · 已在书架" : ""}
                    </span>
                  </span>
                  <ChevronRight size={17} strokeWidth={1.6} color="var(--c-icon)" />
                </button>
                <div className="sr-note-foot">
                  <span className="sr-note-meta">
                    <Sparkles size={12} strokeWidth={1.8} style={{ verticalAlign: -1, marginRight: 4 }} />
                    {draft.writer.mode === "character" ? "角色代笔" : "写作助手"}
                  </span>
                  <span className="sr-note-tools">
                    <button
                      type="button"
                      className="sr-note-tool"
                      title="删除草稿"
                      onClick={() => handleDelete(draft)}
                    >
                      <Trash2 size={15} strokeWidth={1.7} />
                    </button>
                  </span>
                </div>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}

function workLabel(draft: CreativeDraft): string {
  if (!draft.genre) return "";
  return ` · ${draft.genre}`;
}
