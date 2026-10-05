// lib/update-log/types.ts — 两套更新日志共用的类型与分类定义。
//
// 分类用彩色语义标签：新增=蓝，修复=绿，优化=橙，调整=紫。
// 颜色只用于小标签与圆点，并且始终和文字分类一起出现（不靠颜色单独表意）；
// 正文保持深黑与灰色。

export type UpdateCategory = "feat" | "fix" | "perf" | "tweak";

export type UpdateEntry = {
  /** 稳定 id：同一条记录不要改 id */
  id: string;
  category: UpdateCategory;
  /** 属于哪个应用或模块，例如「书房 · 书城」「桌面」 */
  app: string;
  /** 一句话说明这次改了什么 */
  title: string;
  /** 具体内容（弹窗只取前几条，日志页显示全部） */
  items: string[];
};

export type Release = {
  /** 对外看到的版本号；只在真正发布时改 */
  version: string;
  /** 唯一发布 id：换版本号时必须换它 */
  releaseId: string;
  /** 发布日期（YYYY-MM-DD） */
  date: string;
  /** 版本名，例如「书房 v2」 */
  name?: string;
  /** 收起时显示的一句话概括 */
  summary: string;
  entries: UpdateEntry[];
  /** 这版还没完成或还没实测的事，如实写出来 */
  pending?: string[];
};

export const CATEGORY_LABEL: Record<UpdateCategory, string> = {
  feat: "新增",
  fix: "修复",
  perf: "优化",
  tweak: "调整",
};

export const CATEGORY_ORDER: UpdateCategory[] = ["feat", "fix", "perf", "tweak"];

/** 分类色只用于小标签文字与圆点；始终与文字分类同时出现 */
export const CATEGORY_COLOR: Record<UpdateCategory, string> = {
  feat: "#3F6DA8",
  fix: "#3F7A5C",
  perf: "#8C6A3A",
  tweak: "#66598F",
};

/** 分类标签的浅色底（纯白卡上的小色块，保持低饱和） */
export const CATEGORY_TINT: Record<UpdateCategory, string> = {
  feat: "#F0F4FA",
  fix: "#EFF5F1",
  perf: "#F6F2EC",
  tweak: "#F3F1F8",
};

/** 一个版本涉及的应用名（收起时显示） */
export function releaseApps(release: Release): string[] {
  const seen: string[] = [];
  for (const entry of release.entries) {
    const root = entry.app.split(" · ")[0];
    if (!seen.includes(root)) seen.push(root);
  }
  return seen;
}

/** 各类型条目数量（收起时的「新增 3 · 修复 2」） */
export function releaseCounts(release: Release): Array<{ category: UpdateCategory; count: number }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    count: release.entries.filter((entry) => entry.category === category).length,
  })).filter((item) => item.count > 0);
}

/**
 * 弹窗摘要条目：按分类轮流取，保证 3—5 条且各分类都露一条，
 * 五秒内能看完。完整条目在弹窗里折叠展开，或到更新日志页看。
 */
export function popupEntries(release: Release, max = 5): UpdateEntry[] {
  const buckets = CATEGORY_ORDER.map((category) =>
    release.entries.filter((entry) => entry.category === category),
  );
  const out: UpdateEntry[] = [];
  let round = 0;
  // 轮流取：先每个分类各一条，再补第二条，直到够 max
  while (out.length < max && buckets.some((bucket) => bucket.length > round)) {
    for (const bucket of buckets) {
      if (out.length >= max) break;
      const entry = bucket[round];
      if (entry) out.push(entry);
    }
    round += 1;
  }
  return out;
}
