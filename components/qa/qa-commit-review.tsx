"use client";

// Claude 工坊：修改提案的差异预览 + 仓库任务状态（检查 / 构建结果、待合并 PR）。
// 全部读 GitHub 的真实数据；没连仓库、没权限、没配 CI 时如实说明，不显示假进度。

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, CircleDashed, ExternalLink, Loader2, RefreshCw, X, XCircle } from "lucide-react";

import { diffHunks, diffLines, diffStats, type QaDiffHunk } from "@/lib/qa-diff";
import {
  getQaGithubChecks,
  listQaGithubPulls,
  loadQaGithubConfig,
  readQaGithubFile,
  type QaGithubCheckReport,
  type QaGithubPullSummary,
} from "@/lib/qa-github";
import type { QaCommitFile } from "@/lib/qa-github-write";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── 单个文件的差异 ─────────────────────────────────────

type FileDiffState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; hunks: QaDiffHunk[]; added: number; removed: number; isNew: boolean }
  | { kind: "error"; message: string };

function QaFileDiff({ file, branch }: { file: QaCommitFile; branch?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FileDiffState>({ kind: "idle" });

  const load = useCallback(async () => {
    const config = loadQaGithubConfig();
    if (!config) {
      setState({ kind: "error", message: "还没有连接仓库，无法读取原文件做对比" });
      return;
    }
    setState({ kind: "loading" });
    let before = "";
    let isNew = false;
    try {
      before = (await readQaGithubFile(config, file.path, undefined, branch)).text;
    } catch (error) {
      const message = errorText(error);
      // 目标分支上还没有这个文件：整份都是新增
      if (/文件不存在/.test(message)) isNew = true;
      else if (branch && /HTTP 404|No commit found/i.test(message)) isNew = true;
      else {
        setState({ kind: "error", message });
        return;
      }
    }
    const lines = diffLines(before, file.content);
    const stats = diffStats(lines);
    setState({ kind: "ready", hunks: diffHunks(lines), ...stats, isNew });
  }, [file.path, file.content, branch]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && (state.kind === "idle" || state.kind === "error")) void load();
  };

  return (
    <li className="qa-diff-file">
      <button type="button" className="qa-diff-file-head" onClick={toggle} aria-expanded={open}>
        <ChevronDown size={13} className={`qa-diff-chevron ${open ? "is-open" : ""}`} aria-hidden />
        <span className="qa-diff-path">{file.path}</span>
        {state.kind === "ready" && (
          <span className="qa-diff-stat">
            {state.isNew ? <em>新文件</em> : null}
            <b className="is-add">+{state.added}</b>
            <b className="is-del">−{state.removed}</b>
          </span>
        )}
      </button>
      {open && (
        <div className="qa-diff-body">
          {state.kind === "loading" && (
            <p className="qa-diff-note"><Loader2 size={12} className="qa-spin" /> 正在读取原文件…</p>
          )}
          {state.kind === "error" && (
            <p className="qa-diff-note is-error">
              读取失败：{state.message}
              <button type="button" className="qa-diff-retry" onClick={() => void load()}>重试</button>
            </p>
          )}
          {state.kind === "ready" && state.hunks.length === 0 && <p className="qa-diff-note">内容与当前版本相同，没有改动</p>}
          {state.kind === "ready" &&
            state.hunks.map((hunk, index) => (
              <pre key={index} className="qa-diff-hunk">
                {hunk.lines.map((line, i) => (
                  <span key={i} className={`qa-diff-line is-${line.kind}`}>
                    <i>{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}</i>
                    {line.text || " "}
                  </span>
                ))}
              </pre>
            ))}
        </div>
      )}
    </li>
  );
}

/** 提案卡里的文件列表：每个文件可以展开看与仓库当前版本的逐行差异 */
export function QaCommitDiffList({ files, deletes, branch }: { files: QaCommitFile[]; deletes?: string[]; branch?: string }) {
  return (
    <ul className="qa-commit-files qa-diff-list">
      {files.map((file) => (
        <QaFileDiff key={file.path} file={file} branch={branch} />
      ))}
      {(deletes ?? []).map((path) => (
        <li key={`del-${path}`} className="qa-commit-file-delete">− {path}（删除）</li>
      ))}
    </ul>
  );
}

// ── 检查状态 ─────────────────────────────────────────

function CheckIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status !== "completed") return <CircleDashed size={14} className="qa-check-icon is-pending" />;
  if (conclusion === "success" || conclusion === "neutral" || conclusion === "skipped") return <CheckCircle2 size={14} className="qa-check-icon is-ok" />;
  return <XCircle size={14} className="qa-check-icon is-fail" />;
}

const OVERALL_TEXT: Record<QaGithubCheckReport["overall"], string> = {
  none: "这个提交没有任何检查（仓库没有配置自动检查或构建）",
  pending: "检查进行中",
  success: "全部检查通过",
  failure: "有检查失败",
};

type ChecksState =
  | { kind: "loading" }
  | { kind: "ready"; report: QaGithubCheckReport }
  | { kind: "error"; message: string };

