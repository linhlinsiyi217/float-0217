// lib/study-room/aliases.ts — 中英文/中日文别名映射（人工维护）。
//
// 用途：让中文书名能在以英文/日文为主的来源里被检索到，也让英文名能命中中文来源。
// 说明：这里只提供「检索词」，不产生任何结果本身；结果始终来自真实来源接口。
// 维护原则：
//  - 只收录通行译名（大陆常用译名优先），一本书条目的两种语言都写清；
//  - 不做「猜」的映射，拿不准的宁愿不写，避免把用户引到不相干的书；
//  - 新增条目时请顺手在此注释里写明依据（如「通行译名」）。

import { normalizeForMatch } from "./book-source";

export type AliasEntry = {
  /** 中文名（含常见异写，如「简·爱」「简爱」） */
  zh: string[];
  /** 非中文名（英文书名 / 罗马字），用于面向英文、日文来源的检索 */
  latin: string[];
  /** 作品类型倾向，用于把别名送到更合适的来源 */
  kind: "novel" | "comic";
};

export const ALIASES: AliasEntry[] = [
  // ── 小说：通行中文译名 ↔ 原书名 ──
  { zh: ["简爱", "简·爱", "简 爱"], latin: ["Jane Eyre"], kind: "novel" },
  { zh: ["傲慢与偏见"], latin: ["Pride and Prejudice"], kind: "novel" },
  { zh: ["理智与情感"], latin: ["Sense and Sensibility"], kind: "novel" },
  { zh: ["呼啸山庄"], latin: ["Wuthering Heights"], kind: "novel" },
  { zh: ["老人与海"], latin: ["The Old Man and the Sea"], kind: "novel" },
  { zh: ["小王子"], latin: ["The Little Prince"], kind: "novel" },
  { zh: ["安娜·卡列尼娜", "安娜卡列尼娜"], latin: ["Anna Karenina"], kind: "novel" },
  { zh: ["战争与和平"], latin: ["War and Peace"], kind: "novel" },
  { zh: ["罪与罚"], latin: ["Crime and Punishment"], kind: "novel" },
  { zh: ["悲惨世界"], latin: ["Les Miserables", "Les Misérables"], kind: "novel" },
  { zh: ["双城记"], latin: ["A Tale of Two Cities"], kind: "novel" },
  { zh: ["远大前程"], latin: ["Great Expectations"], kind: "novel" },
  { zh: ["雾都孤儿"], latin: ["Oliver Twist"], kind: "novel" },
  { zh: ["鲁滨逊漂流记"], latin: ["Robinson Crusoe"], kind: "novel" },
  { zh: ["格列佛游记"], latin: ["Gulliver's Travels"], kind: "novel" },
  { zh: ["汤姆叔叔的小屋"], latin: ["Uncle Tom's Cabin"], kind: "novel" },
  { zh: ["爱丽丝梦游仙境"], latin: ["Alice's Adventures in Wonderland"], kind: "novel" },
  { zh: ["绿野仙踪"], latin: ["The Wonderful Wizard of Oz"], kind: "novel" },
  { zh: ["福尔摩斯探案集", "福尔摩斯"], latin: ["The Adventures of Sherlock Holmes"], kind: "novel" },
  { zh: ["红与黑"], latin: ["The Red and the Black"], kind: "novel" },
  { zh: ["高老头"], latin: ["Father Goriot"], kind: "novel" },
  { zh: ["变形记"], latin: ["The Metamorphosis"], kind: "novel" },
  { zh: ["百年孤独"], latin: ["One Hundred Years of Solitude"], kind: "novel" },
  { zh: ["了不起的盖茨比"], latin: ["The Great Gatsby"], kind: "novel" },
  { zh: ["动物庄园", "动物农庄"], latin: ["Animal Farm"], kind: "novel" },
  { zh: ["月亮与六便士"], latin: ["The Moon and Sixpence"], kind: "novel" },
  { zh: ["基督山伯爵"], latin: ["The Count of Monte Cristo"], kind: "novel" },
  { zh: ["堂吉诃德"], latin: ["Don Quixote"], kind: "novel" },
  { zh: ["瓦尔登湖"], latin: ["Walden"], kind: "novel" },
  { zh: ["麦田里的守望者"], latin: ["The Catcher in the Rye"], kind: "novel" },
  { zh: ["追风筝的人"], latin: ["The Kite Runner"], kind: "novel" },
  { zh: ["三体"], latin: ["The Three-Body Problem"], kind: "novel" },
  { zh: ["围城"], latin: ["Fortress Besieged"], kind: "novel" },
  { zh: ["呐喊"], latin: ["Call to Arms"], kind: "novel" },
  { zh: ["阿Q正传", "阿q正传"], latin: ["The True Story of Ah Q"], kind: "novel" },
  { zh: ["骆驼祥子"], latin: ["Rickshaw Boy", "Camel Xiangzi"], kind: "novel" },

  // ── 漫画：通行中文译名 ↔ 原名/英文名 ──
  { zh: ["海贼王", "航海王"], latin: ["ONE PIECE", "One Piece"], kind: "comic" },
  { zh: ["火影忍者"], latin: ["NARUTO"], kind: "comic" },
  { zh: ["死神"], latin: ["BLEACH"], kind: "comic" },
  { zh: ["龙珠", "七龙珠"], latin: ["Dragon Ball"], kind: "comic" },
  { zh: ["灌篮高手"], latin: ["Slam Dunk"], kind: "comic" },
  { zh: ["名侦探柯南", "柯南"], latin: ["Detective Conan", "Meitantei Conan"], kind: "comic" },
  { zh: ["进击的巨人"], latin: ["Attack on Titan", "Shingeki no Kyojin"], kind: "comic" },
  { zh: ["钢之炼金术师", "钢之炼金术士"], latin: ["Fullmetal Alchemist"], kind: "comic" },
  { zh: ["鬼灭之刃"], latin: ["Demon Slayer", "Kimetsu no Yaiba"], kind: "comic" },
  { zh: ["咒术回战"], latin: ["Jujutsu Kaisen"], kind: "comic" },
  { zh: ["一拳超人"], latin: ["One Punch Man", "One-Punch Man"], kind: "comic" },
  { zh: ["东京喰种", "东京食尸鬼"], latin: ["Tokyo Ghoul"], kind: "comic" },
  { zh: ["死亡笔记"], latin: ["Death Note"], kind: "comic" },
  { zh: ["犬夜叉"], latin: ["Inuyasha"], kind: "comic" },
  { zh: ["美少女战士"], latin: ["Sailor Moon"], kind: "comic" },
  { zh: ["圣斗士星矢"], latin: ["Saint Seiya"], kind: "comic" },
  { zh: ["哆啦A梦", "哆啦a梦", "机器猫"], latin: ["Doraemon"], kind: "comic" },
  { zh: ["蜡笔小新"], latin: ["Crayon Shin-chan"], kind: "comic" },
  { zh: ["樱桃小丸子"], latin: ["Chibi Maruko-chan"], kind: "comic" },
  { zh: ["排球少年"], latin: ["Haikyu!!"], kind: "comic" },
  { zh: ["我的英雄学院"], latin: ["My Hero Academia"], kind: "comic" },
  { zh: ["链锯人", "电锯人"], latin: ["Chainsaw Man"], kind: "comic" },
  { zh: ["间谍过家家"], latin: ["Spy x Family"], kind: "comic" },
  { zh: ["妖精的尾巴"], latin: ["Fairy Tail"], kind: "comic" },
  { zh: ["银魂"], latin: ["Gintama"], kind: "comic" },
  { zh: ["全职猎人"], latin: ["Hunter x Hunter"], kind: "comic" },
  { zh: ["幽游白书"], latin: ["Yu Yu Hakusho"], kind: "comic" },
  { zh: ["浪客剑心"], latin: ["Rurouni Kenshin"], kind: "comic" },
  { zh: ["城市猎人"], latin: ["City Hunter"], kind: "comic" },
  { zh: ["JOJO的奇妙冒险", "jojo的奇妙冒险"], latin: ["JoJo's Bizarre Adventure"], kind: "comic" },
  { zh: ["新世纪福音战士", "EVA"], latin: ["Neon Genesis Evangelion"], kind: "comic" },
];

