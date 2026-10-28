"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// CommonMark 的 flanking 规则会让 **「加粗」** 这类紧贴全角标点的写法解析失败
// （** 后跟标点时要求前面是空格/标点，中文里前面通常是汉字），中文消息大量中招。
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkBreaks from "remark-breaks";
import { AppWindow, ArrowUp, BrushCleaning, Check, ChevronLeft, ChevronDown, ChevronRight, Copy, Drama, FileCode2, FileText, Gamepad2, ListChecks, Github, Image as ImageIcon, Loader2, Menu, MoreVertical, Paperclip, Pencil, Pin, PinOff, Play, Plus, Square, Trash2, Wrench, X, List, ArrowDown, Sparkles } from "lucide-react";
import { getQaApiLogs, clearQaApiLogs, type DebugInfo } from "@/lib/api-log-store";
import { QaFileCard } from "@/components/qa-file-card";
import { QaCommitChecks, QaCommitDiffList, QaTaskStatusSheet } from "@/components/qa/qa-commit-review";
import { parseQaFileMarker } from "@/lib/qa-computer-tools";
import { CustomAppRunner } from "@/components/app-market/custom-app-runner";
import { CustomAppForegroundBoundary } from "@/components/app-market/custom-app-failure";
import { GameHubApp } from "@/components/game/game-hub-app";
import { BlackMarketApp } from "@/components/shopping/black-market-app";
import { getInstalledCustomApp } from "@/lib/custom-app-storage";
import type { QaCreatedContent } from "@/lib/qa-agent-tools";
import {
  applyQaCommit,
  cancelQaCommit,
  carryOverQaSession,
  clearQaToolHistory,
  createQaSession,
  deleteQaSession,
  countQaEditResendAppliedCommits,
  editAndResendQaMessage,
  getQaActiveContextChars,
  getQaChatSnapshot,
  getQaContextBudgetChars,
  getQaEditAndResendBlockReason,
  hasQaToolHistory,
  hydrateQaChat,
  QA_CONTEXT_BUDGET_MAX,
  QA_CONTEXT_BUDGET_MIN,
  QA_DEFAULT_CONTEXT_BUDGET_CHARS,
  QA_TEXT_ATTACHMENT_MAX_BYTES,
  QA_TEXT_ATTACHMENTS_MAX_COUNT,
  QA_TEXT_ATTACHMENTS_MAX_CHARS,
  setQaContextBudgetChars,
  retryQaMessage,
  renameQaSession,
  revertQaAppliedCommit,
  sendQaMessage,
  stopQaGeneration,
  subscribeQaChat,
  switchQaSession,
  toggleQaSessionPin,
  updateQaMessageContent,
  type QaMsg,
  type QaSession,
  type QaTextAttachment,
  type QaToolStatus,
} from "@/lib/qa-chat-store";
import { ensureBuiltinWorkshopOutlinePlugin } from "@/lib/chat-plugin-builtin-workshop-outline";
import {
  getQaPageChars,
  setQaPageChars,
  QA_DEFAULT_PAGE_CHARS,
  QA_PAGE_CHARS_MIN,
  QA_PAGE_CHARS_MAX,
  getQaMaxRounds,
  setQaMaxRounds,
  QA_DEFAULT_MAX_ROUNDS,
  QA_MAX_ROUNDS_MIN,
  QA_MAX_ROUNDS_MAX,
  getQaMaxOutputTokens,
  setQaMaxOutputTokens,
  QA_DEFAULT_MAX_OUTPUT_TOKENS,
  QA_MAX_OUTPUT_TOKENS_MIN,
  QA_MAX_OUTPUT_TOKENS_MAX,
} from "@/lib/qa-prefs";
import {
  getLlmRequestTimeoutMs,
  setLlmRequestTimeoutMs,
  LLM_REQUEST_TIMEOUT_DEFAULT_MS,
  LLM_REQUEST_TIMEOUT_MIN_MS,
  LLM_REQUEST_TIMEOUT_MAX_MS,
} from "@/lib/chat-engine";
import { resolveQaApiConfig } from "@/lib/qa-agent-engine";
import { resolveUserIdentity, USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";
import {
  loadQaGithubConfig,
  saveQaGithubConfig,
  clearQaGithubConfig,
  validateQaGithubConfig,
  type QaGithubConfig,
  type QaGithubValidation,
} from "@/lib/qa-github";
import "@/lib/qa-error-log";

type PhoneQaAppProps = {
  onClose: () => void;
  onNotice?: (msg: string) => void;
};

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

type WorkshopMenuItem = {
  label: string;
  hint?: string;
  insert: string;
  dot?: boolean;
};

const WORKSHOP_CONTEXT_ITEMS: WorkshopMenuItem[] = [
  { label: "线上美化", hint: "本机已保存的聊天气泡样式。点击后会在输入框插入一句引导，发送后 Claude 会读取这份样式作为回复时使用的视觉参考", insert: "请引用本机内容中的「线上美化」来完成下面的任务。" },
  { label: "线下美化", hint: "本机已保存的应用整体界面样式。点击后会让 Claude 读取这份样式作为修改或重构界面时的参考", insert: "请引用本机内容中的「线下美化」来完成下面的任务。" },
  { label: "心声", hint: "我的心声设定（角色在说话时附加的内心独白）。点击后会让 Claude 读取我的心声作为回复时的内心活动参考", insert: "请引用本机内容中的「心声」来完成下面的任务。" },
  { label: "角色卡", hint: "当前激活的角色卡（人设、性格、说话方式等）。点击后会让 Claude 读取角色卡作为回复时的口吻与人设参考", insert: "请引用本机内容中的「角色卡」来完成下面的任务。" },
  { label: "世界书", hint: "当前世界书设定（世界观、地点、设定词条）。点击后会让 Claude 读取世界书作为回复时的世界观参考", insert: "请引用本机内容中的「世界书」来完成下面的任务。" },
  { label: "聊天片段", hint: "已单独保存的历史聊天片段。点击后会让 Claude 读取这段记录作为上下文参考", insert: "请引用本机内容中的「聊天片段」来完成下面的任务。", dot: true },
  { label: "仓库帖子", hint: "已保存的 GitHub 仓库发帖记录。点击后会让 Claude 读取这些帖子作为素材或讨论对象", insert: "请引用本机内容中的「仓库帖子」来完成下面的任务。", dot: true },
];

const WORKSHOP_SKILL_ITEMS: WorkshopMenuItem[] = [
  { label: "线上美化", hint: "让 Claude 用「线上美化」技能处理你接下来要给的内容（生成新的聊天气泡样式并写回本机）", insert: "请使用 Claude 技能「线上美化」处理下面的内容。" },
  { label: "线下美化", hint: "让 Claude 用「线下美化」技能处理你接下来要给的内容（生成新的应用界面样式并写回本机）", insert: "请使用 Claude 技能「线下美化」处理下面的内容。" },
  { label: "心声", hint: "让 Claude 用「心声」技能处理你的角色或内容（生成符合人设的内心独白）", insert: "请使用 Claude 技能「心声」处理下面的内容。" },
  { label: "角色卡", hint: "让 Claude 用「角色卡」技能根据你提供的设定生成一张新的角色卡", insert: "请使用 Claude 技能「角色卡」处理下面的内容。" },
  { label: "世界书", hint: "让 Claude 用「世界书」技能根据你提供的设定生成一份新的世界书", insert: "请使用 Claude 技能「世界书」处理下面的内容。" },
  { label: "看图取色", hint: "上传一张图，让 Claude 提取主色调与配色方案，结果会写到本机主题预设", insert: "请使用 Claude 技能「看图取色」处理下面的内容。", dot: true },
  { label: "检查报错", hint: "把当前页面或代码交给 Claude，让它自己排查报错并给出修复方案", insert: "请使用 Claude 技能「检查报错」处理下面的内容。", dot: true },
  { label: "润色人设", hint: "让 Claude 润色现有角色的人设文字，结果会写回当前角色卡", insert: "请使用 Claude 技能「润色人设」处理下面的内容。", dot: true },
  { label: "出夜间版", hint: "让 Claude 基于现有界面或样式生成一份夜间深色版本，结果会写回本机美化文件", insert: "请使用 Claude 技能「出夜间版」处理下面的内容。", dot: true },
  { label: "拆成世界书", hint: "把一段长文本交给 Claude，让它拆解成世界书词条并写回当前世界书", insert: "请使用 Claude 技能「拆成世界书」处理下面的内容。", dot: true },
  { label: "翻译", hint: "让 Claude 翻译你给的文本，结果会保留在对话里；书源翻译请用书房里的翻译功能", insert: "请使用 Claude 技能「翻译」处理下面的内容。", dot: true },
];

// ── 代码块（语言标签 + 一键复制）─────────────────────

function QaCodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className || "")?.[1] ?? "";
  const code = String(children ?? "").replace(/\n$/, "");

  const handleCopy = useCallback(() => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }, [code]);

  return (
    <div className="qa-codeblock">
      <div className="qa-codeblock-head">
        <span className="qa-codeblock-lang">{language || "code"}</span>
        <button type="button" className="qa-codeblock-copy" onClick={handleCopy} aria-label="复制代码">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const QA_MARKDOWN_COMPONENTS = {
  pre({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  },
  code(props: { className?: string; children?: React.ReactNode }) {
    const { className, children } = props;
    const isBlock = /language-/.test(className || "") || String(children ?? "").includes("\n");
    if (isBlock) return <QaCodeBlock className={className}>{children}</QaCodeBlock>;
    return <code className="qa-inline-code">{children}</code>;
  },
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// ── 提交提案卡片 ─────────────────────────────────────

function QaCommitCard({ msg }: { msg: QaMsg }) {
  const pending = msg.pendingCommit;
  const [busy, setBusy] = useState(false);
  if (!pending) return null;
  const { proposal, status, result, error } = pending;
  const files = proposal.files;

  const apply = async () => {
    setBusy(true);
    await applyQaCommit(msg.id);
    setBusy(false);
  };
  const revert = async () => {
    setBusy(true);
    await revertQaAppliedCommit(msg.id);
    setBusy(false);
  };

  return (
    <div className={`qa-commit-card status-${status}`}>
      <div className="qa-commit-head">
        <span className="qa-commit-title">
          {status === "applied" ? "已提交" : status === "reverted" ? "已撤销" : status === "canceled" ? "已取消" : "修改提案"}
        </span>
        <span className="qa-commit-branch">{proposal.branch || "默认分支"} · {files.length + (proposal.deletes?.length ?? 0)} 个文件</span>
      </div>
      <div className="qa-commit-msg">{proposal.message}</div>
      {/* 每个文件可展开查看与仓库当前版本的逐行差异 */}
      <QaCommitDiffList files={files} deletes={proposal.deletes} branch={proposal.branch} />
      {error && <div className="qa-commit-error">{error}</div>}
      {status === "pending" && (
        <div className="qa-commit-actions">
          <button type="button" className="qa-commit-btn is-primary" onClick={apply} disabled={busy}>
            {busy ? <Loader2 size={13} className="qa-spin" /> : "应用"}
          </button>
          <button type="button" className="qa-commit-btn" onClick={() => cancelQaCommit(msg.id)} disabled={busy}>
            取消
          </button>
        </div>
      )}
      {(status === "applying" || status === "reverting") && (
        <div className="qa-commit-actions">
          <span className="qa-commit-progress">
            <Loader2 size={13} className="qa-spin" /> {status === "applying" ? "提交中…" : "撤销中…"}
          </span>
        </div>
      )}
      {status === "applied" && result && (
        <div className="qa-commit-actions">
          <a className="qa-commit-link" href={result.htmlUrl} target="_blank" rel="noreferrer noopener">
            查看 commit {result.sha.slice(0, 7)}
          </a>
          <button type="button" className="qa-commit-btn is-danger" onClick={revert} disabled={busy}>
            撤销
          </button>
        </div>
      )}
      {/* 提交后：读取仓库 CI 对这次提交真实跑出的类型检查 / 构建结果 */}
      {status === "applied" && result && <QaCommitChecks refName={result.sha} />}
    </div>
  );
}

// ── 消息渲染 ─────────────────────────────────────────

// 工具调用行：折叠的单行摘要，点开展开参数与结果（Claude Code 风格）
function QaToolRow({ tool }: { tool: QaToolStatus }) {
  const [open, setOpen] = useState(false);
  // 「电脑文件 op=send」的结果里带文件卡标记：卡片常显，标记从结果文本中剥离
  const { text: resultText, file } = parseQaFileMarker(tool.result || "");
  const hasDetail = Boolean(tool.detail || resultText);
  const summary = tool.running ? `正在${tool.name}…` : tool.success === false ? `${tool.name}失败` : tool.name;
  return (
    <div className={`qa-tool-row ${tool.running ? "is-running" : tool.success === false ? "is-fail" : "is-done"}`}>
      <button
        type="button"
        className="qa-tool-row-head"
        onClick={() => hasDetail && setOpen((v) => !v)}
        disabled={!hasDetail}
      >
        {tool.running ? <Loader2 size={13} className="qa-spin" /> : <Wrench size={13} />}
        <span className="qa-tool-row-summary">
          {summary}
          {tool.subtitle && <span className="qa-tool-row-sub">{tool.subtitle}</span>}
        </span>
        {hasDetail && <ChevronRight size={14} className={`qa-tool-row-chevron ${open ? "is-open" : ""}`} />}
      </button>
      {open && hasDetail && (
        <div className="qa-tool-row-body">
          {tool.detail && (
            <>
              <div className="qa-tool-row-label">参数</div>
              <pre className="qa-tool-row-pre">{tool.detail}</pre>
            </>
          )}
          {resultText && (
            <>
              <div className="qa-tool-row-label">结果</div>
              <pre className="qa-tool-row-pre">{resultText}</pre>
            </>
          )}
        </div>
      )}
      {file && <QaFileCard file={file} />}
    </div>
  );
}

// 已完成文本的 Markdown 渲染：memo 缓存——流式期间每次增量都全文重排 remark 是
// 低端机 WebView OOM 崩溃的主因（几万字 × 每秒多次解析）。文本不变就不重渲。
const QaMarkdownBlock = memo(function QaMarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkCjkFriendly]} components={QA_MARKDOWN_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
});

// 正在生长的活跃段：纯文本渲染（零解析成本），生成结束后换回完整 Markdown
function QaStreamingText({ text }: { text: string }) {
  return (
    <>
      <div className="qa-stream-text">{text}</div>
      <span className="qa-cursor" />
    </>
  );
}

/** 欢迎页的轻量品牌标记。保持 Claude 的克制感，不再使用像素螃蟹贴纸。 */
function QaWorkshopMark() {
  return (
    <svg className="qa-workshop-mark" viewBox="0 0 64 64" aria-hidden>
      <path d="M32 7c2.8 13.4 5.6 21 12.6 25C37.6 36 34.8 43.6 32 57c-2.8-13.4-5.6-21-12.6-25C26.4 28 29.2 20.4 32 7Z" fill="currentColor" />
      <path d="M7 32c13.4-2.8 21-5.6 25-12.6C36 26.4 43.6 29.2 57 32c-13.4 2.8-21 5.6-25 12.6C28 37.6 20.4 34.8 7 32Z" fill="currentColor" opacity=".82" />
    </svg>
  );
}

/** Claude 风格思考过程：生成时自动展开，完成后折叠成一条可回看的摘要。 */
function QaReasoningBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming: boolean }) {
  const [open, setOpen] = useState(isStreaming);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt] = useState(() => Date.now());
  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);
  useEffect(() => {
    if (!isStreaming) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isStreaming, startedAt]);
  const preview = reasoning.replace(/\s+/g, " ").trim();
  return (
    <div className={`qa-reasoning ${isStreaming ? "is-streaming" : ""} ${open ? "is-open" : ""}`}>
      <button type="button" className="qa-reasoning-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="qa-reasoning-mark" aria-hidden><Sparkles size={14} strokeWidth={1.8} /></span>
        <span className="qa-reasoning-label">{isStreaming ? "正在思考" : "思考过程"}</span>
        {isStreaming && <span className="qa-reasoning-dots" aria-hidden><i /><i /><i /></span>}
        {(isStreaming || elapsed > 0) && <span className="qa-reasoning-timer">{elapsed}s</span>}
        {!isStreaming && preview && <span className="qa-reasoning-preview">{preview}</span>}
        <ChevronDown size={14} className="qa-reasoning-chevron" aria-hidden />
      </button>
      {open && (
        <div className="qa-reasoning-body">
          <div className="qa-reasoning-line" aria-hidden />
          <div className="qa-reasoning-text">{reasoning}</div>
          {isStreaming && <span className="qa-cursor qa-reasoning-cursor" />}
        </div>
      )}
    </div>
  );
}

