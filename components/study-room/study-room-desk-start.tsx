"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, FileUp, LayoutTemplate, PenLine, Sparkles, X } from "lucide-react";

import type { Character } from "@/lib/character-types";
import type { WorldBookConfig } from "@/lib/settings-types";
import { createDraft, type CreativeDraft, type WorkKind } from "@/lib/study-room/creative";
import type { InspirationNote } from "@/lib/study-room/inspiration";
import { HelpTip } from "./help-tip";
import { WorldBookPicker } from "./study-room-worldbook-picker";

/** 创作方式：导入在第一步直接选文件，不走后面三步 */
export type StartMode = "ai" | "hand" | "template";
type Form = "novel" | "short" | "script" | "essay";
type Resource = "cast" | "world" | "outline" | "material" | "idea";

const MODES: Array<{ key: StartMode | "import"; label: string; desc: string; icon: React.ReactNode }> = [
  { key: "ai", label: "AI 辅助", desc: "按大纲一章章写，每章都能自己改", icon: <Sparkles size={18} strokeWidth={1.7} /> },
  { key: "hand", label: "手写", desc: "自己写，不会自动调用模型", icon: <PenLine size={18} strokeWidth={1.7} /> },
  { key: "import", label: "导入", desc: "把 txt / md / docx 变成草稿", icon: <FileUp size={18} strokeWidth={1.7} /> },
  { key: "template", label: "模板", desc: "带好世界观、人物与文风的设定起步", icon: <LayoutTemplate size={18} strokeWidth={1.7} /> },
];

const FORMS: Array<{ key: Form; label: string; desc: string; templateId: string }> = [
  { key: "novel", label: "长篇", desc: "分章连载，有大纲与章末记忆", templateId: "longform" },
  { key: "short", label: "短篇", desc: "一篇写完，起承转合紧凑", templateId: "shortstory" },
  { key: "script", label: "剧本", desc: "以对白与动作提示为主", templateId: "script" },
  { key: "essay", label: "散文", desc: "第一人称，细节具体", templateId: "essay" },
];

/** 题材按形式给；templateId 只在「模板」方式下用来带入整套设定 */
const GENRES: Record<Form, Array<{ label: string; templateId?: string }>> = {
  novel: [
    { label: "都市日常", templateId: "urban" },
    { label: "悬疑推理", templateId: "mystery" },
    { label: "奇幻冒险", templateId: "fantasy" },
    { label: "言情", templateId: "romance" },
    { label: "科幻", templateId: "scifi" },
  ],
  short: [
    { label: "日常", templateId: "urban" },
    { label: "悬疑", templateId: "mystery" },
    { label: "奇幻", templateId: "fantasy" },
    { label: "言情", templateId: "romance" },
    { label: "科幻", templateId: "scifi" },
  ],
  script: [{ label: "舞台剧" }, { label: "广播剧" }, { label: "短剧" }, { label: "影视分场" }],
  essay: [{ label: "记事" }, { label: "写景" }, { label: "读书随笔" }, { label: "书信" }],
};

const WORD_OPTIONS: Record<Form, number[]> = {
  novel: [1500, 2500, 4000],
  short: [3000, 6000, 10000],
  script: [1500, 2200, 3500],
  essay: [800, 1500, 3000],
};
const CHAPTER_OPTIONS = [5, 10, 20, 40];

const STEP_TITLES = ["创作方式", "作品形式", "题材", "资源"] as const;

export type DeskStartInitial = { characterId?: string };

type Props = {
  characters: Character[];
  worldBooks: WorldBookConfig[];
  inspirations: InspirationNote[];
  initial?: DeskStartInitial;
  onCreate: (draft: CreativeDraft) => void;
  onImport: (file: File) => void;
  onClose: () => void;
};

/**
 * 开始创作：四步——方式 → 形式 → 题材 → 资源。
 * 每一步都能返回上一步改；资源都是可选的，不选也能开始。
 */
