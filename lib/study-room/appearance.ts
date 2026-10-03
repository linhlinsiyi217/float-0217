// lib/study-room/appearance.ts — 书房外观与自定义。
//
// 结构：
//  - vars：各模块的 CSS 变量（基础控件改这些）
//  - css：各模块的用户自定义 CSS 覆盖层（作用域限定到 .sr-app）
// 两者互不覆盖：变量写在前面，用户 CSS 写在后面（优先级更高）。
// 样式出错不会白屏：注入失败/解析失败只影响自定义层，基础样式仍在。

import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";

const STORAGE_KEY = "ai_phone_studyroom_appearance_v1";
registerKvMigration(STORAGE_KEY);

export type AppearanceModule = "global" | "shelf" | "reader" | "chat" | "coread" | "notes";

export type AppearanceState = {
  vars: Record<string, string>;
  css: Record<string, string>;
};

export const APPEARANCE_MODULES: Array<{ key: AppearanceModule; label: string; desc: string }> = [
  { key: "global", label: "整体主题", desc: "强调色、圆角与页面底色" },
  { key: "shelf", label: "书架", desc: "层间距、架板、书本尺寸" },
  { key: "reader", label: "阅读器", desc: "正文字号、行距与颜色" },
  { key: "chat", label: "聊天室", desc: "发送/接收气泡、尾巴与间距" },
  { key: "coread", label: "共读侧栏", desc: "侧栏宽度与气泡" },
  { key: "notes", label: "笔记与其他", desc: "卡片与列表外观" },
];

/** 基础变量：每个控件对应一个 CSS 变量，画布上的真实样式直接读它。 */
export const VAR_DEFS: Array<{
  key: string;
  module: AppearanceModule;
  label: string;
  type: "color" | "range" | "toggle" | "text";
  fallback: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}> = [
  // 整体
  { key: "--sr-accent", module: "global", label: "界面强调色", type: "color", fallback: "#4a4a4a" },
  { key: "--sr-radius", module: "global", label: "圆角", type: "range", fallback: "20", min: 0, max: 28, step: 1, unit: "px" },
  { key: "--sr-page-bg", module: "global", label: "页面底色", type: "color", fallback: "#f1f2f6" },

  // 书架
  { key: "--sr-shelf-gap", module: "shelf", label: "层间距", type: "range", fallback: "34", min: 10, max: 72, step: 2, unit: "px" },
  { key: "--sr-board-height", module: "shelf", label: "架板厚度", type: "range", fallback: "8", min: 4, max: 18, step: 1, unit: "px" },
  { key: "--sr-board-color", module: "shelf", label: "架板颜色", type: "color", fallback: "#d8dde5" },
  { key: "--sr-book-scale", module: "shelf", label: "书本尺寸", type: "range", fallback: "1", min: 0.72, max: 1.3, step: 0.02, unit: "" },
  { key: "--sr-spine-font", module: "shelf", label: "书脊字号", type: "range", fallback: "12", min: 9, max: 16, step: 0.5, unit: "px" },

  // 阅读器
  { key: "--sr-reader-font", module: "reader", label: "正文字号", type: "range", fallback: "17", min: 13, max: 24, step: 0.5, unit: "px" },
  { key: "--sr-reader-leading", module: "reader", label: "行距", type: "range", fallback: "1.95", min: 1.3, max: 2.6, step: 0.05, unit: "" },
  { key: "--sr-reader-ink", module: "reader", label: "正文颜色", type: "color", fallback: "#33383f" },
  { key: "--sr-reader-bg", module: "reader", label: "阅读底色", type: "color", fallback: "#fbfcfe" },

  // 聊天室
  { key: "--sr-chat-send", module: "chat", label: "发送气泡", type: "color", fallback: "#0a84ff" },
  { key: "--sr-chat-recv", module: "chat", label: "接收气泡", type: "color", fallback: "#e9e9eb" },
  { key: "--sr-chat-max", module: "chat", label: "气泡最大宽度", type: "range", fallback: "74", min: 50, max: 92, step: 1, unit: "%" },
  { key: "--sr-chat-radius", module: "chat", label: "气泡圆角", type: "range", fallback: "18", min: 4, max: 24, step: 1, unit: "px" },
  { key: "--sr-chat-gap", module: "chat", label: "组间距", type: "range", fallback: "10", min: 2, max: 24, step: 1, unit: "px" },
  { key: "--sr-chat-tail", module: "chat", label: "显示气泡尾巴", type: "toggle", fallback: "1" },

  // 共读侧栏
  { key: "--sr-coread-width", module: "coread", label: "侧栏宽度", type: "range", fallback: "88", min: 60, max: 100, step: 1, unit: "%" },
  { key: "--sr-coread-font", module: "coread", label: "侧栏字号", type: "range", fallback: "14", min: 12, max: 18, step: 0.5, unit: "px" },

  // 笔记与其他
  { key: "--sr-card-radius", module: "notes", label: "卡片圆角", type: "range", fallback: "16", min: 0, max: 26, step: 1, unit: "px" },
  { key: "--sr-card-bg", module: "notes", label: "卡片底色", type: "color", fallback: "#ffffff" },
];

