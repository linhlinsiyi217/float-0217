// lib/study-room/book-source.ts — 书城书源的公共类型与检索规范化。
// 客户端与服务器共用；不含任何密钥，也不做网络请求。

export type BookKind = "novel" | "comic" | "material";

/**
 * 结果的可读能力，四种状态必须分别标注，不能把资料或外链伪装成可读全文：
 *  - readable：来源提供可下载正文（TXT/EPUB），导入书房即可全文阅读
 *  - preview：来源提供在线预览，可在书房内预览或明确提示去来源预览
 *  - import：只有书目信息，需要用户自己导入本地文件才能读
 *  - material：仅资料（公告、判决、纯书目等），不提供阅读入口
 */
export type Readability = "readable" | "preview" | "import" | "material";

/** 展示用的细分类型（比小说/漫画/资料更细，用于分类筛选） */
export type BookCategory =
  | "novel"
  | "classic"
  | "comic"
  | "poetry"
  | "drama"
  | "history"
  | "philosophy"
  | "psychology"
  | "social"
  | "science"
  | "biography"
  | "reference";

export type BookSearchResult = {
  /** 细分类型，用于分类筛选与展示 */
  category?: BookCategory;
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
  readable: "全文可读",
  preview: "可预览",
  import: "需本地导入",
  material: "仅资料",
};

export const CATEGORY_LABEL: Record<BookCategory, string> = {
  novel: "小说",
  classic: "文学经典",
  comic: "漫画",
  poetry: "诗歌",
  drama: "戏剧",
  history: "历史",
  philosophy: "哲学",
  psychology: "心理",
  social: "社科",
  science: "科普",
  biography: "传记",
  reference: "工具资料",
};

export const CATEGORY_ORDER: BookCategory[] = [
  "novel", "classic", "comic", "poetry", "drama", "history",
  "philosophy", "psychology", "social", "science", "biography", "reference",
];

// 细分类型关键词：来源给出的题材/分类文本 → 具体类型
const CATEGORY_WORDS: Array<{ category: BookCategory; words: string[] }> = [
  { category: "comic", words: ["漫画", "连环画", "绘本", "manga", "comic", "graphic novel"] },
  { category: "poetry", words: ["诗", "诗选", "诗集", "poetry", "poem"] },
  { category: "drama", words: ["戏剧", "剧本", "戏曲", "话剧", "drama", "play", "theater"] },
  { category: "classic", words: ["经典", "名著", "古籍", "classic", "literature", "literary"] },
  { category: "history", words: ["历史", "史学", "史书", "history", "historical"] },
  { category: "philosophy", words: ["哲学", "伦理", "philosophy", "ethic"] },
  { category: "psychology", words: ["心理", "psychology", "psycho"] },
  { category: "social", words: ["社科", "社会学", "政治", "经济", "法律", "social", "politics", "economics", "law"] },
  { category: "science", words: ["科普", "科学", "数学", "物理", "生物", "science", "mathematics", "physics", "biology"] },
  { category: "biography", words: ["传记", "回忆录", "自传", "biography", "memoir", "autobiography"] },
  { category: "reference", words: ["工具书", "词典", "手册", "教材", "年鉴", "reference", "dictionary", "textbook", "handbook"] },
  { category: "novel", words: ["小说", "fiction", "novel", "story", "romance", "mystery", "fantasy", "science fiction"] },
];

function hasWord(lower: string, word: string): boolean {
  // 中文按包含判断；英文按整词，避免 display 命中 play、flaw 命中 law
  if (hasCJK(word)) return lower.includes(word);
  return new RegExp(`(^|[^a-z])${word.replace(/ /g, "\\s+")}($|[^a-z])`).test(lower);
}

/** 细分类型判断：拿不准就用来源给的兜底类型，不硬猜。 */
export function classifyCategory(text: string | undefined | null, fallback: BookCategory = "novel"): BookCategory {
  if (!text) return fallback;
  // 「科幻小说」「历史小说」是小说，不能因为含 science / historical 被分进科普或历史
  const lower = text
    .toLowerCase()
    .replace(/(science|historical|detective|crime|romantic)\s+fiction/g, "fiction")
    .replace(/科幻小说|历史小说|推理小说|言情小说/g, "小说");
  // 同样按整词计票；平票时按 CATEGORY_WORDS 的先后顺序
  let best: BookCategory | null = null;
  let bestCount = 0;
  for (const entry of CATEGORY_WORDS) {
    const hits = entry.words.filter((word) => hasWord(lower, word)).length;
    if (hits > bestCount) {
      best = entry.category;
      bestCount = hits;
    }
  }
  return best ?? fallback;
}