export type AliasHit = {
  /** 该查询命中的条目 */
  entry: AliasEntry;
  /** 需要额外去查的检索词（不含查询本身） */
  others: string[];
};

/** 查别名：中文查询返回对应的原名，原名查询返回中文名。 */
export function aliasFor(query: string): AliasHit | null {
  const key = normalizeForMatch(query);
  if (!key) return null;
  for (const entry of ALIASES) {
    const zhKeys = entry.zh.map(normalizeForMatch);
    const latinKeys = entry.latin.map(normalizeForMatch);
    if (zhKeys.includes(key)) {
      return { entry, others: entry.latin.filter((v) => normalizeForMatch(v) !== key) };
    }
    if (latinKeys.includes(key)) {
      return { entry, others: entry.zh.filter((v) => normalizeForMatch(v) !== key) };
    }
  }
  return null;
}

/** 面向英文/日文来源的检索词（原书名或罗马字）。 */
export function latinAliasesFor(query: string): string[] {
  const hit = aliasFor(query);
  if (!hit) return [];
  return hit.entry.latin.filter((v) => normalizeForMatch(v) !== normalizeForMatch(query));
}

/** 面向中文来源的检索词。 */
export function zhAliasesFor(query: string): string[] {
  const hit = aliasFor(query);
  if (!hit) return [];
  return hit.entry.zh.filter((v) => normalizeForMatch(v) !== normalizeForMatch(query));
}

/** 该查询所属作品的类型倾向（用于把别名送到更合适的来源）。 */
export function aliasKindFor(query: string): "novel" | "comic" | null {
  return aliasFor(query)?.entry.kind ?? null;
}
