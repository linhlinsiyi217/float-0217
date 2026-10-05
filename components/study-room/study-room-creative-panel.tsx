"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock3,
  Feather,
  LayoutTemplate,
  Lightbulb,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { loadCharacters } from "@/lib/character-storage";
import { loadWorldBooks } from "@/lib/settings-storage";
import { loadBooks } from "@/lib/reading-storage";
import { loadWishlist } from "@/lib/study-room/wishlist";
import {
  CREATIVE_TEMPLATES,
  WORK_KIND_LABEL,
  createDraft,
  draftWordCount,
  loadDrafts,
  removeDraft,
  saveDrafts,
  todayWritingStats,
  upsertDraft,
  type CreativeDraft,
} from "@/lib/study-room/creative";
import {
  addInspiration,
  loadInspirations,
  removeInspiration,
  updateInspiration,
  type InspirationNote,
} from "@/lib/study-room/inspiration";
import { WorldBookPicker } from "./study-room-worldbook-picker";

type CreativePanelProps = {
  onOpenDraft: (draftId: string) => void;
  /** 打开「我的 → 笔记」看资料盒里的笔记 */
  onOpenNotes?: () => void;
  /** 打开想读书单 */
  onOpenWishlist?: () => void;
};

type Drawer = "note" | "cast" | "world" | "outline" | "box" | null;

type CastSetup = {
  characterId: string;
  theme: string;
  form: "short" | "serial";
  words: number;
  chapters: number;
  worldBookIds: string[] | undefined;
};

const WORD_OPTIONS = [1500, 2500, 4000];
const CHAPTER_OPTIONS = [5, 10, 20, 40];

/**
 * 书桌：制书工作台。
 * 首页是「开始创作 / 继续创作 / 今日写作 / 模板 / 灵感抽屉 / 制书工具」，
 * 不是一个只有按钮的入口页；所有数字都来自真实草稿。
 */