export function StudyRoomDeskStart({ characters, worldBooks, inspirations, initial, onCreate, onImport, onClose }: Props) {
  const [step, setStep] = useState(initial?.characterId ? 1 : 0);
  const [mode, setMode] = useState<StartMode>("ai");
  const [form, setForm] = useState<Form>("novel");
  const [words, setWords] = useState(2500);
  const [chapters, setChapters] = useState(10);
  const [genre, setGenre] = useState<{ label: string; templateId?: string } | null>(null);
  const [customGenre, setCustomGenre] = useState("");
  const [openResource, setOpenResource] = useState<Resource | null>(initial?.characterId ? "cast" : null);
  const [characterId, setCharacterId] = useState<string | undefined>(initial?.characterId);
  const [castWorldBooks, setCastWorldBooks] = useState<string[] | undefined>(undefined);
  const [assistantWorldBooks, setAssistantWorldBooks] = useState<string[]>([]);
  const [outline, setOutline] = useState("");
  const [material, setMaterial] = useState("");
  const [ideaIds, setIdeaIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 换步骤时把焦点放到面板上，读屏能读出新的一步
  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  const pickForm = (next: Form) => {
    setForm(next);
    setWords(WORD_OPTIONS[next][1]);
    setGenre(null);
  };

  const ai = mode !== "hand";
  const genreLabel = customGenre.trim() || genre?.label || "";

  const summary = useMemo(() => {
    const parts = [
      MODES.find((m) => m.key === mode)?.label,
      FORMS.find((f) => f.key === form)?.label,
      genreLabel || "题材待定",
    ];
    return parts.filter(Boolean).join(" · ");
  }, [mode, form, genreLabel]);

  const create = () => {
    const formInfo = FORMS.find((item) => item.key === form)!;
    // 模板方式：用题材模板带入整套设定，再按所选形式改形态与篇幅
    const useGenreTemplate = mode === "template" && genre?.templateId;
    const base = createDraft(useGenreTemplate ? genre!.templateId : formInfo.templateId);
    const finished = form === "short" || form === "essay";
    const pickedIdeas = inspirations.filter((item) => ideaIds.includes(item.id)).map((item) => `- ${item.text}`);
    const extra = [
      base.extra,
      material.trim() ? `素材：${material.trim()}` : "",
      pickedIdeas.length > 0 ? `灵感：\n${pickedIdeas.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const castMode = ai && characterId;
    const draft: CreativeDraft = {
      ...base,
      kind: form as WorkKind,
      genre: genreLabel || base.genre,
      style: form === "script" || form === "essay" ? createDraft(formInfo.templateId).style ?? base.style : base.style,
      serialization: finished ? "finished" : "serial",
      targetWords: words,
      plannedChapters: finished ? 1 : chapters,
      outline: outline.trim() || base.outline,
      extra: extra || undefined,
      writeMode: mode === "hand" ? "hand" : "ai",
      writer: castMode
        ? { ...base.writer, mode: "character", characterId, worldBookIds: castWorldBooks }
        : { ...base.writer, mode: "assistant", worldBookIds: assistantWorldBooks.length > 0 ? assistantWorldBooks : undefined },
    };
    onCreate(draft);
  };

  const resourceRow = (key: Resource, label: string, value: string) => (
    <button
      type="button"
      className="sr-dstart-res"
      onClick={() => setOpenResource((current) => (current === key ? null : key))}
      aria-expanded={openResource === key}
    >
      <span className="sr-dstart-res-label">{label}</span>
      <span className="sr-dstart-res-value">{value}</span>
      <ChevronDown size={15} strokeWidth={1.8} data-open={openResource === key || undefined} aria-hidden />
    </button>
  );

  const chip = (active: boolean, label: string, onClick: () => void, key?: string | number) => (
    <button key={key ?? label} type="button" className="sr-chip" data-active={active ? "true" : undefined} aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className="sr-sheet-mask" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="sr-sheet sr-sheet--tall sr-dstart"
        role="dialog"
        aria-modal="true"
        aria-label={`开始创作，第 ${step + 1} 步，共 4 步：${STEP_TITLES[step]}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sr-dstart-head">
          {step > 0 ? (
            <button type="button" className="sr-icon-btn" onClick={() => setStep(step - 1)} aria-label="上一步">
              <ChevronLeft size={21} strokeWidth={1.7} />
            </button>
          ) : (
            <span style={{ width: 44 }} aria-hidden />
          )}
          <span className="sr-dstart-title">开始创作</span>
          <button type="button" className="sr-icon-btn" onClick={onClose} aria-label="关闭">
            <X size={20} strokeWidth={1.7} />
          </button>
        </div>

        <ol className="sr-dstart-steps" aria-label="步骤">
          {STEP_TITLES.map((title, index) => (
            <li key={title} data-state={index < step ? "done" : index === step ? "now" : undefined} aria-current={index === step ? "step" : undefined}>
              <span className="sr-dstart-bar" aria-hidden />
              <span className="sr-dstart-step-name">{title}</span>
            </li>
          ))}
        </ol>

        <div className="sr-dstart-body">
          {step === 0 && (
            <>
              <div className="sr-dstart-label">
                怎么写
                <HelpTip id="desk-step-mode" label="创作方式说明">
                  AI 辅助：先定大纲，再一章章生成，每章写完会留一份章末记忆，接着写不失忆；手写：只保存你写的字，不会自己调用模型；
                  导入：把已有文稿变成草稿，接着改；模板：带好一套世界观、人物与文风，进去全都能改。
                </HelpTip>
              </div>
              <div className="sr-dstart-options" role="radiogroup" aria-label="创作方式">
                {MODES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={item.key !== "import" && mode === item.key}
                    className="sr-dstart-option"
                    data-active={item.key !== "import" && mode === item.key ? "true" : undefined}
                    onClick={() => {
                      if (item.key === "import") {
                        fileRef.current?.click();
                        return;
                      }
                      setMode(item.key);
                      setStep(1);
                    }}
                  >
                    <span className="sr-dstart-option-icon" aria-hidden>{item.icon}</span>
                    <span className="sr-dstart-option-main">
                      <span className="sr-dstart-option-name">{item.label}</span>
                      <span className="sr-note-meta">{item.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.docx,text/plain"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onImport(file);
                }}
              />
            </>
          )}

          {step === 1 && (
            <>
              <div className="sr-dstart-label">
                写成什么
                <HelpTip id="desk-step-form" label="作品形式说明">
                  长篇按章连载，会用到大纲、章末记忆与连贯检查；短篇和散文一篇写完；剧本以对白和动作提示为主。之后在作品里还能改。
                </HelpTip>
              </div>
              <div className="sr-dstart-options sr-dstart-options--grid" role="radiogroup" aria-label="作品形式">
                {FORMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={form === item.key}
                    className="sr-dstart-option"
                    data-active={form === item.key ? "true" : undefined}
                    onClick={() => pickForm(item.key)}
                  >
                    <span className="sr-dstart-option-main">
                      <span className="sr-dstart-option-name">{item.label}</span>
                      <span className="sr-note-meta">{item.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="sr-filter-row">
                <span className="sr-filter-label">{form === "novel" || form === "script" ? "每章字数" : "字数"}</span>
                <div className="sr-chip-row">
                  {WORD_OPTIONS[form].map((value) => chip(words === value, `约 ${value}`, () => setWords(value), value))}
                </div>
              </div>
              {(form === "novel" || form === "script") && (
                <div className="sr-filter-row">
                  <span className="sr-filter-label">计划章数</span>
                  <div className="sr-chip-row">
                    {CHAPTER_OPTIONS.map((value) => chip(chapters === value, `${value} 章`, () => setChapters(value), value))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="sr-dstart-label">
                题材
                <HelpTip id="desk-step-genre" label="题材说明">
                  {mode === "template"
                    ? "选「模板」方式时，带「套用」的题材会把整套世界观、人物与文风填进设定；不带的只写题材名。"
                    : "题材只是给 AI 和你自己的方向提示，不选也可以，进去再定。"}
                </HelpTip>
              </div>
              <div className="sr-chip-row">
                {GENRES[form].map((item) =>
                  chip(
                    !customGenre.trim() && genre?.label === item.label,
                    mode === "template" && item.templateId ? `${item.label} · 套用` : item.label,
                    () => {
                      setCustomGenre("");
                      setGenre(genre?.label === item.label ? null : item);
                    },
                    item.label,
                  ),
                )}
              </div>
              <input
                className="sr-appear-input sr-dstart-input"
                value={customGenre}
                onChange={(event) => setCustomGenre(event.target.value)}
                placeholder="或者自己写一个题材"
                aria-label="自定题材"
              />
            </>
          )}

          {step === 3 && (
            <>
              <div className="sr-dstart-label">
                资源（都可以不选）
                <HelpTip id="desk-step-resource" label="资源说明">
                  角色：让一位角色以作者身份来写，会带上 TA 的人设与绑定的世界书；世界书：给写作助手的设定资料；
                  大纲：已经有就贴进来，没有进去可以让 AI 先给一版；素材与灵感：会写进「补充要求」，生成时参考。
                </HelpTip>
              </div>
              <div className="sr-dstart-resources">
                {ai &&
                  resourceRow(
                    "cast",
                    "角色",
                    characterId ? `${characters.find((c) => c.id === characterId)?.name ?? "角色"} 来写` : characters.length > 0 ? "写作助手来写" : "还没有角色",
                  )}
                {openResource === "cast" && ai && (
                  <div className="sr-dstart-panel">
                    {characters.length === 0 ? (
                      <p className="sr-note-meta">小手机里还没有角色，先用写作助手写。</p>
                    ) : (
                      <>
                        <div className="sr-desk-cast">
                          {characters.map((character) => (
                            <button
                              key={character.id}
                              type="button"
                              className="sr-desk-cast-item"
                              onClick={() => {
                                setCharacterId(characterId === character.id ? undefined : character.id);
                                setCastWorldBooks(undefined);
                              }}
                              aria-pressed={characterId === character.id}
                              data-active={characterId === character.id ? "true" : undefined}
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
                        {characterId && (
                          <WorldBookPicker characterId={characterId} value={castWorldBooks} onChange={setCastWorldBooks} />
                        )}
                      </>
                    )}
                  </div>
                )}

                {!(ai && characterId) && (
                  <>
                    {resourceRow("world", "世界书", assistantWorldBooks.length > 0 ? `已选 ${assistantWorldBooks.length} 本` : "不带")}
                    {openResource === "world" && (
                      <div className="sr-dstart-panel">
                        {worldBooks.length === 0 ? (
                          <p className="sr-note-meta">小手机里还没有世界书。</p>
                        ) : (
                          <div className="sr-chip-row">
                            {worldBooks.map((book) =>
                              chip(
                                assistantWorldBooks.includes(book.id),
                                book.name,
                                () =>
                                  setAssistantWorldBooks((list) =>
                                    list.includes(book.id) ? list.filter((id) => id !== book.id) : [...list, book.id],
                                  ),
                                book.id,
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {resourceRow("outline", "大纲", outline.trim() ? `${outline.trim().length} 字` : ai ? "进去再写或让 AI 给一版" : "进去再写")}
                {openResource === "outline" && (
                  <div className="sr-dstart-panel">
                    <textarea
                      className="sr-css-editor"
                      rows={4}
                      value={outline}
                      onChange={(event) => setOutline(event.target.value)}
                      placeholder="已经有大纲就贴在这里：一幕一段"
                      aria-label="大纲"
                    />
                  </div>
                )}

                {resourceRow("material", "素材", material.trim() ? `${material.trim().length} 字` : "不带")}
                {openResource === "material" && (
                  <div className="sr-dstart-panel">
                    <textarea
                      className="sr-css-editor"
                      rows={3}
                      value={material}
                      onChange={(event) => setMaterial(event.target.value)}
                      placeholder="设定、人物、参考片段、必须出现的场景…"
                      aria-label="素材"
                    />
                  </div>
                )}

                {resourceRow("idea", "灵感", ideaIds.length > 0 ? `已选 ${ideaIds.length} 条` : inspirations.length > 0 ? `${inspirations.length} 条便签可选` : "还没有便签")}
                {openResource === "idea" && (
                  <div className="sr-dstart-panel">
                    {inspirations.length === 0 ? (
                      <p className="sr-note-meta">灵感抽屉里还没有便签，书桌下方可以随手记。</p>
                    ) : (
                      <ul className="sr-dstart-ideas">
                        {inspirations.map((item) => {
                          const on = ideaIds.includes(item.id);
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                className="sr-dstart-idea"
                                data-on={on || undefined}
                                onClick={() => setIdeaIds((list) => (on ? list.filter((id) => id !== item.id) : [...list, item.id]))}
                              >
                                <span className="sr-dstart-check" aria-hidden>{on && <Check size={13} strokeWidth={2.4} />}</span>
                                <span className="sr-dstart-idea-text">{item.text}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {step > 0 && (
          <div className="sr-dstart-foot">
            <span className="sr-note-meta sr-dstart-summary">{summary}</span>
            {step < 3 ? (
              <button type="button" className="sr-btn sr-btn-primary" onClick={() => setStep(step + 1)}>
                下一步
              </button>
            ) : (
              <button type="button" className="sr-btn sr-btn-primary" onClick={create}>
                <Sparkles size={16} strokeWidth={1.8} />
                开始写
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
