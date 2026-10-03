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
  /** 由来源直接判定的匹配方式（如按作者分类检索）；留空则由标题/作者自动判定 */
  match?: MatchKind;
};

export type SourceSearchParams = {
  query: string;
  kind: BookKind | "all";
  limit: number;
};

/** 结果与关键词的匹配方式：标题/作者命中才算「搜到了这本书」。 */
export type MatchKind = "title" | "author";

export type SearchFailure = { id: string; label: string; reason?: string };

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

// ── 匹配与分类：把「含关键词的正文」与「真正的这本书」分开 ──

/** 统一的比较形式：去标点、去空白、繁转简、小写。 */
export function normalizeForMatch(text: string): string {
  return toSimplified(text).replace(PUNCTUATION, "").trim().toLowerCase();
}

/**
 * 标题匹配强度：完全相同 > 以关键词开头 > 包含关键词。
 * 返回 0 表示标题里没有这个关键词。
 */
export function titleMatchScore(title: string, query: string): number {
  const t = normalizeForMatch(title);
  const q = normalizeForMatch(query);
  if (!t || !q) return 0;
  if (t === q) return 100;
  // 「简爱」应能命中「简爱（精）/经典译林」与「简·爱」
  if (t.startsWith(q)) return 85;
  if (t.includes(q)) return 65;
  // 反过来：书名比关键词短（用户搜「简爱 夏洛蒂」之类），也算标题命中但弱一些
  if (q.includes(t)) return 45;
  return 0;
}

/** 作者匹配：多见于「搜作者看其作品」。 */
export function authorMatchScore(authors: string[], query: string): number {
  const q = normalizeForMatch(query);
  if (!q) return 0;
  let best = 0;
  for (const name of authors) {
    const a = normalizeForMatch(name);
    if (!a) continue;
    if (a === q) best = Math.max(best, 60);
    else if (a.includes(q)) best = Math.max(best, 40);
  }
  return best;
}

// 分类关键词：来源给出的题材/分类文本 → 小说 / 漫画 / 资料
const MATERIAL_WORDS = [
  "判决", "裁定", "裁决", "法律", "法规", "条例", "公告", "通告", "布告", "通知", "公文",
  "条约", "公约", "章程", "标准", "规范", "声明", "政府", "法院", "检察", "行政复议",
  "仲裁", "会议纪要", "统计", "年鉴", "词典", "字典", "教材", "教科书", "参考", "法学",
  "宪法", "民法", "刑法", "诉讼法", "行政法", "判例", "司法解释", "专利", "档案", "年报",
  "law", "legal", "legislation", "government", "regulation", "report", "statistics",
  "reference", "textbook", "jurisprudence", "court", "policy",
];

const COMIC_WORDS = [
  "漫画", "连环画", "绘本", "manga", "comic", "graphic novel", "cartoon",
];

const NOVEL_WORDS = [
  "小说", "小说集", "文集", "选集", "诗集", "诗选", "诗歌", "散文", "戏曲", "戏剧",
  "剧本", "章回", "演义", "神话", "童话", "寓言", "故事", "传奇", "笔记小说",
  "翻译文学", "文学", "科幻", "武侠", "言情", "悬疑", "推理", "名著", "fiction",
  "novel", "poetry", "drama", "literature", "short stories", "classic",
];

/** 依据题材/分类文本判断作品类型；判断不出返回 null（由来源默认值决定）。 */
export function classifyKind(text: string | undefined | null): BookKind | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const comic = COMIC_WORDS.some((w) => lower.includes(w));
  if (comic) return "comic";
  const material = MATERIAL_WORDS.some((w) => lower.includes(w));
  if (material) return "material";
  const novel = NOVEL_WORDS.some((w) => lower.includes(w));
  if (novel) return "novel";
  return null;
}

/** 判断文本自身是否为中文（用于挑选面向中文的来源）。 */
export function isCJKQuery(query: string): boolean {
  return hasCJK(query);
}
