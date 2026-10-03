// lib/study-room/book-source.ts — 书城书源的公共类型与检索规范化。
// 客户端与服务器共用；不含任何密钥，也不做网络请求。

export type BookKind = "novel" | "comic" | "material";

/** 结果的可读能力，三种状态必须分别标注，不能把资料伪装成可读全文。 */
export type Readability = "readable" | "preview" | "external";

export type BookSearchResult = {
  /** 全局唯一：`${sourceId}:${sourceItemId}` */
  id: string;
  sourceId: string;
  sourceLabel: string;
  title: string;
  authors: string[];
  cover?: string;
  year?: string;
  language?: string;
  kind: BookKind;
  readability: Readability;
  externalUrl: string;
  description?: string;
  /** 仅当 readability="readable" 且来源提供可下载文件时存在 */
  importFile?: { url: string; format: "txt" | "epub" };
  /** 同一作品不同版本/译本的稳定键，用于合并展示 */
  workKey?: string;
};

export type SourceSearchParams = {
  query: string;
  kind: BookKind | "all";
  limit: number;
};

const PUNCTUATION = /[\s·・．.。…—\-–—_~`'"“”‘’《》〈〉「」『』【】〔〕（）()\[\]{}!！?？,，;；:：、|/\\+*#@$%^&]+/g;

/**
 * 中文检索规范化：去掉标点与空白，让「简·爱」能命中「简爱」，
 * 书名片段、作者片段、带括号的副标题也能落在同一关键词上。
 */
export function normalizeQuery(query: string): string {
  return query.replace(PUNCTUATION, "").trim();
}

/** 是否包含 CJK 字符——用于判断该走中文为主的来源。 */
export function hasCJK(text: string): boolean {
  return /[㐀-䶿一-鿿豈-﫿]/.test(text);
}

/** 简单的简繁近似：把常见繁体字折成简体，提高中文命中率。 */
const TRAD_TO_SIMP: Record<string, string> = {
  愛: "爱", 簡: "简", 說: "说", 國: "国", 學: "学", 書: "书", 讀: "读", 記: "记",
  時: "时", 間: "间", 現: "现", 實: "实", 見: "见", 觀: "观", 語: "语", 詞: "词",
  長: "长", 門: "门", 開: "开", 關: "关", 們: "们", 過: "过", 還: "还", 這: "这",
  裏: "里", 裡: "里", 為: "为", 與: "与", 從: "从", 會: "会", 兒: "儿", 頭: "头",
  體: "体", 無: "无", 萬: "万", 錢: "钱", 銀: "银", 雲: "云", 電: "电", 車: "车",
  馬: "马", 鳥: "鸟", 魚: "鱼", 龍: "龙", 鳳: "凤", 紅: "红", 綠: "绿", 藍: "蓝",
};

export function toSimplified(text: string): string {
  let out = "";
  for (const ch of text) out += TRAD_TO_SIMP[ch] ?? ch;
  return out;
}

export const KIND_LABEL: Record<BookKind, string> = {
  novel: "小说",
  comic: "漫画",
  material: "资料",
};

export const READABILITY_LABEL: Record<Readability, string> = {
  readable: "书房内可读",
  preview: "仅可预览",
  external: "前往原站",
};