// 语言代码 → 中文名：各来源有的给 ISO 639-1（en），有的给 639-2（eng），统一成一个键
const LANGUAGE_ALIASES: Record<string, string> = {
  eng: "en", chi: "zh", zho: "zh", jpn: "ja", kor: "ko", fre: "fr", fra: "fr", ger: "de", deu: "de",
  spa: "es", ita: "it", rus: "ru", por: "pt", dut: "nl", nld: "nl", lat: "la", gre: "el", ell: "el",
  grc: "grc", swe: "sv", dan: "da", nor: "no", fin: "fi", pol: "pl", cze: "cs", ces: "cs", hun: "hu",
  ara: "ar", heb: "he", hin: "hi", tur: "tr", vie: "vi", tha: "th", ind: "id", ukr: "uk",
  "zh-cn": "zh", "zh-tw": "zh-hant", "zh-hk": "zh-hant", "zh-hans": "zh", "ja-ro": "ja", "ko-ro": "ko",
};

const LANGUAGE_LABEL: Record<string, string> = {
  zh: "中文", "zh-hant": "繁体中文", en: "英文", ja: "日文", ko: "韩文", fr: "法文", de: "德文",
  es: "西班牙文", it: "意大利文", ru: "俄文", pt: "葡萄牙文", nl: "荷兰文", la: "拉丁文", el: "希腊文",
  grc: "古希腊文", sv: "瑞典文", da: "丹麦文", no: "挪威文", fi: "芬兰文", pl: "波兰文", cs: "捷克文",
  hu: "匈牙利文", ar: "阿拉伯文", he: "希伯来文", hi: "印地文", tr: "土耳其文", vi: "越南文",
  th: "泰文", id: "印尼文", uk: "乌克兰文",
};

/** 统一语言代码（en / eng / EN 都归成 en），用于筛选分组。 */
export function normalizeLanguage(code: string | undefined | null): string | undefined {
  const key = code?.trim().toLowerCase();
  if (!key) return undefined;
  return LANGUAGE_ALIASES[key] ?? key;
}

/** 语言的中文名；不认识的代码标「其他语言」，不把原始代码直接给用户看。 */
export function languageLabel(code: string | undefined | null): string {
  const key = normalizeLanguage(code);
  if (!key) return "未知语言";
  return LANGUAGE_LABEL[key] ?? LANGUAGE_LABEL[key.split("-")[0]] ?? "其他语言";
}

/** 由「小说/漫画/资料」这类粗分类推细分类型（兜底用） */
export function categoryFromKind(kind: BookKind): BookCategory {
  if (kind === "comic") return "comic";
  if (kind === "material") return "reference";
  return "novel";
}

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
// 来源常把几十个主题词拼在一起（《简爱》的 Courtship、改编漫画版的 Comic books 都在里面）：
// 按整词计票，票多的类型胜出，平票时漫画 > 资料 > 小说；不再因为一个子串就整本判错。
export function classifyKind(text: string | undefined | null): BookKind | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const count = (words: string[]) => words.filter((w) => hasWord(lower, w)).length;
  const comic = count(COMIC_WORDS);
  const material = count(MATERIAL_WORDS);
  const novel = count(NOVEL_WORDS);
  const best = Math.max(comic, material, novel);
  if (best === 0) return null;
  if (comic === best) return "comic";
  if (material === best) return "material";
  return "novel";
}

// 文书类标题：判决书、裁定书、起诉书、案号等。标题本身就说明它是法律文书，
// 不管来源有没有给分类、分类里混了多少文学词，都按资料处理（《简爱》不会被它误伤）。
const LEGAL_TITLE_RE = new RegExp(
  [
    "(判决|裁定|调解|起诉|公诉|抗诉|上诉|答辩|仲裁|执行)书",
    "[一二再]审.{0,6}(判决|裁定|案)",
    "(纠纷|争议|合同|侵权|离婚|继承|借款|诈骗|盗窃|故意伤害).{0,8}(一案|案件|判决|裁定)",
    "[（(〔\\[](19|20)\\d{2}[）)〕\\]].{0,12}(民|刑|行|执|赔|知|商)",
    "(民|刑|行)(初|终|再|申)字?第?\\d+号",
  ].join("|"),
);

/** 标题是不是法律文书（判决书、裁定书、案号等）。 */
export function isLegalDocumentTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  return LEGAL_TITLE_RE.test(title.replace(/\s+/g, ""));
}

/** 判断文本自身是否为中文（用于挑选面向中文的来源）。 */
export function isCJKQuery(query: string): boolean {
  return hasCJK(query);
}