const QaMessageItem = memo(function QaMessageItem({
  msg,
  isStreaming,
  onRetry,
  onViewImage,
  onCopy,
  onEdit,
}: {
  msg: QaMsg;
  isStreaming: boolean;
  onRetry: (id: string) => void;
  onViewImage: (url: string) => void;
  onCopy: (content: string) => void;
  onEdit: (msg: QaMsg) => void;
}) {
  const thinkingOnly = isStreaming && !msg.content && (!msg.tools || msg.tools.length === 0);
  // 消息操作（复制原始内容 / 编辑原始内容——前端渲染会吞掉一些特殊标签，
  // 沟通时看不到原文）常驻在气泡下方，不用长按触发：长按要跟系统的选词、
  // 取词、划词搜索抢同一个手势，在移动端几乎必然打架。
  // 生成中不显示（内容还不完整，复制/编辑都没有意义）。
  const showActions = !isStreaming && !thinkingOnly;
  const msgWrap = (node: ReactNode) => (
    <div className="qa-msg-wrap" data-msg-id={msg.id}>
      {node}
      {showActions && (
        <div className="qa-msg-actions" data-role={msg.role}>
          <button type="button" className="qa-msg-action" aria-label="复制原始内容" title="复制" onClick={() => onCopy(msg.content)}>
            <Copy size={14} strokeWidth={2} />
          </button>
          <button type="button" className="qa-msg-action" aria-label="修改原始内容" title="修改" onClick={() => onEdit(msg)}>
            <Pencil size={14} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
  // 时序分段渲染：文字与工具行按实际发生顺序交错（连续工具行合并成一组）；
  // 旧消息没有 segments 时回退「工具在顶、文字在下」布局。
  // hooks 必须在 user 分支 early-return 之前调用（rules-of-hooks）
  const segmentBlocks = useMemo(() => {
    if (!msg.segments?.length) return null;
    const blocks: Array<{ kind: "text"; text: string } | { kind: "tools"; tools: QaToolStatus[] }> = [];
    for (const seg of msg.segments) {
      const last = blocks[blocks.length - 1];
      if (seg.kind === "tool") {
        if (last?.kind === "tools") last.tools.push(seg.tool);
        else blocks.push({ kind: "tools", tools: [seg.tool] });
      } else if (seg.text.trim()) {
        if (last?.kind === "text") last.text += seg.text;
        else blocks.push({ kind: "text", text: seg.text });
      }
    }
    return blocks.length ? blocks : null;
  }, [msg.segments]);

  if (msg.role === "user") {
    return msgWrap(
      <div className="qa-msg-user-row">
        <div className="qa-msg-user">
          {msg.images && msg.images.length > 0 && (
            <div className="qa-msg-images">
              {msg.images.map((url, i) => (
                <button key={i} type="button" className="qa-msg-image" onClick={() => onViewImage(url)} aria-label="查看图片">
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          )}
          {msg.files && msg.files.length > 0 && (
            <div className="qa-msg-files">
              {msg.files.map((file) => (
                <span className="qa-file-chip" key={file.name} title={file.name}>
                  <FileText size={13} />
                  <span>{file.name}</span>
                </span>
              ))}
            </div>
          )}
          {msg.content}
        </div>
      </div>,
    );
  }

  return msgWrap(
    <div className="qa-msg-assistant">
      {msg.reasoning && (
        <QaReasoningBlock reasoning={msg.reasoning} isStreaming={isStreaming} />
      )}
      {segmentBlocks ? (
        segmentBlocks.map((block, i) =>
          block.kind === "tools" ? (
            <div className="qa-tools" key={i}>
              {block.tools.map((tool, j) => (
                <QaToolRow key={`${tool.name}-${j}`} tool={tool} />
              ))}
            </div>
          ) : isStreaming && i === segmentBlocks.length - 1 ? (
            <div className="qa-markdown" key={i}>
              <QaStreamingText text={block.text} />
            </div>
          ) : (
            <div className="qa-markdown" key={i}>
              <QaMarkdownBlock text={block.text} />
            </div>
          ),
        )
      ) : (
        <>
          {msg.tools && msg.tools.length > 0 && (
            <div className="qa-tools">
              {msg.tools.map((tool, i) => (
                <QaToolRow key={`${tool.name}-${i}`} tool={tool} />
              ))}
            </div>
          )}
          {thinkingOnly ? (
            <div className="qa-thinking">{msg.toolDrafting ? "正在编写工具调用…" : msg.reasoning ? "正在思考…" : "正在生成…"}</div>
          ) : isStreaming ? (
            <div className="qa-markdown">
              <QaStreamingText text={msg.content} />
            </div>
          ) : (
            <div className="qa-markdown">
              <QaMarkdownBlock text={msg.content} />
            </div>
          )}
        </>
      )}
      {isStreaming && msg.toolDrafting && !thinkingOnly && (
        <div className="qa-thinking qa-tool-drafting">正在编写工具调用…</div>
      )}
      {msg.streamNote && <div className="qa-msg-note">{msg.streamNote}</div>}
      {msg.pendingCommit && <QaCommitCard msg={msg} />}
      {msg.aborted && <div className="qa-msg-note">已停止生成</div>}
      {msg.error && (
        <div className="qa-msg-error">
          <div className="qa-msg-error-text">{msg.error}</div>
          <button type="button" className="qa-retry-btn" onClick={() => onRetry(msg.id)}>
            重试
          </button>
        </div>
      )}
    </div>,
  );
});

// ── 会话抽屉 ─────────────────────────────────────────

function QaSessionDrawer({
  sessions,
  activeId,
  carryingId,
  onSelect,
  onDelete,
  onCreate,
  onOpenSettings,
  onOpenApiLog,
  onClearTools,
  onRenameRequest,
  onCarryOver,
}: {
  sessions: QaSession[];
  activeId: string | null;
  carryingId?: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onOpenSettings: () => void;
  onOpenApiLog: () => void;
  onClearTools: () => void;
  onRenameRequest: (id: string, title: string) => void;
  onCarryOver: (id: string) => void;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // 置顶的排最前，其余保持时间序。只在渲染层排，存储顺序不动
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [sessions]);

  return (
    <aside className="qa-drawer">
      <div className="qa-drawer-head">
        <span className="qa-drawer-title">Claude 空间</span>
        <button type="button" className="qa-drawer-create" onClick={onCreate}>
          <Plus size={15} strokeWidth={2} />
          <span>新对话</span>
        </button>
      </div>
      <span className="qa-drawer-section">最近对话</span>
      <div
        className="qa-drawer-list hide-scrollbar"
        onClick={() => { if (menuOpenId) setMenuOpenId(null); }}
      >
        {sortedSessions.length === 0 && <div className="qa-drawer-empty">还没有对话</div>}
        {sortedSessions.map((session) => {
          const isCarrying = carryingId === session.id;
          return (
          <div
            key={session.id}
            className={`qa-drawer-item ${session.id === activeId ? "is-active" : ""} ${isCarrying ? "is-carrying" : ""}`}
            onClick={() => { if (!isCarrying) onSelect(session.id); }}
          >
            {isCarrying && <div className="qa-drawer-item-progress" />}
            <div className="qa-drawer-item-main">
              <span className="qa-drawer-item-title">
                {session.isPinned && <Pin size={12} className="qa-drawer-pin-mark" aria-label="已置顶" />}
                {session.title}
              </span>
              <span className="qa-drawer-item-time">
                {isCarrying ? "正在结转记忆..." : formatRelativeTime(session.updatedAt)}
              </span>
            </div>
            <button
              type="button"
              className="qa-icon-btn qa-drawer-item-more"
              aria-label="更多操作"
              aria-expanded={menuOpenId === session.id}
              disabled={isCarrying}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === session.id ? null : session.id);
              }}
            >
              {isCarrying ? <Loader2 size={14} className="qa-spin" /> : <MoreVertical size={14} />}
            </button>

            {menuOpenId === session.id && (
              <div className="qa-drawer-item-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="qa-drawer-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleQaSessionPin(session.id);
                    setMenuOpenId(null);
                  }}
                >
                  {session.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                  {session.isPinned ? "取消置顶" : "置顶"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="qa-drawer-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameRequest(session.id, session.title);
                    setMenuOpenId(null);
                  }}
                >
                  <Pencil size={14} /> 重命名
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`qa-drawer-menu-btn ${isCarrying ? "is-carrying" : ""}`}
                  disabled={isCarrying}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCarryOver(session.id);
                  }}
                >
                  {isCarrying ? <Loader2 size={14} className="qa-spin" /> : <Square size={14} />}
                  {isCarrying ? "正在结转中..." : "结转新会话"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="qa-drawer-menu-btn is-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                    setMenuOpenId(null);
                  }}
                >
                  <Trash2 size={14} /> 删除
                </button>
              </div>
            )}
          </div>
        );})}
      </div>
      <div className="qa-drawer-foot qa-drawer-tools">
        <button type="button" className="qa-drawer-tool" onClick={onOpenSettings}>
          <Wrench size={15} strokeWidth={1.9} />
          <span>配置</span>
        </button>
        <button type="button" className="qa-drawer-tool" onClick={onOpenApiLog}>
          <FileCode2 size={15} strokeWidth={1.9} />
          <span>调用记录</span>
        </button>
        <button type="button" className="qa-drawer-tool" onClick={onClearTools}>
          <BrushCleaning size={15} strokeWidth={1.9} />
          <span>清理记录</span>
        </button>
      </div>
    </aside>
  );
}