export function CreativePanel({ onOpenDraft, onOpenNotes, onOpenWishlist }: CreativePanelProps) {
  const [drafts, setDrafts] = useState<CreativeDraft[]>(() => loadDrafts());
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [inspirations, setInspirations] = useState<InspirationNote[]>(() => loadInspirations());
  const [draftNote, setDraftNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [castSetup, setCastSetup] = useState<CastSetup | null>(null);

  const characters = useMemo(() => loadCharacters(), []);
  const worldBooks = useMemo(() => loadWorldBooks(), []);
  const wishlist = useMemo(() => loadWishlist(), []);
  const books = useMemo(() => loadBooks(), []);
  const stats = useMemo(() => todayWritingStats(drafts), [drafts]);

  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

  const flash = (message: string, ms = 2400) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), ms);
  };

  const recent = useMemo(
    () => [...drafts].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 3),
    [drafts],
  );

  const createFromTemplate = (templateId: string, writeMode: "ai" | "hand") => {
    const draft = { ...createDraft(templateId), writeMode };
    setDrafts(upsertDraft(drafts, draft));
    setPickingTemplate(false);
    onOpenDraft(draft.id);
  };

  /** 角色写作：先在参数面板里定主题、篇幅、世界书，再开新作品 */
  const createWithCharacter = () => {
    if (!castSetup) return;
    const finished = castSetup.form === "short";
    const base = createDraft(finished ? "shortstory" : "longform");
    const draft: CreativeDraft = {
      ...base,
      genre: castSetup.theme.trim() || base.genre,
      kind: finished ? "short" : "novel",
      serialization: finished ? "finished" : "serial",
      targetWords: castSetup.words,
      plannedChapters: finished ? 1 : castSetup.chapters,
      writeMode: "ai",
      writer: { ...base.writer, mode: "character", characterId: castSetup.characterId, worldBookIds: castSetup.worldBookIds },
    };
    setDrafts(upsertDraft(drafts, draft));
    setCastSetup(null);
    onOpenDraft(draft.id);
  };

  const pickCharacter = (characterId: string) =>
    setCastSetup((current) =>
      current?.characterId === characterId
        ? null
        : { characterId, theme: "", form: "serial", words: 2500, chapters: 10, worldBookIds: undefined },
    );

  const handleDelete =(draft: CreativeDraft) => {
    if (!confirm(`删除草稿「${draft.title.trim() || "未命名作品"}」？已发布到书架的书不会被删掉。`)) return;
    const next = removeDraft(drafts, draft.id);
    saveDrafts(next);
    setDrafts(next);
  };

  const openDrawer = (key: Drawer) => setDrawer((current) => (current === key ? null : key));

  const drawerRow = (key: Exclude<Drawer, null>, label: string, desc: string, icon: React.ReactNode) => (
    <button type="button" className="sr-drawer-row" onClick={() => openDrawer(key)} aria-expanded={drawer === key}>
      {icon}
      <span className="sr-drawer-label">
        {label}
        <span className="sr-note-meta" style={{ display: "block" }}>{desc}</span>
      </span>
      <ChevronDown size={15} strokeWidth={1.8} style={{ transform: drawer === key ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
    </button>
  );

  return (
    <>
      {/* ① 顶部主操作：开始创作 */}
      <div className="sr-section-label">书桌</div>
      <div className="sr-desk-hero">
        <div className="sr-desk-hero-main">
          <Feather size={20} strokeWidth={1.6} />
          <div>
            <div className="sr-desk-hero-title">开始创作</div>
          </div>
        </div>
        <div className="sr-desk-hero-actions">
          <button type="button" className="sr-btn sr-btn-primary" onClick={() => createFromTemplate("longform", "ai")}>
            <Sparkles size={16} strokeWidth={1.8} />
            AI 创作
          </button>
          <button type="button" className="sr-btn" onClick={() => createFromTemplate("blank", "hand")}>
            <PenLine size={16} strokeWidth={1.8} />
            手写
          </button>
          <button type="button" className="sr-btn" onClick={() => setPickingTemplate((value) => !value)}>
            <LayoutTemplate size={16} strokeWidth={1.8} />
            模板
          </button>
          <label className="sr-btn" style={{ cursor: "pointer" }}>
            <Upload size={16} strokeWidth={1.8} />
            导入
            <input
              type="file"
              accept=".txt,.md,.docx,text/plain"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  const text = /\.docx$/i.test(file.name)
                    ? await (await import("@/lib/study-room/docx")).readDocxText(await file.arrayBuffer())
                    : await file.text();
                  if (!text.trim()) throw new Error("empty");
                  const draft = { ...createDraft("blank"), writeMode: "hand" as const };
                  draft.title = file.name.replace(/\.[^.]+$/, "");
                  draft.chapters = [
                    {
                      id: `cc_${Date.now()}`,
                      title: "导入的正文",
                      content: text.slice(0, 400000),
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                  ];
                  setDrafts(upsertDraft(drafts, draft));
                  onOpenDraft(draft.id);
                } catch {
                  flash("这个文件读不出来，换一个 txt / md / docx 试试", 3000);
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* 角色作者：只显示小手机同源头像与名字，点一下用这位角色开一个新作品 */}
      {characters.length > 0 && (
        <>
          <div className="sr-section-label">角色写作</div>
          <div className="sr-desk-cast">
            {characters.map((character) => (
              <button
                key={character.id}
                type="button"
                className="sr-desk-cast-item"
                onClick={() => pickCharacter(character.id)}
                aria-label={`让${character.name}来写`}
                aria-expanded={castSetup?.characterId === character.id}
                data-active={castSetup?.characterId === character.id ? "true" : undefined}
              >
                <span className="sr-desk-cast-avatar" aria-hidden>
                  {character.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={character.avatar} alt="" />
                  ) : (
                    character.name.slice(0, 1)
                  )}
                </span>
                <span className="sr-desk-cast-name">{character.name}</span>
              </button>
            ))}
          </div>
          {castSetup && (
            <div className="sr-cast-setup" role="group" aria-label="角色写作参数">
              <div className="sr-cast-setup-title">
                {characters.find((c) => c.id === castSetup.characterId)?.name ?? "角色"} 来写
              </div>
              <input
                className="sr-appear-input"
                value={castSetup.theme}
                onChange={(event) => setCastSetup({ ...castSetup, theme: event.target.value })}
                placeholder="写什么？题材或一句话主题（可留空，进去再定）"
                aria-label="主题"
              />
              <div className="sr-filter-row">
                <span className="sr-filter-label">篇幅</span>
                <div className="sr-chip-row">
                  {(
                    [
                      ["short", "短篇"],
                      ["serial", "连载"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className="sr-chip"
                      data-active={castSetup.form === key ? "true" : undefined}
                      aria-pressed={castSetup.form === key}
                      onClick={() => setCastSetup({ ...castSetup, form: key })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sr-filter-row">
                <span className="sr-filter-label">{castSetup.form === "short" ? "字数" : "每章字数"}</span>
                <div className="sr-chip-row">
                  {WORD_OPTIONS.map((words) => (
                    <button
                      key={words}
                      type="button"
                      className="sr-chip"
                      data-active={castSetup.words === words ? "true" : undefined}
                      aria-pressed={castSetup.words === words}
                      onClick={() => setCastSetup({ ...castSetup, words })}
                    >
                      约 {words}
                    </button>
                  ))}
                </div>
              </div>
              {castSetup.form === "serial" && (
                <div className="sr-filter-row">
                  <span className="sr-filter-label">计划章数</span>
                  <div className="sr-chip-row">
                    {CHAPTER_OPTIONS.map((chapters) => (
                      <button
                        key={chapters}
                        type="button"
                        className="sr-chip"
                        data-active={castSetup.chapters === chapters ? "true" : undefined}
                        aria-pressed={castSetup.chapters === chapters}
                        onClick={() => setCastSetup({ ...castSetup, chapters })}
                      >
                        {chapters} 章
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <WorldBookPicker
                characterId={castSetup.characterId}
                value={castSetup.worldBookIds}
                onChange={(worldBookIds) => setCastSetup({ ...castSetup, worldBookIds })}
              />
              <div className="sr-css-actions">
                <button type="button" className="sr-btn sr-btn-primary" onClick={createWithCharacter}>
                  <Sparkles size={16} strokeWidth={1.8} />
                  开始写
                </button>
                <button type="button" className="sr-btn" onClick={() => setCastSetup(null)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 模板区 */}
      {pickingTemplate && (
        <>
          <div className="sr-section-label">模板</div>
          <div className="sr-draw-cats">
            {CREATIVE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="sr-draw-cat"
                title={template.desc}
                onClick={() => createFromTemplate(template.id, "ai")}
              >
                {template.name}
              </button>
            ))}
          </div>
        </>
      )}

      {notice && (
        <div className="sr-note-card">
          <div className="sr-note-meta">{notice}</div>
        </div>
      )}

      {/* ② 继续创作 */}
      <div className="sr-section-label">继续创作</div>
      {recent.length === 0 ? (
        <div className="sr-note-card">
          <div className="sr-note-meta" style={{ lineHeight: 1.9 }}>
            还没有作品，点上面「AI 创作」或「手写」开始第一章。
          </div>
        </div>
      ) : (
        recent.map((draft) => (
          <div key={draft.id} className="sr-note-card">
            <button type="button" className="sr-creative-item" onClick={() => onOpenDraft(draft.id)}>
              <span className="sr-creative-item-icon" aria-hidden>
                {draft.chapters.length > 0 ? <BookOpen size={18} strokeWidth={1.6} /> : <PenLine size={18} strokeWidth={1.6} />}
              </span>
              <span className="sr-creative-item-main">
                <span className="sr-creative-item-title">{draft.title.trim() || "未命名作品"}</span>
                <span className="sr-note-meta">
                  {draft.kind ? `${WORK_KIND_LABEL[draft.kind]} · ` : ""}
                  {draft.chapters.length} 章 · {draftWordCount(draft)} 字
                  {draft.writeMode === "hand" ? " · 手写" : ""}
                </span>
                <span className="sr-note-meta">
                  <Clock3 size={11} strokeWidth={1.8} style={{ verticalAlign: -1, marginRight: 3 }} />
                  {new Date(draft.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 编辑
                </span>
              </span>
              <ChevronRight size={17} strokeWidth={1.6} color="var(--c-icon)" />
            </button>
            <div className="sr-note-foot">
              <span className="sr-note-tools">
                <button type="button" className="sr-btn sr-btn-sm" onClick={() => onOpenDraft(draft.id)}>
                  继续
                </button>
                <button type="button" className="sr-note-tool" title="删除草稿" onClick={() => handleDelete(draft)}>
                  <Trash2 size={15} strokeWidth={1.7} />
                </button>
              </span>
            </div>
          </div>
        ))
      )}

      {/* ③ 今日写作（只有真实数据） */}
      <div className="sr-section-label">今日写作</div>
      {stats.hasData ? (
        <div className="sr-desk-stats">
          <span><strong>{stats.words}</strong> 字</span>
          <span><strong>{stats.projects}</strong> 个项目有改动</span>
          <span><strong>{stats.chapters}</strong> 章有内容</span>
        </div>
      ) : (
        <div className="sr-note-card">
          <div className="sr-note-meta">今天还没有写作记录。写下的字会自动计入这里。</div>
        </div>
      )}

      {/* ④ 灵感抽屉 */}
      <div className="sr-section-label">灵感抽屉</div>
      <div className="sr-note-card" style={{ padding: "4px 12px" }}>
        {drawerRow("note", "灵感便签", "随手记下一句话", <Lightbulb size={16} strokeWidth={1.7} />)}
        {drawer === "note" && (
          <div style={{ padding: "0 4px 12px 26px" }}>
            <div className="sr-appear-row">
              <input
                className="sr-appear-input"
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="记一句灵感…"
                aria-label="灵感便签"
              />
              <button
                type="button"
                className="sr-btn sr-btn-sm"
                disabled={!draftNote.trim()}
                onClick={() => {
                  setInspirations(addInspiration(draftNote));
                  setDraftNote("");
                }}
              >
                <Plus size={13} strokeWidth={2} />
                记下
              </button>
            </div>
            {inspirations.length === 0 ? (
              <p className="sr-note-meta">还没有便签。</p>
            ) : (
              inspirations.map((item) => (
                <div key={item.id} className="sr-inspiration-row">
                  <input
                    className="sr-appear-input"
                    defaultValue={item.text}
                    onBlur={(event) => setInspirations(updateInspiration(item.id, event.target.value))}
                    aria-label="灵感内容"
                  />
                  <button
                    type="button"
                    className="sr-note-tool"
                    title="删除"
                    onClick={() => setInspirations(removeInspiration(item.id))}
                  >
                    <Trash2 size={14} strokeWidth={1.7} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {drawerRow("world", "世界设定", `宿主里已有 ${worldBooks.length} 本世界书`, <LayoutTemplate size={16} strokeWidth={1.7} />)}
        {drawer === "world" && (
          <div style={{ padding: "0 4px 12px 26px" }}>
            {worldBooks.length === 0 ? (
              <p className="sr-note-meta">宿主里还没有世界书。</p>
            ) : (
              worldBooks.slice(0, 12).map((book) => (
                <div key={book.id} className="sr-note-card" style={{ marginBottom: 6 }}>
                  <div className="sr-note-meta" style={{ fontWeight: 600, color: "var(--c-text-title)" }}>{book.name}</div>
                  <div className="sr-note-meta">{book.entries?.length ?? 0} 条设定</div>
                </div>
              ))
            )}
          </div>
        )}

        {drawerRow("outline", "大纲", `${drafts.filter((d) => d.outline?.trim()).length} 个项目写了大纲`, <PenLine size={16} strokeWidth={1.7} />)}
        {drawer === "outline" && (
          <div style={{ padding: "0 4px 12px 26px" }}>
            {drafts.filter((d) => d.outline?.trim()).length === 0 ? (
              <p className="sr-note-meta">还没有大纲。进项目后可以在「大纲」里写或让 AI 先给一版。</p>
            ) : (
              drafts
                .filter((d) => d.outline?.trim())
                .map((d) => (
                  <button key={d.id} type="button" className="sr-drawer-item" onClick={() => onOpenDraft(d.id)}>
                    {d.title.trim() || "未命名作品"}
                    <ChevronRight size={14} strokeWidth={1.8} />
                  </button>
                ))
            )}
          </div>
        )}

        {drawerRow("box", "资料盒", `书架 ${books.length} 本 · 想读 ${wishlist.length} 本`, <BookOpen size={16} strokeWidth={1.7} />)}
        {drawer === "box" && (
          <div style={{ padding: "0 4px 12px 26px" }}>
            <div className="sr-css-actions">
              <button type="button" className="sr-btn sr-btn-sm" onClick={onOpenWishlist} disabled={!onOpenWishlist}>
                想读的书（{wishlist.length}）
              </button>
              <button type="button" className="sr-btn sr-btn-sm" onClick={onOpenNotes} disabled={!onOpenNotes}>
                我的笔记
              </button>
            </div>
          </div>
        )}
      </div>

    </>
  );
}
