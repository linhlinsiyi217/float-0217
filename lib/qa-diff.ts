// lib/qa-diff.ts — 工坊修改提案的逐行差异（纯函数）。
// 按行做最长公共子序列；太大的文件只比较首尾不同的那一段，避免卡住页面。

export type QaDiffLine = { kind: "same" | "add" | "del"; text: string; oldNo?: number; newNo?: number };

export type QaDiffHunk = { lines: QaDiffLine[] };

const MAX_CELLS = 4_000_000;
const CONTEXT = 3;

export function diffLines(before: string, after: string): QaDiffLine[] {
    const a = before.split("\n");
    const b = after.split("\n");
    // 去掉相同的首尾，只对中间做 LCS
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA -= 1;
        endB -= 1;
    }
    const out: QaDiffLine[] = [];
    for (let i = 0; i < start; i += 1) out.push({ kind: "same", text: a[i], oldNo: i + 1, newNo: i + 1 });
    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);
    if (midA.length * midB.length > MAX_CELLS) {
        // 中间段太大：整段按删除 + 新增显示
        midA.forEach((text, i) => out.push({ kind: "del", text, oldNo: start + i + 1 }));
        midB.forEach((text, i) => out.push({ kind: "add", text, newNo: start + i + 1 }));
    } else {
        const n = midA.length;
        const m = midB.length;
        const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
        for (let i = n - 1; i >= 0; i -= 1) {
            for (let j = m - 1; j >= 0; j -= 1) {
                table[i][j] = midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
            }
        }
        let i = 0;
        let j = 0;
        while (i < n || j < m) {
            if (i < n && j < m && midA[i] === midB[j]) {
                out.push({ kind: "same", text: midA[i], oldNo: start + i + 1, newNo: start + j + 1 });
                i += 1;
                j += 1;
            } else if (j < m && (i >= n || table[i][j + 1] >= table[i + 1][j])) {
                out.push({ kind: "add", text: midB[j], newNo: start + j + 1 });
                j += 1;
            } else {
                out.push({ kind: "del", text: midA[i], oldNo: start + i + 1 });
                i += 1;
            }
        }
    }
    const tailOffsetA = endA;
    const tailOffsetB = endB;
    for (let k = 0; k < a.length - endA; k += 1) {
        out.push({ kind: "same", text: a[tailOffsetA + k], oldNo: tailOffsetA + k + 1, newNo: tailOffsetB + k + 1 });
    }
    return out;
}

/** 只保留改动行和前后各 3 行上下文，分成若干段 */
export function diffHunks(lines: QaDiffLine[]): QaDiffHunk[] {
    const keep = new Array(lines.length).fill(false);
    lines.forEach((line, index) => {
        if (line.kind === "same") return;
        for (let k = Math.max(0, index - CONTEXT); k <= Math.min(lines.length - 1, index + CONTEXT); k += 1) keep[k] = true;
    });
    const hunks: QaDiffHunk[] = [];
    let current: QaDiffLine[] | null = null;
    lines.forEach((line, index) => {
        if (keep[index]) {
            (current ??= []).push(line);
        } else if (current) {
            hunks.push({ lines: current });
            current = null;
        }
    });
    if (current) hunks.push({ lines: current });
    return hunks;
}

export function diffStats(lines: QaDiffLine[]): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const line of lines) {
        if (line.kind === "add") added += 1;
        else if (line.kind === "del") removed += 1;
    }
    return { added, removed };
}