// ── 工坊配置面板 ─────────────────────────────────────

function QaSettingsSheet({ onClose, onNotice }: { onClose: () => void; onNotice?: (msg: string) => void }) {
  const [budget, setBudget] = useState(() => String(getQaContextBudgetChars()));
  const [pageChars, setPageChars] = useState(() => String(getQaPageChars()));
  const [maxRounds, setMaxRounds] = useState(() => String(getQaMaxRounds()));
  const [maxOutTokens, setMaxOutTokens] = useState(() => {
    const v = getQaMaxOutputTokens();
    return v == null ? "" : String(v);
  });
  const [timeoutMin, setTimeoutMin] = useState(() => String(Math.round(getLlmRequestTimeoutMs() / 60_000)));
  const usedChars = getQaActiveContextChars();
  const pct = Math.round((usedChars / getQaContextBudgetChars()) * 100);

  const save = () => {
    const parsed = Number(budget);
    if (!Number.isFinite(parsed) || parsed < QA_CONTEXT_BUDGET_MIN || parsed > QA_CONTEXT_BUDGET_MAX) {
      onNotice?.(`预算需为 ${QA_CONTEXT_BUDGET_MIN.toLocaleString()} - ${QA_CONTEXT_BUDGET_MAX.toLocaleString()} 之间的数字。`);
      return;
    }
    const parsedPage = Number(pageChars);
    if (!Number.isFinite(parsedPage) || parsedPage < QA_PAGE_CHARS_MIN || parsedPage > QA_PAGE_CHARS_MAX) {
      onNotice?.(`单页字符数需为 ${QA_PAGE_CHARS_MIN.toLocaleString()} - ${QA_PAGE_CHARS_MAX.toLocaleString()} 之间的数字。`);
      return;
    }
    const parsedRounds = Number(maxRounds);
    if (!Number.isFinite(parsedRounds) || parsedRounds < QA_MAX_ROUNDS_MIN || parsedRounds > QA_MAX_ROUNDS_MAX) {
      onNotice?.(`工具调用上限需为 ${QA_MAX_ROUNDS_MIN} - ${QA_MAX_ROUNDS_MAX} 之间的数字。`);
      return;
    }
    const trimmedTokens = maxOutTokens.trim();
    const parsedTokens = trimmedTokens ? Number(trimmedTokens) : null;
    if (parsedTokens != null && (!Number.isFinite(parsedTokens) || parsedTokens < QA_MAX_OUTPUT_TOKENS_MIN || parsedTokens > QA_MAX_OUTPUT_TOKENS_MAX)) {
      onNotice?.(`单次最大输出 token 需留空或为 ${QA_MAX_OUTPUT_TOKENS_MIN.toLocaleString()} - ${QA_MAX_OUTPUT_TOKENS_MAX.toLocaleString()} 之间的数字。`);
      return;
    }
    const parsedTimeoutMin = Number(timeoutMin);
    if (!Number.isFinite(parsedTimeoutMin) || parsedTimeoutMin * 60_000 < LLM_REQUEST_TIMEOUT_MIN_MS || parsedTimeoutMin * 60_000 > LLM_REQUEST_TIMEOUT_MAX_MS) {
      onNotice?.("请求超时时间需为 1 - 60 分钟之间的数字。");
      return;
    }
    setQaContextBudgetChars(parsed);
    setQaPageChars(parsedPage);
    setQaMaxRounds(parsedRounds);
    // 留空 = 显式不传 max_tokens（0 哨兵），与"没设置用默认值"区分开
    setQaMaxOutputTokens(trimmedTokens ? parsedTokens : 0);
    setLlmRequestTimeoutMs(Math.round(parsedTimeoutMin * 60_000));
    onNotice?.("已保存 Claude 配置。");
    onClose();
  };

  const reset = () => {
    setQaContextBudgetChars(null);
    setQaPageChars(null);
    setQaMaxRounds(null);
    setQaMaxOutputTokens(null);
    setBudget(String(QA_DEFAULT_CONTEXT_BUDGET_CHARS));
    setPageChars(String(QA_DEFAULT_PAGE_CHARS));
    setMaxRounds(String(QA_DEFAULT_MAX_ROUNDS));
    setMaxOutTokens(String(QA_DEFAULT_MAX_OUTPUT_TOKENS));
    setTimeoutMin(String(Math.round(LLM_REQUEST_TIMEOUT_DEFAULT_MS / 60_000)));
    setLlmRequestTimeoutMs(null);
    onNotice?.("已恢复默认配置。");
  };

  return (
    <div className="qa-devnotice-backdrop" onClick={onClose}>
      <div className="qa-devnotice" role="dialog" aria-label="Claude 配置" onClick={(e) => e.stopPropagation()}>
        <div className="qa-devnotice-title">Claude 配置</div>
        <label className="qa-settings-field">
          <span>上下文预算（字符）</span>
          <input
            type="number"
            inputMode="numeric"
            min={QA_CONTEXT_BUDGET_MIN}
            max={QA_CONTEXT_BUDGET_MAX}
            step={1000}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <div className="qa-settings-hint">
          上下文满 100% 时自动压缩成摘要并重新累计。中文约 1 字符 ≈ 1 token；默认 {QA_DEFAULT_CONTEXT_BUDGET_CHARS.toLocaleString()}，小上下文（32k）模型建议 30000–50000。
        </div>
        <div className="qa-settings-hint">当前会话已用 {usedChars.toLocaleString()} 字符（约 {pct}%）。</div>
        <label className="qa-settings-field">
          <span>单页读取字符数</span>
          <input
            type="number"
            inputMode="numeric"
            min={QA_PAGE_CHARS_MIN}
            max={QA_PAGE_CHARS_MAX}
            step={1000}
            value={pageChars}
            onChange={(e) => setPageChars(e.target.value)}
          />
        </label>
        <div className="qa-settings-hint">
          克克翻页读答疑文档 / 本机内容 / 仓库源码时，每页返回的字符数。默认 {QA_DEFAULT_PAGE_CHARS.toLocaleString()}；调大读得快但更占上下文，小上下文模型建议调小。
        </div>
        <label className="qa-settings-field">
          <span>单轮工具调用上限（次）</span>
          <input
            type="number"
            inputMode="numeric"
            min={QA_MAX_ROUNDS_MIN}
            max={QA_MAX_ROUNDS_MAX}
            step={1}
            value={maxRounds}
            onChange={(e) => setMaxRounds(e.target.value)}
          />
        </label>
        <div className="qa-settings-hint">
          一次提问里克克最多连续执行多少轮工具，用完会提示「回复继续」。默认 {QA_DEFAULT_MAX_ROUNDS}；复杂任务（写游戏、改代码）可调大，想控制 token 消耗可调小。
        </div>
        <label className="qa-settings-field">
          <span>单次最大输出 token</span>
          <input
            type="number"
            inputMode="numeric"
            min={QA_MAX_OUTPUT_TOKENS_MIN}
            max={QA_MAX_OUTPUT_TOKENS_MAX}
            step={1000}
            placeholder="留空 = 不传"
            value={maxOutTokens}
            onChange={(e) => setMaxOutTokens(e.target.value)}
          />
        </label>
        <div className="qa-settings-hint">
          输出长度护栏：每次请求带 max_tokens，克克会按该预算分段写大文件，写超被安全截断后自动续接，不再整轮报废。默认 {QA_DEFAULT_MAX_OUTPUT_TOKENS.toLocaleString()}；留空 = 不传该参数（部分模型/中转不支持 max_tokens 时请留空）。
        </div>
        <label className="qa-settings-field">
          <span>请求超时时间（分钟）</span>
          <input
            type="number"
            inputMode="numeric"
            min={LLM_REQUEST_TIMEOUT_MIN_MS / 60_000}
            max={LLM_REQUEST_TIMEOUT_MAX_MS / 60_000}
            step={1}
            value={timeoutMin}
            onChange={(e) => setTimeoutMin(e.target.value)}
          />
        </label>
        <div className="qa-settings-hint">
          一次请求最多等多久，超过就自动中断，不再写死 30 分钟。默认 {Math.round(LLM_REQUEST_TIMEOUT_DEFAULT_MS / 60_000)} 分钟；思考模型或慢中转可以调大，主聊天与 Claude 共用这一项。
        </div>
        <div className="qa-devnotice-actions is-row">
          <button type="button" className="qa-devnotice-btn" onClick={reset}>恢复默认</button>
          <button type="button" className="qa-devnotice-btn is-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ── GitHub 仓库配置面板 ──────────────────────────────

function QaRepoSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const existing = useMemo(() => loadQaGithubConfig(), []);
  const [owner, setOwner] = useState(existing?.owner ?? "");
  const [repo, setRepo] = useState(existing?.repo ?? "");
  const [branch, setBranch] = useState(existing?.branch ?? "");
  const [token, setToken] = useState(existing?.token ?? "");
  const [writeMode, setWriteMode] = useState<"confirm" | "auto">(existing?.writeMode ?? "confirm");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<QaGithubValidation | null>(null);

  const buildConfig = useCallback((): QaGithubConfig => {
    const cfg: QaGithubConfig = { owner: owner.trim(), repo: repo.trim(), writeMode };
    if (branch.trim()) cfg.branch = branch.trim();
    if (token.trim()) cfg.token = token.trim();
    if (existing?.apiBase) cfg.apiBase = existing.apiBase;
    return cfg;
  }, [owner, repo, branch, token, writeMode, existing]);

  const handleVerify = useCallback(async () => {
    if (!owner.trim() || !repo.trim()) {
      setResult({ ok: false, error: "请填写 owner 和 repo。" });
      return;
    }
    setChecking(true);
    setResult(null);
    const validation = await validateQaGithubConfig(buildConfig());
    setResult(validation);
    setChecking(false);
  }, [owner, repo, buildConfig]);

  const handleSave = useCallback(() => {
    if (!owner.trim() || !repo.trim()) return;
    saveQaGithubConfig(buildConfig());
    onSaved();
    onClose();
  }, [owner, repo, buildConfig, onSaved, onClose]);

  const handleDisconnect = useCallback(() => {
    clearQaGithubConfig();
    onSaved();
    onClose();
  }, [onSaved, onClose]);

  return (
    <div className="qa-sheet-backdrop" onClick={onClose}>
      <div className="qa-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="qa-sheet-head">
          <span className="qa-sheet-title">
            <Github size={16} /> 连接 GitHub 仓库
          </span>
          <button type="button" className="qa-icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="qa-sheet-body hide-scrollbar">
          <p className="qa-sheet-note">
            连接后可以让 Claude 查阅这个仓库的代码来回答问题。配置只保存在你的浏览器本地，不会上传。公开仓库可不填 PAT。
          </p>
          <label className="qa-field">
            <span className="qa-field-label">Owner（用户名 / 组织）</span>
            <input className="qa-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="例：octocat" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          <label className="qa-field">
            <span className="qa-field-label">Repo（仓库名）</span>
            <input className="qa-input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="例：hello-world" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          <label className="qa-field">
            <span className="qa-field-label">分支（可选，默认仓库默认分支）</span>
            <input className="qa-input" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          <label className="qa-field">
            <span className="qa-field-label">Fine-grained PAT（私有仓库或搜索代码需要）</span>
            <input className="qa-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <span className="qa-field-hint">
              GitHub → Settings → Menu 按钮 → Developer settings → Personal access tokens → Fine-grained tokens。创建时 Repository access 记得勾选目标仓库；Permissions 里：Contents——只查代码选 Read-only，要让 Claude 改代码选 Read and write；要用「创建PR」再加 Pull requests 的 Read and write（Metadata 会自动带上，其余权限都不用勾）。
            </span>
          </label>
          <div className="qa-field">
            <span className="qa-field-label">改代码时的模式</span>
            <div className="qa-segment">
              <button type="button" className={`qa-segment-btn ${writeMode === "confirm" ? "is-active" : ""}`} onClick={() => setWriteMode("confirm")}>
                确认后提交
              </button>
              <button type="button" className={`qa-segment-btn ${writeMode === "auto" ? "is-active" : ""}`} onClick={() => setWriteMode("auto")}>
                全自动
              </button>
            </div>
            <span className="qa-field-hint">
              {writeMode === "confirm"
                ? "Claude 改代码前会先展示改动，你点「应用」才真正提交。推荐。"
                : "Claude 说完直接提交推送，不再逐次确认。仍可事后一键撤销。仅在信任后开启。"}
            </span>
          </div>
          {result && (
            <div className={`qa-verify ${result.ok ? "is-ok" : "is-fail"}`}>
              {result.ok
                ? `✓ 已连接 ${result.fullName}（${result.private ? "私有" : "公开"}，默认分支 ${result.defaultBranch}）`
                : `✗ ${result.error}`}
            </div>
          )}
        </div>
        <div className="qa-sheet-actions">
          {existing && (
            <button type="button" className="qa-sheet-btn is-danger" onClick={handleDisconnect}>
              断开
            </button>
          )}
          <button type="button" className="qa-sheet-btn" onClick={handleVerify} disabled={checking}>
            {checking ? <Loader2 size={14} className="qa-spin" /> : "验证"}
          </button>
          <button type="button" className="qa-sheet-btn is-primary" onClick={handleSave} disabled={!owner.trim() || !repo.trim()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App 本体 ─────────────────────────────────────────

export function PhoneQaApp({ onClose, onNotice }: PhoneQaAppProps) {
  const snapshot = useSyncExternalStore(subscribeQaChat, getQaChatSnapshot, getQaChatSnapshot);
  const [input, setInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [repoSheetOpen, setRepoSheetOpen] = useState(false);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [repoConnected, setRepoConnected] = useState(false);
  const [clearToolsOpen, setClearToolsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiLogOpen, setApiLogOpen] = useState(false);
  /** 会话重命名弹窗：抽屉菜单里点「重命名」打开 */
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<QaTextAttachment[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachMenuView, setAttachMenuView] = useState<"root" | "context" | "skills">("root");
  const [workshopSelection, setWorkshopSelection] = useState<string | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [editingMsg, setEditingMsg] = useState<QaMsg | null>(null);
  const [editText, setEditText] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editFiles, setEditFiles] = useState<QaTextAttachment[]>([]);
  const [editAttachMenuOpen, setEditAttachMenuOpen] = useState(false);
  // 修改重发时对"已提交到仓库的改动"的选择：撤销 / 保留（null = 还没选）
  const [editCommitDecision, setEditCommitDecision] = useState<"revert" | "keep" | null>(null);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editImageInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);
  const [apiReady, setApiReady] = useState(true);
  const [modelName, setModelName] = useState("");
  const [userName, setUserName] = useState(() => resolveUserIdentity()?.name?.trim() || "你");
  const [repoWritable, setRepoWritable] = useState(false);
  const [repoLabel, setRepoLabel] = useState("");
  const [writeMode, setWriteMode] = useState<"confirm" | "auto">("confirm");
  const [carryingSessionId, setCarryingSessionId] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const qaDraftMap = useRef<Map<string, string>>(new Map());
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);

  const refreshComposerMeta = useCallback(() => {
    setApiReady(resolveQaApiConfig() != null);
    setModelName(resolveQaApiConfig()?.defaultModel ?? "");
    setVisionEnabled(resolveQaApiConfig()?.enableImageRecognition === true);
    const gh = loadQaGithubConfig();
    setRepoConnected(gh != null);
    setRepoLabel(gh ? `${gh.owner}/${gh.repo}${gh.branch ? ` · ${gh.branch}` : ""}` : "");
    setRepoWritable(Boolean(gh?.token));
    setWriteMode(gh?.writeMode ?? "confirm");
  }, []);

  useEffect(() => {
    const refreshUserName = () => setUserName(resolveUserIdentity()?.name?.trim() || "你");
    refreshUserName();
    window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshUserName);
    return () => window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshUserName);
  }, []);

  useEffect(() => {
    void hydrateQaChat();
    refreshComposerMeta();
  }, [refreshComposerMeta]);

  // 清理原生 tool 调用历史（防报错）：与小卷同款——移除上下文里的工具记录与原生元数据
  const handleClearToolHistory = useCallback(() => {
    if (snapshot.isGenerating) {
      onNotice?.("克克正在执行，完成后再清理。");
      return;
    }
    if (!hasQaToolHistory()) {
      onNotice?.("没有可清理的工具调用历史。");
      return;
    }
    setClearToolsOpen(true);
  }, [snapshot.isGenerating, onNotice]);

  const confirmClearToolHistory = useCallback(() => {
    setClearToolsOpen(false);
    const result = clearQaToolHistory();
    onNotice?.(result && result.removed + result.cleaned > 0
      ? `已清理 ${result.removed} 条工具记录，整理 ${result.cleaned} 条消息。`
      : "没有可清理的工具调用历史。");
  }, [onNotice]);

  const toggleWriteMode = useCallback(() => {
    const gh = loadQaGithubConfig();
    if (!gh) return;
    const next = gh.writeMode === "auto" ? "confirm" : "auto";
    saveQaGithubConfig({ ...gh, writeMode: next });
    setWriteMode(next);
  }, []);

  const activeSession = useMemo(
    () => snapshot.sessions.find((s) => s.id === snapshot.activeSessionId) ?? null,
    [snapshot.sessions, snapshot.activeSessionId],
  );
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);
  const createdContent = useMemo(() => activeSession?.createdContent ?? [], [activeSession]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<QaCreatedContent | null>(null);
  const previewApp = useMemo(
    () => (previewItem?.type === "app" ? getInstalledCustomApp(previewItem.refId) : null),
    [previewItem],
  );

  // 手机端所有临时层都支持返回键／Escape，避免预览或抽屉把用户困住。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (viewerImage) { setViewerImage(null); return; }
      if (editingMsg) { setEditingMsg(null); return; }
      if (previewOpen) { setPreviewOpen(false); setPreviewItem(null); return; }
      if (taskSheetOpen) { setTaskSheetOpen(false); return; }
      if (repoSheetOpen) { setRepoSheetOpen(false); return; }
      if (settingsOpen) { setSettingsOpen(false); return; }
      if (apiLogOpen) { setApiLogOpen(false); return; }
      if (clearToolsOpen) { setClearToolsOpen(false); return; }
      if (outlineOpen) { setOutlineOpen(false); return; }
      if (attachMenuOpen) {
        if (attachMenuView !== "root") setAttachMenuView("root");
        else setAttachMenuOpen(false);
        return;
      }
      if (drawerOpen) setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerImage, editingMsg, previewOpen, taskSheetOpen, repoSheetOpen, settingsOpen, apiLogOpen, clearToolsOpen, outlineOpen, attachMenuOpen, attachMenuView, drawerOpen]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const closeAttachMenu = useCallback(() => {
    setAttachMenuOpen(false);
    setAttachMenuView("root");
  }, []);

  const chooseWorkshopItem = useCallback((item: WorkshopMenuItem, kind: "context" | "skill") => {
    setWorkshopSelection(item.label);
    setInput((current) => current.trim() ? `${current.trim()}\n\n${item.insert}` : item.insert);
    closeAttachMenu();
    onNotice?.(`${kind === "context" ? "已引用" : "已加入技能"}：${item.label}`);
    requestAnimationFrame(autoGrow);
  }, [autoGrow, closeAttachMenu, onNotice]);

  // ── 工坊开放插件宿主接口与生命周期广播 ──
  // 注意：这里刻意不暴露 getMessages —— 整段对话不该交给任意插件读取（任务书安全要求 b）。
  useEffect(() => {
    const runtime = {
      version: "2.0.0",
      getContainer: () => bodyRef.current,
      getActiveSessionId: () => snapshot.activeSessionId,
      scrollToBottom: (smooth = true) => {
        const target = bodyRef.current;
        if (!target) return;
        stickToBottomRef.current = true;
        if (smooth) target.scrollTo({ top: target.scrollHeight, behavior: "smooth" });
        else target.scrollTop = target.scrollHeight;
      },
      carryOverSession: async (targetSessionId?: string) => {
        const targetId = targetSessionId || snapshot.activeSessionId;
        if (!targetId) return null;
        return carryOverQaSession(targetId);
      },
    };

    (window as unknown as { __WORKSHOP_RUNTIME__?: typeof runtime }).__WORKSHOP_RUNTIME__ = runtime;
    window.dispatchEvent(new CustomEvent("workshop:open", { detail: runtime }));

    return () => {
      window.dispatchEvent(new CustomEvent("workshop:close"));
      delete (window as unknown as { __WORKSHOP_RUNTIME__?: typeof runtime }).__WORKSHOP_RUNTIME__;
    };
  }, [snapshot.activeSessionId, messages]);

  // 内置插件（默认开启）：首次进入工坊时装进插件系统；被卸载后不自动重装
  useEffect(() => {
    void ensureBuiltinWorkshopOutlinePlugin();
  }, []);

  const [rounds, setRounds] = useState<{ roundNum: number; title: string; id: string }[]>([]);
  const [activeRoundNum, setActiveRoundNum] = useState(1);

  // 提取大纲计算逻辑
  useEffect(() => {
    if (!messages.length) {
      setRounds([]);
      return;
    }
    const computedRounds: { roundNum: number; title: string; id: string }[] = [];
    let currentRound: { roundNum: number; title: string; id: string } | null = null;
    messages.forEach((msg) => {
      if (msg.role === "user") {
        if (currentRound) computedRounds.push(currentRound);
        currentRound = {
          roundNum: computedRounds.length + 1,
          title: msg.content.replace(/\s+/g, " ").trim() || `第 ${computedRounds.length + 1} 轮提问`,
          id: msg.id,
        };
      } else if (msg.role === "assistant" && !currentRound) {
        currentRound = {
          roundNum: computedRounds.length + 1,
          title: `第 ${computedRounds.length + 1} 轮对话`,
          id: msg.id,
        };
      }
    });
    if (currentRound) computedRounds.push(currentRound);
    setRounds(computedRounds);
  }, [messages]);

  // 滚动时更新激活轮次
  const handleScrollUpdateOutline = useCallback(() => {
    const body = bodyRef.current;
    if (!body || !rounds.length) return;
    const effectiveTop = body.getBoundingClientRect().top + 80;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight <= 80;
    if (atBottom) {
      setActiveRoundNum(rounds.length);
      return;
    }
    for (let i = 0; i < rounds.length; i++) {
      const target = body.querySelector(`[data-msg-id="${rounds[i].id}"]`);
      if (target) {
        const b = target.getBoundingClientRect();
        if (b.bottom >= effectiveTop) {
          setActiveRoundNum(rounds[i].roundNum);
          break;
        }
      }
    }
  }, [rounds]);

  // 自动滚动：用户上滚阅读时不拉回底部
  const handleScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    handleScrollUpdateOutline();
  }, [handleScrollUpdateOutline]);

  const scrollToMsg = useCallback((msgId: string) => {
    const body = bodyRef.current;
    const target = body?.querySelector(`[data-msg-id="${msgId}"]`) as HTMLElement;
    if (body && target) {
      const effectiveTop = body.getBoundingClientRect().top + 80;
      const relativeTop = target.getBoundingClientRect().top - body.getBoundingClientRect().top;
      body.scrollTo({ top: Math.max(0, body.scrollTop + relativeTop - 80), behavior: "smooth" });
      target.classList.remove("qa-highlight-anchor");
      void target.offsetWidth;
      target.classList.add("qa-highlight-anchor");
      setTimeout(() => target.classList.remove("qa-highlight-anchor"), 1500);
    }
  }, []);

  const handleCarryOverSession = useCallback(async (targetSessionId?: string) => {
    const targetId = typeof targetSessionId === "string" && targetSessionId ? targetSessionId : snapshot.activeSessionId;
    if (!targetId) return;
    if (snapshot.isGenerating || snapshot.isCompacting) {
      onNotice?.("克克正在执行任务或整理上下文，完成后再结转。");
      return;
    }
    setCarryingSessionId(targetId);
    try {
      const newId = await carryOverQaSession(targetId);
      if (newId) {
        onNotice?.("已提取记忆并转结到新会话！Token 空间已重置。");
        setDrawerOpen(false);
      } else {
        onNotice?.("所选会话暂无内容或结转失败。");
      }
    } finally {
      setCarryingSessionId(null);
    }
  }, [snapshot.activeSessionId, snapshot.isGenerating, snapshot.isCompacting, onNotice]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if ((!text && pendingImages.length === 0 && pendingFiles.length === 0) || snapshot.isGenerating || snapshot.isCompacting) return;
    setInput("");
    const images = pendingImages;
    const files = pendingFiles;
    setPendingImages([]);
    setPendingFiles([]);
    setAttachMenuOpen(false);
    setAttachMenuView("root");
    stickToBottomRef.current = true;
    requestAnimationFrame(autoGrow);
    void sendQaMessage(text, images.length ? images : undefined, files.length ? files : undefined);
  }, [input, pendingImages, pendingFiles, snapshot.isGenerating, snapshot.isCompacting, autoGrow]);

  // 附加图片：仅识图已开启的 API 显示入口；读为 dataURL，单张限 4MB
  const handlePickImages = useCallback((files: FileList | null, target: "composer" | "edit") => {
    if (!files?.length) return;
    const setter = target === "edit" ? setEditImages : setPendingImages;
    for (const file of Array.from(files).slice(0, 6)) {
      if (file.size > 4 * 1024 * 1024) {
        onNotice?.(`「${file.name}」超过 4MB，已跳过。`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = typeof reader.result === "string" ? reader.result : "";
        if (url) setter((current) => (current.length >= 6 ? current : [...current, url]));
      };
      // 读不出时给出提示：WebView 壳拿不到文件内容时 onload 不会触发，
      // 不接 onerror 就是「选完没有任何反应」，用户无从判断
      reader.onerror = () => onNotice?.(`「${file.name}」读取失败，换一张图片试试。`);
      reader.readAsDataURL(file);
    }
  }, [onNotice]);

  const handlePickTextFiles = useCallback((files: FileList | null, target: "composer" | "edit") => {
    if (!files?.length) return;
    const setter = target === "edit" ? setEditFiles : setPendingFiles;
    // 修改为支持更多文件类型（目前仍按纯文本读取，后续可接入 PDF/DOCX 等专用提取器）
    // 已放开扩展名排斥
    for (const file of Array.from(files).slice(0, QA_TEXT_ATTACHMENTS_MAX_COUNT)) {
      if (file.size > QA_TEXT_ATTACHMENT_MAX_BYTES) {
        onNotice?.(`「${file.name}」超过 ${(QA_TEXT_ATTACHMENT_MAX_BYTES / (1024 * 1024)).toFixed(1)}MB，已跳过。`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === "string" ? reader.result : "";
        setter((current) => {
          if (current.length >= QA_TEXT_ATTACHMENTS_MAX_COUNT) return current;
          // 移除同名检查
          const next = [...current, { name: file.name, content, size: file.size, mimeType: file.type }];
          const totalChars = next.reduce((sum, candidate) => sum + candidate.name.length + candidate.content.length, 0);
          if (totalChars > QA_TEXT_ATTACHMENTS_MAX_CHARS) {
            onNotice?.(`附件文本合计不能超过 ${Math.floor(QA_TEXT_ATTACHMENTS_MAX_CHARS / 1000)}K 字符。`);
            return current;
          }
          return next;
        });
      };
      reader.onerror = () => onNotice?.(`「${file.name}」读取失败，可能不是纯文本文件。`);
      reader.readAsText(file);
    }
  }, [onNotice]);

  const handleRetry = useCallback((assistantMsgId: string) => {
    stickToBottomRef.current = true;
    void retryQaMessage(assistantMsgId);
  }, []);

  const handleCopyMessage = useCallback((content: string) => {
    void navigator.clipboard?.writeText(content).then(
      () => onNotice?.("已复制原始内容"),
      () => onNotice?.("复制失败"),
    );
  }, [onNotice]);

  const handleEditMessage = useCallback((msg: QaMsg) => {
    setEditingMsg(msg);
    setEditText(msg.content);
    setEditImages(msg.images ?? []);
    setEditFiles(msg.files ?? []);
    setEditAttachMenuOpen(false);
    setEditCommitDecision(null);
  }, []);

  const handleSaveEdit = useCallback(async (andResend: boolean) => {
    if (!editingMsg || !snapshot.activeSessionId) return;
    const result = andResend
      ? await editAndResendQaMessage(
          snapshot.activeSessionId,
          editingMsg.id,
          editText,
          editImages.length ? editImages : undefined,
          editFiles.length ? editFiles : undefined,
          // 撤销/保留由用户在编辑框里明确选择；没选时不会走到这里（按钮已禁用）
          { commitDecision: editCommitDecision ?? undefined },
        )
      : updateQaMessageContent(
          snapshot.activeSessionId,
          editingMsg.id,
          editText,
          editingMsg.role === "user" && editImages.length ? editImages : undefined,
          editingMsg.role === "user" && editFiles.length ? editFiles : undefined,
        );
    if (!result.ok) {
      onNotice?.(result.reason);
      return;
    }
    setEditingMsg(null);
    if (andResend && editCommitDecision === "revert") onNotice?.("已撤销相关提交并重新发送");
    else onNotice?.(andResend ? "已修改并重新发送" : "已保存消息内容");
  }, [editingMsg, editText, editImages, editFiles, editCommitDecision, snapshot.activeSessionId, onNotice]);

  const editResendBlockReason = editingMsg?.role === "user" && snapshot.activeSessionId
    ? getQaEditAndResendBlockReason(snapshot.activeSessionId, editingMsg.id)
    : null;
  // 重发会截断的回复里，有几个已提交到仓库的改动（界面据此弹"撤销还是保留"）
  const editAppliedCommitCount = editingMsg?.role === "user" && snapshot.activeSessionId
    ? countQaEditResendAppliedCommits(snapshot.activeSessionId, editingMsg.id)
    : 0;
  const editCommitAskPending = editingMsg?.role === "user" && editAppliedCommitCount > 0 && editCommitDecision == null;
  const editIsEmpty = !editText.trim() && editImages.length === 0 && editFiles.length === 0;

  const streamingMsgId =
    snapshot.isGenerating && messages.length > 0 && messages[messages.length - 1].role === "assistant"
      ? messages[messages.length - 1].id
      : null;

  return (
    <div className="qa-app-shell">
      <QaSessionDrawer
        sessions={snapshot.sessions}
        activeId={snapshot.activeSessionId}
        carryingId={carryingSessionId}
        onSelect={(id) => {
          switchQaSession(id);
          setDrawerOpen(false);
        }}
        onDelete={deleteQaSession}
        onCreate={() => {
          createQaSession();
          setDrawerOpen(false);
        }}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setDrawerOpen(false);
        }}
        onOpenApiLog={() => {
          setApiLogOpen(true);
          setDrawerOpen(false);
        }}
        onClearTools={() => {
          setDrawerOpen(false);
          handleClearToolHistory();
        }}
        onRenameRequest={(id, title) => {
          setRenameTarget({ id, title });
          setRenameTitle(title);
        }}
        onCarryOver={handleCarryOverSession}
      />
      <div className={`qa-stage ${drawerOpen ? "is-pushed" : ""}`}>
      <div className="qa-ambient" aria-hidden />
      {(carryingSessionId || snapshot.isCompacting) && (
        <div className="qa-global-carrying-bar" role="status">
          <div className="qa-global-carrying-progress" />
          <Loader2 size={13} className="qa-spin" />
          <span>正在提炼并结转会话记忆…</span>
        </div>
      )}
      <header className="qa-header">
        <div className="qa-header-left qa-header-control-group">
          <button type="button" className="qa-icon-btn qa-header-back" onClick={onClose} aria-label="返回">
            <ChevronLeft size={22} strokeWidth={1.75} />
          </button>
          <span className="qa-header-divider" aria-hidden />
          <button type="button" className="qa-icon-btn" onClick={() => setDrawerOpen((v) => !v)} aria-label="打开 Claude 侧栏">
            <Menu size={18} strokeWidth={1.85} />
          </button>
        </div>
        <div className="qa-header-center">
          <span className="qa-header-title">Claude</span>
          <span className="qa-header-sub">{modelName || "AI 工作台"}</span>
        </div>
        <div className="qa-header-right qa-header-control-group">
          <button type="button" className="qa-icon-btn" onClick={() => setTaskSheetOpen(true)} aria-label="任务状态" title="任务状态：检查、构建与 PR">
            <ListChecks size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="qa-body hide-scrollbar" ref={bodyRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="qa-welcome">
            <div className="qa-welcome-badge" aria-hidden>
              <QaWorkshopMark />
            </div>
            <div className="qa-welcome-title">你好，{userName}</div>
            {!apiReady && (
              <div className="qa-welcome-warn">还没有可用的 API：请先到「设置 → API 设置」添加 LLM API。</div>
            )}
          </div>
        ) : (
          <div className="qa-messages">
            {messages.map((msg) => (
              <QaMessageItem key={msg.id} msg={msg} isStreaming={msg.id === streamingMsgId} onRetry={handleRetry} onViewImage={setViewerImage} onCopy={handleCopyMessage} onEdit={handleEditMessage} />
            ))}
          </div>
        )}
      </div>

      <footer className="qa-composer-wrap">
        <div className={`qa-composer ${snapshot.isGenerating ? "is-generating" : ""}`}>
          {pendingImages.length > 0 && (
            <div className="qa-attach-strip">
              {pendingImages.map((url, i) => (
                <div key={i} className="qa-attach-thumb">
                  <button type="button" className="qa-attach-view" onClick={() => setViewerImage(url)} aria-label="查看图片">
                    <img src={url} alt="" />
                  </button>
                  <button
                    type="button"
                    className="qa-attach-remove"
                    onClick={() => setPendingImages((current) => current.filter((_, idx) => idx !== i))}
                    aria-label="移除图片"
                  >
                    <X size={11} strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {pendingFiles.length > 0 && (
            <div className="qa-file-strip">
              {pendingFiles.map((file) => (
                <span className="qa-file-chip is-removable" key={file.name} title={file.name}>
                  <FileText size={13} />
                  <span>{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((current) => current.filter((candidate) => candidate.name !== file.name))}
                    aria-label={`移除附件 ${file.name}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="qa-composer-context" aria-label="当前工作环境">
            <span className="qa-context-pill qa-context-pill-env">
              <span className="qa-context-dot" aria-hidden />
              本机工作区
            </span>
            <button type="button" className={`qa-context-pill qa-context-pill-repo ${repoConnected ? "is-connected" : ""}`} onClick={() => setRepoSheetOpen(true)}>
              <Github size={13} strokeWidth={1.8} />
              {repoConnected ? repoLabel : "连接仓库"}
            </button>
            {workshopSelection && (
              <button
                type="button"
                className="qa-context-pill qa-context-pill-workshop"
                onClick={() => setWorkshopSelection(null)}
                title="清除当前 Claude 入口"
              >
                <Sparkles size={12} strokeWidth={1.9} />
                {workshopSelection}
                <X size={11} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="qa-composer-input hide-scrollbar"
            placeholder="输入你的问题…"
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
          />
          <div className="qa-composer-toolbar">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.html,.css"
              multiple
              hidden
              onChange={(event) => {
                handlePickTextFiles(event.target.files, "composer");
                event.currentTarget.value = "";
              }}
            />
            {visionEnabled && (
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  handlePickImages(event.target.files, "composer");
                  event.currentTarget.value = "";
                }}
              />
            )}
            <div className="qa-attach-menu-wrap">
              <button
                type="button"
                className="qa-circle-btn qa-attach-btn"
                onClick={() => {
                  setAttachMenuOpen((open) => !open);
                  setAttachMenuView("root");
                }}
                aria-label="添加附件或图片"
                aria-expanded={attachMenuOpen}
              >
                <Plus size={17} strokeWidth={2.2} />
              </button>
              {attachMenuOpen && (
                <div className={`qa-attach-menu ${attachMenuView !== "root" ? "is-submenu" : ""}`}>
                  {attachMenuView === "root" ? (
                    <>
                      <button type="button" onClick={() => { fileInputRef.current?.click(); closeAttachMenu(); }}>
                        <Paperclip size={15} />
                        上传附件
                      </button>
                      {visionEnabled && (
                        <button type="button" onClick={() => { imageInputRef.current?.click(); closeAttachMenu(); }}>
                          <ImageIcon size={15} />
                          添加图片
                        </button>
                      )}
                      <div className="qa-attach-divider" />
                      <button type="button" className="qa-attach-nav" onClick={() => setAttachMenuView("context")}>
                        <FileText size={15} />
                        <span>引用本机内容</span>
                        <span className="qa-attach-count">{WORKSHOP_CONTEXT_ITEMS.length}</span>
                        <ChevronRight size={14} className="qa-attach-chevron" aria-hidden />
                      </button>
                      <button type="button" className="qa-attach-nav" onClick={() => setAttachMenuView("skills")}>
                        <Sparkles size={15} />
                        <span>技能</span>
                        <span className="qa-attach-count">{WORKSHOP_SKILL_ITEMS.length}</span>
                        <ChevronRight size={14} className="qa-attach-chevron" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="qa-attach-back" onClick={() => setAttachMenuView("root")}>
                        <ChevronLeft size={15} />
                        {attachMenuView === "context" ? "引用本机内容" : "技能"}
                      </button>
                      {(attachMenuView === "context" ? WORKSHOP_CONTEXT_ITEMS : WORKSHOP_SKILL_ITEMS).map((item) => (
                        <button
                          type="button"
                          className="qa-workshop-item"
                          key={`${attachMenuView}-${item.label}`}
                          onClick={() => chooseWorkshopItem(item, attachMenuView === "context" ? "context" : "skill")}
                        >
                          <span className="qa-workshop-item-icon" aria-hidden>
                            {attachMenuView === "context" ? <FileText size={14} /> : <Sparkles size={14} />}
                          </span>
                          <span className="qa-workshop-item-copy">
                            <span>{item.label}</span>
                            {item.hint && <small>{item.hint}</small>}
                          </span>
                          {item.dot && <i className="qa-workshop-item-dot" aria-label="新" />}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            {modelName && (
              <button
                type="button"
                className="qa-model-pill"
                title="当前模型（模型配置请在 Claude 配置中修改）"
                onClick={() => setSettingsOpen(true)}
              >
                {modelName}
              </button>
            )}

            {repoWritable && (
              <button type="button" className="qa-mode-pill" onClick={toggleWriteMode}>
                {writeMode === "auto" ? "全自动" : "确认后提交"}
              </button>
            )}

            <div className="qa-composer-spacer" />

            {createdContent.length > 0 && (
              <button
                type="button"
                className="qa-circle-btn qa-preview-btn"
                onClick={() => setPreviewOpen(true)}
                aria-label="预览本轮创建的内容"
              >
                <Play size={16} />
              </button>
            )}

            {snapshot.isGenerating ? (
              <button type="button" className="qa-circle-btn qa-send-btn is-stop" onClick={stopQaGeneration} aria-label="停止生成">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                className="qa-circle-btn qa-send-btn"
                onClick={handleSend}
                disabled={(!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || snapshot.isCompacting}
                aria-label={snapshot.isCompacting ? "正在整理上下文" : "发送"}
              >
                <ArrowUp size={20} strokeWidth={2.4} />
              </button>
            )}
          </div>
          <div
            className={`qa-context-meter ${snapshot.isCompacting ? "is-compacting" : ""}`}
            title="上下文用量：满 100% 时自动压缩成摘要并从头累计"
          >
            <div className="qa-context-meter-track" aria-hidden>
              <i style={{ width: `${Math.min(100, Math.round(snapshot.contextUsage * 100))}%` }} />
            </div>
            <span className="qa-context-meter-label">
              {snapshot.isCompacting ? "压缩中" : `${Math.min(999, Math.round(snapshot.contextUsage * 100))}%`}
            </span>
          </div>

          {/* 胶囊大纲入口 */}
          {rounds.length > 0 && (
            <div className={`qa-outline-capsule ${!stickToBottomRef.current ? "is-visible" : ""}`}>
              <button 
                type="button" 
                className="qa-outline-toggle" 
                onClick={() => setOutlineOpen(v => !v)}
              >
                <div className="qa-outline-icon-badge">
                  <List size={10} strokeWidth={2.6} />
                </div>
                <span>{activeRoundNum}/{rounds.length} 轮</span>
              </button>
              <div className="qa-outline-divider" />
              <button 
                type="button" 
                className="qa-outline-direct" 
                onClick={() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" })}
              >
                <ArrowDown size={12} strokeWidth={2.6} />
              </button>
            </div>
          )}

          {/* 大纲弹窗 */}
          {outlineOpen && (
            <div className="qa-outline-modal">
              <div className="qa-outline-header">
                <span>Claude 对话大纲</span>
                <button 
                  type="button" 
                  className={`qa-outline-carry ${carryingSessionId ? "is-loading" : ""}`}
                  onClick={() => handleCarryOverSession()}
                  disabled={Boolean(carryingSessionId)}
                >
                  {carryingSessionId ? (
                    <>
                      <div className="qa-outline-progress" />
                      <span style={{ position: "relative", zIndex: 1 }}>⚡ 正在结转...</span>
                    </>
                  ) : (
                    "⚡ 结转新会话"
                  )}
                </button>
              </div>
              <div className="qa-outline-list hide-scrollbar">
                {rounds.map(r => (
                  <button 
                    key={r.id} 
                    type="button" 
                    className={`qa-outline-item ${r.roundNum === activeRoundNum ? "is-active" : ""}`}
                    onClick={() => {
                      scrollToMsg(r.id);
                      setOutlineOpen(false);
                    }}
                  >
                    <span className="qa-outline-num">{r.roundNum}</span>
                    <span className="qa-outline-text">{r.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </footer>

      {drawerOpen && (
        <button
          type="button"
          className="qa-stage-scrim"
          aria-label="关闭对话列表"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      </div>

      {renameTarget && (
        <div className="qa-rename-backdrop" role="presentation" onClick={() => setRenameTarget(null)}>
          <form
            className="qa-rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qa-rename-dialog-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const title = renameTitle.trim();
              if (!title) return;
              renameQaSession(renameTarget.id, title);
              setRenameTarget(null);
            }}
          >
            <div id="qa-rename-dialog-title" className="qa-rename-title">重命名对话</div>
            <input
              className="qa-rename-input"
              autoFocus
              value={renameTitle}
              maxLength={80}
              aria-label="新对话名称"
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setRenameTarget(null); }}
            />
            <div className="qa-rename-actions">
              <button type="button" className="qa-rename-cancel" onClick={() => setRenameTarget(null)}>取消</button>
              <button type="submit" className="qa-drawer-new qa-rename-confirm" disabled={!renameTitle.trim()}>确认</button>
            </div>
          </form>
        </div>
      )}

      {clearToolsOpen && (
        <div className="qa-devnotice-backdrop" onClick={() => setClearToolsOpen(false)}>
          <div className="qa-devnotice" role="alertdialog" aria-label="清理工具历史确认" onClick={(e) => e.stopPropagation()}>
            <div className="qa-devnotice-title">清理工具调用历史？</div>
            <div className="qa-devnotice-text">
              将移除本会话上下文中的工具调用与工具结果记录，用于修复原生工具协议的报错。普通对话内容不会删除，之前的工具结论仍保留在克克的回复文字里。
            </div>
            <div className="qa-devnotice-actions is-row">
              <button type="button" className="qa-devnotice-btn" onClick={() => setClearToolsOpen(false)}>
                取消
              </button>
              <button type="button" className="qa-devnotice-btn is-primary" onClick={confirmClearToolHistory}>
                清理
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerImage && (
        <div className="qa-image-viewer" role="presentation" onClick={() => setViewerImage(null)}>
          <img src={viewerImage} alt="" />
          <button type="button" className="qa-image-viewer-close" aria-label="关闭" onClick={() => setViewerImage(null)}>
            <X size={20} />
          </button>
        </div>
      )}

      {editingMsg && (
        <div className="qa-edit-backdrop" onClick={() => setEditingMsg(null)}>
          <div className="qa-edit-dialog" role="dialog" aria-label="修改消息" onClick={(e) => e.stopPropagation()}>
            <div className="qa-edit-head">
              <span className="qa-edit-title">修改消息（原始内容）</span>
              <button type="button" className="qa-icon-btn" onClick={() => setEditingMsg(null)} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
            <textarea
              className="qa-edit-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              spellCheck={false}
              autoFocus
              aria-label="消息原始内容"
              placeholder="这里显示的是消息的原始内容，不会被前端渲染，可放心查看特殊标签。"
            />
            {editingMsg.role === "user" && editImages.length > 0 && (
              <div className="qa-attach-strip">
                {editImages.map((url, index) => (
                  <div className="qa-attach-thumb" key={index}>
                    <button type="button" className="qa-attach-view" onClick={() => setViewerImage(url)} aria-label="查看图片">
                      <img src={url} alt="" />
                    </button>
                    <button
                      type="button"
                      className="qa-attach-remove"
                      onClick={() => setEditImages((current) => current.filter((_, candidateIndex) => candidateIndex !== index))}
                      aria-label="移除图片"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {editingMsg.role === "user" && editFiles.length > 0 && (
              <div className="qa-file-strip">
                {editFiles.map((file) => (
                  <span className="qa-file-chip is-removable" key={file.name} title={file.name}>
                    <FileText size={13} />
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditFiles((current) => current.filter((candidate) => candidate.name !== file.name))}
                      aria-label={`移除附件 ${file.name}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {editingMsg.role === "user" && (
              <div className="qa-edit-attachment-row">
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="*"
                  multiple
                  hidden
                  onChange={(event) => {
                    handlePickTextFiles(event.target.files, "edit");
                    event.currentTarget.value = "";
                  }}
                />
                {visionEnabled && (
                  <input
                    ref={editImageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      handlePickImages(event.target.files, "edit");
                      event.currentTarget.value = "";
                    }}
                  />
                )}
                <div className="qa-attach-menu-wrap">
                  <button
                    type="button"
                    className="qa-circle-btn qa-attach-btn"
                    onClick={() => setEditAttachMenuOpen((open) => !open)}
                    aria-label="添加附件或图片"
                    aria-expanded={editAttachMenuOpen}
                  >
                    <Plus size={17} />
                  </button>
                  {editAttachMenuOpen && (
                    <div className="qa-attach-menu is-edit">
                      <button type="button" onClick={() => { editFileInputRef.current?.click(); setEditAttachMenuOpen(false); }}>
                        <Paperclip size={15} />
                        上传附件
                      </button>
                      {visionEnabled && (
                        <button type="button" onClick={() => { editImageInputRef.current?.click(); setEditAttachMenuOpen(false); }}>
                          <ImageIcon size={15} />
                          添加图片
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {editingMsg.role === "user" && editResendBlockReason && (
              <div className="qa-edit-warning" role="status">{editResendBlockReason}</div>
            )}
            {editingMsg.role === "user" && !editResendBlockReason && (
              <div className="qa-edit-hint">保存并发送会删除这条消息及其后续回复，再根据修改后的内容重新生成。</div>
            )}
            {editingMsg.role === "user" && !editResendBlockReason && editAppliedCommitCount > 0 && (
              <div className="qa-edit-commit-ask">
                <span role="status">这条消息之后有 {editAppliedCommitCount} 个已提交到仓库的改动，要一起撤销吗？</span>
                <span className="qa-edit-commit-choices">
                  <button
                    type="button"
                    className={editCommitDecision === "revert" ? "is-on" : ""}
                    onClick={() => setEditCommitDecision("revert")}
                  >
                    撤销
                  </button>
                  <button
                    type="button"
                    className={editCommitDecision === "keep" ? "is-on" : ""}
                    onClick={() => setEditCommitDecision("keep")}
                  >
                    保留
                  </button>
                </span>
              </div>
            )}
            <div className="qa-edit-actions">
              <button type="button" className="qa-devnotice-btn" onClick={() => setEditingMsg(null)}>
                取消
              </button>
              <button
                type="button"
                className={`qa-devnotice-btn ${editingMsg.role === "assistant" ? "is-primary" : ""}`}
                onClick={() => handleSaveEdit(false)}
                disabled={editIsEmpty || snapshot.isGenerating || snapshot.isCompacting}
              >
                保存
              </button>
              {editingMsg.role === "user" && (
                <button
                  type="button"
                  className="qa-devnotice-btn is-primary"
                  onClick={() => handleSaveEdit(true)}
                  disabled={editIsEmpty || Boolean(editResendBlockReason) || editCommitAskPending || snapshot.isGenerating || snapshot.isCompacting}
                >
                  保存并发送
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <QaSettingsSheet onClose={() => setSettingsOpen(false)} onNotice={onNotice} />
      )}

      {apiLogOpen && (
        <QaApiLogSheet onClose={() => setApiLogOpen(false)} onNotice={onNotice} />
      )}

      {repoSheetOpen && (
        <QaRepoSheet onClose={() => setRepoSheetOpen(false)} onSaved={refreshComposerMeta} />
      )}
      {taskSheetOpen && (
        <QaTaskStatusSheet
          onClose={() => setTaskSheetOpen(false)}
          onConnectRepo={() => { setTaskSheetOpen(false); setRepoSheetOpen(true); }}
        />
      )}

      {previewOpen && !previewItem && (
        <div className="qa-sheet-backdrop" onClick={() => setPreviewOpen(false)}>
          <div className="qa-sheet qa-preview-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="qa-sheet-head">
              <span className="qa-sheet-title">
                <Play size={16} /> 预览本轮创建
              </span>
              <button type="button" className="qa-icon-btn" onClick={() => setPreviewOpen(false)} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="qa-sheet-body">
              <p className="qa-sheet-note">本次对话里创建/更新的内容，点开直接测试，返回后回到聊天。</p>
              {createdContent.map((item) => (
                <button
                  key={`${item.type}-${item.refId}`}
                  type="button"
                  className="qa-preview-item"
                  onClick={() => setPreviewItem(item)}
                >
                  {item.type === "app" ? <AppWindow size={17} /> : item.type === "game" ? <Gamepad2 size={17} /> : <Drama size={17} />}
                  <span className="qa-preview-item-title">{item.title}</span>
                  <span className="qa-preview-item-type">
                    {item.type === "app" ? "应用" : item.type === "game" ? "游戏" : "剧场"}
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewItem && (
        <div className="qa-preview-runtime">
          {previewItem.type === "app" ? (
            previewApp ? (
              <CustomAppForegroundBoundary
                key={previewApp.id}
                appName={previewApp.name}
                appId={previewApp.id}
                appVersion={previewApp.version}
                manifestId={previewApp.manifest?.id}
                closeLabel="返回"
                onClose={() => setPreviewItem(null)}
              >
                <CustomAppRunner app={previewApp} onClose={() => setPreviewItem(null)} />
              </CustomAppForegroundBoundary>
            ) : (
              <div className="qa-preview-missing">
                <p>这个应用已被卸载或找不到了。</p>
                <button type="button" className="qa-sheet-btn is-primary" onClick={() => setPreviewItem(null)}>
                  返回
                </button>
              </div>
            )
          ) : previewItem.type === "game" ? (
            <GameHubApp onClose={() => setPreviewItem(null)} autoOpenLocalId={previewItem.refId} />
          ) : (
            <BlackMarketApp onClose={() => setPreviewItem(null)} autoOpenLocalId={previewItem.refId} />
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   工坊调用记录面板：右上角「调用记录」按钮进入，
   只展示工坊自己的 LLM 调用（与聊天页底层日志完全独立）。
   ══════════════════════════════════════════ */
function QaApiLogSheet({ onClose, onNotice }: { onClose: () => void; onNotice?: (msg: string) => void }) {
  const [logs, setLogs] = useState<DebugInfo[]>(() => [...getQaApiLogs()].reverse());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(() => setLogs([...getQaApiLogs()].reverse()), []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleClear = () => {
    clearQaApiLogs();
    setLogs([]);
    onNotice?.("已清空 Claude 调用记录");
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  return (
    <div className="qa-sheet-backdrop" onClick={onClose}>
      <div className="qa-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="qa-sheet-head">
          <span className="qa-sheet-title">
            <FileCode2 size={16} /> 调用记录
          </span>
          <div className="qa-sheet-head-actions">
            {logs.length > 0 && (
              <button type="button" className="qa-sheet-btn" onClick={handleClear}>
                <Trash2 size={14} /> 清空
              </button>
            )}
            <button type="button" className="qa-icon-btn" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="qa-sheet-body hide-scrollbar qa-log-body">
          {logs.length === 0 ? (
            <p className="qa-sheet-note">
              还没有 Claude 的 AI 调用记录。调用过模型后，这里会显示每次请求的 Prompt 与 AI 原始回复（含思维链），供排查用。
            </p>
          ) : (
            <>
              <p className="qa-sheet-note">
                Claude 每次调用大模型的记录，与聊天页「底层调用大模型日志」互相独立，互不混入。
              </p>
              <div className="qa-log-list">
                {logs.map((log) => {
                  const isOpen = expandedId === log.id;
                  return (
                    <div key={log.id} className="qa-log-item">
                      <button
                        type="button"
                        className="qa-log-item-head"
                        onClick={() => setExpandedId(isOpen ? null : log.id)}
                      >
                        <div className="qa-log-item-meta">
                          <span className="qa-log-item-time">{formatTime(log.timestamp)}</span>
                          <span className="qa-log-item-detail">
                            {log.model ? `Model: ${log.model}` : ""}
                            {log.model && log.messages.length ? " · " : ""}
                            {log.messages.length} 条消息
                            {log.usage ? ` · Tokens: ${log.usage.prompt_tokens ?? "—"} / ${log.usage.completion_tokens ?? "—"} / ${log.usage.total_tokens ?? "—"}` : ""}
                          </span>
                        </div>
                        <ChevronRight size={15} className={isOpen ? "qa-log-chevron-open" : ""} />
                      </button>
                      {isOpen && (
                        <div className="qa-log-item-body">
                          <div className="qa-log-label">Prompt（{log.messages.length} 条消息）</div>
                          {log.messages.map((m, i) => (
                            <div key={i} className="qa-log-entry" data-role={m.role}>
                              <div className="qa-log-entry-role">[{i}] {m.role}</div>
                              <div className="qa-log-entry-content">{m.content}</div>
                            </div>
                          ))}
                          {log.reasoning && (
                            <>
                              <div className="qa-log-label">思维链（Reasoning）</div>
                              <pre className="qa-log-response">{log.reasoning}</pre>
                            </>
                          )}
                          <div className="qa-log-label is-danger">AI 原始回复</div>
                          <pre className="qa-log-response">{log.rawResponse}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
