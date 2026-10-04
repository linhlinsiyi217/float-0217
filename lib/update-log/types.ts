// lib/update-log/types.ts — 两套更新日志共用的类型与分类定义。
//
// 分类沿用彩色语义标签：新增=蓝，修复=红，优化=橙，调整=紫。
// 颜色只用于小标签/圆点，正文保持深黑与灰色。

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

/** 分类色只用于小标签文字与圆点 */
export const CATEGORY_COLOR: Record<UpdateCategory, string> = {
  feat: "#3C6FD1",
  fix: "#C2504A",
  perf: "#C07C2A",
  tweak: "#7A5CB8",
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

/** 弹窗用的精简条目：每个分类取前几条 */
export function popupEntries(release: Release, perCategory = 2): UpdateEntry[] {
  const out: UpdateEntry[] = [];
  for (const category of CATEGORY_ORDER) {
    out.push(...release.entries.filter((entry) => entry.category === category).slice(0, perCategory));
  }
  return out.slice(0, 5);
}