const GLOBAL_VAR_KEYS = VAR_DEFS.filter((d) => d.module === "global").map((d) => d.key);
const MODULE_VAR_KEYS: Record<AppearanceModule, string[]> = {
  global: GLOBAL_VAR_KEYS,
  shelf: VAR_DEFS.filter((d) => d.module === "shelf").map((d) => d.key),
  reader: VAR_DEFS.filter((d) => d.module === "reader").map((d) => d.key),
  chat: VAR_DEFS.filter((d) => d.module === "chat").map((d) => d.key),
  coread: VAR_DEFS.filter((d) => d.module === "coread").map((d) => d.key),
  notes: VAR_DEFS.filter((d) => d.module === "notes").map((d) => d.key),
};

export function varDef(key: string) {
  return VAR_DEFS.find((d) => d.key === key);
}

export function defaultVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of VAR_DEFS) out[def.key] = def.fallback;
  return out;
}

export function defaultState(): AppearanceState {
  return { vars: defaultVars(), css: {} };
}

/** 读取已保存的外观（兼容缺字段的旧数据）。 */
export function loadAppearance(): AppearanceState {
  const base = defaultState();
  try {
    const raw = kvGet(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AppearanceState>;
    const vars = { ...base.vars };
    if (parsed.vars && typeof parsed.vars === "object") {
      for (const [key, value] of Object.entries(parsed.vars)) {
        if (typeof value === "string" && key in vars) vars[key] = value;
      }
    }
    const css: Record<string, string> = {};
    if (parsed.css && typeof parsed.css === "object") {
      for (const [key, value] of Object.entries(parsed.css)) {
        if (typeof value === "string" && value.trim()) css[key] = value;
      }
    }
    return { vars, css };
  } catch {
    return base;
  }
}

export function saveAppearance(state: AppearanceState): void {
  kvSet(STORAGE_KEY, JSON.stringify(state));
}

export function resetModule(state: AppearanceState, module: AppearanceModule): AppearanceState {
  const vars = { ...state.vars };
  for (const key of MODULE_VAR_KEYS[module]) vars[key] = varDef(key)?.fallback ?? "";
  const css = { ...state.css };
  delete css[module];
  // 整体模块同时清掉公共变量
  if (module === "global") for (const key of GLOBAL_VAR_KEYS) vars[key] = varDef(key)?.fallback ?? "";
  return { vars, css };
}

/** 生成注入用的 CSS 文本：先是变量，再是各模块的用户覆盖（作用域限定到 .sr-app）。 */
export function buildAppearanceCss(state: AppearanceState): string {
  const varLines: string[] = [];
  for (const def of VAR_DEFS) {
    const value = state.vars[def.key];
    if (!value) continue;
    varLines.push(`  ${def.key}: ${normalizeValue(def, value)};`);
  }

  const scope = ".sr-app";
  const blocks: string[] = [];
  for (const entry of APPEARANCE_MODULES) {
    const raw = state.css[entry.key];
    if (!raw || !raw.trim()) continue;
    // 用 CSS 嵌套把用户规则限制在书房作用域内；即使写了裸元素选择器也只影响书房
    blocks.push(`/* ${entry.label} */\n${scope} {\n${indent(raw)}\n}`);
  }

  return [`${scope} {\n${varLines.join("\n")}\n}`, ...blocks].join("\n\n");
}

function normalizeValue(def: { type: string; unit?: string; key: string }, value: string): string {
  if (def.type === "range" && def.unit) {
    const num = Number(value);
    if (Number.isFinite(num)) return `${num}${def.unit}`;
  }
  if (def.type === "range" && !def.unit) {
    const num = Number(value);
    if (Number.isFinite(num)) return String(num);
  }
  if (def.key === "--sr-chat-tail") return value === "0" ? "0" : "1";
  return value;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join("\n");
}

/** 该模块下所有变量（用于「基础样式只读展示」）。 */
export function moduleVarKeys(module: AppearanceModule): string[] {
  return MODULE_VAR_KEYS[module];
}

const STYLE_ID = "sr-appearance-layer";

/**
 * 把外观注入页面。作用域限定在 .sr-app，样式写法有问题也只影响书房，
 * 不会让整个手机白屏；注入本身用 try/catch 兜底。
 */
export function applyAppearance(state: AppearanceState): void {
  if (typeof document === "undefined") return;
  try {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = buildAppearanceCss(state);
  } catch (err) {
    console.warn("[studyroom] appearance layer failed:", err);
  }
}

/** 清除外观覆盖层（重置入口用）。 */
export function clearAppearanceLayer(): void {
  if (typeof document === "undefined") return;
  document.getElementById(STYLE_ID)?.remove();
}