/** 某个提交 / 分支在仓库 CI 里的类型检查、构建等结果；进行中时每 15 秒自动刷新 */
export function QaCommitChecks({ refName }: { refName: string }) {
  const [state, setState] = useState<ChecksState>({ kind: "loading" });

  const load = useCallback(async () => {
    const config = loadQaGithubConfig();
    if (!config) {
      setState({ kind: "error", message: "仓库配置已丢失，请重新连接仓库" });
      return;
    }
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    try {
      setState({ kind: "ready", report: await getQaGithubChecks(config, refName) });
    } catch (error) {
      setState({ kind: "error", message: errorText(error) });
    }
  }, [refName]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = state.kind === "ready" && state.report.overall === "pending";
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => void load(), 15_000);
    return () => window.clearTimeout(timer);
  }, [pending, load, state]);

  return (
    <div className="qa-checks">
      <div className="qa-checks-head">
        <span>检查与构建</span>
        <button type="button" className="qa-checks-refresh" onClick={() => void load()} aria-label="刷新检查状态">
          {state.kind === "loading" ? <Loader2 size={13} className="qa-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>
      {state.kind === "loading" && <p className="qa-diff-note">正在读取检查结果…</p>}
      {state.kind === "error" && (
        <p className="qa-diff-note is-error">
          <AlertCircle size={12} /> {state.message}
          <button type="button" className="qa-diff-retry" onClick={() => void load()}>重试</button>
        </p>
      )}
      {state.kind === "ready" && (
        <>
          <p className={`qa-checks-overall is-${state.report.overall}`}>{OVERALL_TEXT[state.report.overall]}</p>
          {state.report.checks.length > 0 && (
            <ul className="qa-check-list">
              {state.report.checks.map((check, index) => (
                <li key={`${check.name}-${index}`}>
                  <CheckIcon status={check.status} conclusion={check.conclusion} />
                  <span className="qa-check-name">{check.name}</span>
                  {check.url && (
                    <a href={check.url} target="_blank" rel="noreferrer noopener" aria-label={`查看 ${check.name} 详情`}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {check.summary && check.conclusion && check.conclusion !== "success" && <small>{check.summary}</small>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ── 任务状态面板（顶栏打开）────────────────────────────

export function QaTaskStatusSheet({ onClose, onConnectRepo }: { onClose: () => void; onConnectRepo: () => void }) {
  const config = loadQaGithubConfig();
  const [pulls, setPulls] = useState<{ kind: "loading" } | { kind: "ready"; list: QaGithubPullSummary[] } | { kind: "error"; message: string }>({ kind: "loading" });

  const loadPulls = useCallback(async () => {
    const current = loadQaGithubConfig();
    if (!current) return;
    setPulls({ kind: "loading" });
    try {
      setPulls({ kind: "ready", list: await listQaGithubPulls(current, "open") });
    } catch (error) {
      setPulls({ kind: "error", message: errorText(error) });
    }
  }, []);

  useEffect(() => {
    if (config) void loadPulls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="qa-sheet-backdrop" onClick={onClose}>
      <div className="qa-sheet qa-task-sheet" role="dialog" aria-label="任务状态" onClick={(event) => event.stopPropagation()}>
        <div className="qa-sheet-head">
          <span className="qa-sheet-title">任务状态</span>
          <button type="button" className="qa-icon-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {!config ? (
          <div className="qa-task-empty">
            <p>还没有连接仓库。连接后可以在这里看到最近提交的检查、构建结果和待合并的 PR。</p>
            <button type="button" className="qa-sheet-btn is-primary" onClick={onConnectRepo}>连接仓库</button>
          </div>
        ) : (
          <div className="qa-task-body">
            <p className="qa-task-repo">
              {config.owner}/{config.repo}
              {config.branch ? ` · ${config.branch}` : " · 默认分支"}
            </p>
            <QaCommitChecks refName={config.branch || ""} />
            <div className="qa-checks">
              <div className="qa-checks-head">
                <span>待合并的修改请求（PR）</span>
                <button type="button" className="qa-checks-refresh" onClick={() => void loadPulls()} aria-label="刷新 PR 列表">
                  {pulls.kind === "loading" ? <Loader2 size={13} className="qa-spin" /> : <RefreshCw size={13} />}
                </button>
              </div>
              {pulls.kind === "loading" && <p className="qa-diff-note">正在读取…</p>}
              {pulls.kind === "error" && (
                <p className="qa-diff-note is-error">
                  {pulls.message}
                  <button type="button" className="qa-diff-retry" onClick={() => void loadPulls()}>重试</button>
                </p>
              )}
              {pulls.kind === "ready" && pulls.list.length === 0 && <p className="qa-diff-note">没有待合并的 PR</p>}
              {pulls.kind === "ready" && pulls.list.length > 0 && (
                <ul className="qa-check-list">
                  {pulls.list.map((pull) => (
                    <li key={pull.number}>
                      <span className="qa-check-name">#{pull.number} {pull.title}</span>
                      <a href={pull.htmlUrl} target="_blank" rel="noreferrer noopener" aria-label={`打开 PR ${pull.number}`}>
                        <ExternalLink size={12} />
                      </a>
                      <small>{pull.head} → {pull.base}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
