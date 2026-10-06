"use client";

/**
 * 工坊 Claude 风 · 第一批独立预览页
 *
 * 明确边界：
 * - 这只是界面预览：所有带「示例」标记的内容都是静态演示，未接入代理引擎。
 * - 正式工坊（桌面「工坊」入口）未做任何改动；本页通过独立路由 /workshop-preview 访问。
 * - 仓库 / API 状态读取的是真实本地配置（复用现有 qa-github / qa-agent-engine 逻辑），
 *   没有配置就如实显示空状态，不硬编码虚假模型或仓库。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkCjkFriendly from "remark-cjk-friendly";
import { ArrowUp, Check, ChevronRight, Copy, FileCode2, FileText, Loader2, Menu, MoreVertical, Paperclip, Settings, Square, Wrench, X, ChevronDown, Download, Play, CircleAlert } from "lucide-react";
import { resolveQaApiConfig } from "@/lib/qa-agent-engine";
import { loadQaGithubConfig } from "@/lib/qa-github";

/* ────────────────────────── 基础工具 ────────────────────────── */

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, []);
  return { copied, copy };
}

/* ───────────────────── Claude 标识（示意图形） ───────────────────── */

function ClaudeMark({ size = 28 }: { size?: number }) {
  // 简单的星形示意图形，不是官方 Logo 资产
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 3c1.2 6.8 4.9 10.5 11.7 11.7-6.8 1.2-10.5 4.9-11.7 11.7-1.2-6.8-4.9-10.5-11.7-11.7C11.1 13.5 14.8 9.8 16 3Z"
        fill="#d97757"
      />
      <path
        d="M24.5 21.5c.5 2.8 2 4.3 4.8 4.8-2.8.5-4.3 2-4.8 4.8-.5-2.8-2-4.3-4.8-4.8 2.8-.5 4.3-2 4.8-4.8Z"
        fill="#d97757"
        opacity=".55"
      />
    </svg>
  );
}

/* ────────────────────────── 代码块 ────────────────────────── */

function WcCodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="wc-codeblock">
      <div className="wc-codeblock-head">
        <span className="wc-codeblock-lang">{lang || "code"}</span>
        <button
          type="button"
          className="wc-codeblock-copy"
          onClick={() => copy(code)}
          aria-label="复制代码"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const WC_MARKDOWN = {
  pre({ children }: { children?: ReactNode }) {
    return <>{children}</>;
  },
  code(props: { className?: string; children?: ReactNode }) {
    const { className, children } = props;
    const isBlock = /language-/.test(className || "") || String(children ?? "").includes("\n");
    if (isBlock) return <WcCodeBlock code={String(children ?? "").replace(/\n$/, "")} lang={/language-(\w+)/.exec(className || "")?.[1]} />;
    return <code className="wc-inline-code">{children}</code>;
  },
  a({ href, children }: { href?: string; children?: ReactNode }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

/* ────────────────────────── 工具调用行 ────────────────────────── */

type SampleTool = {
  summary: string;
  detail?: string;
  result?: string;
  running?: boolean;
  fail?: boolean;
};

function WcToolRow({ tool }: { tool: SampleTool }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(tool.detail || tool.result);
  return (
    <div className={`wc-tool-row ${tool.running ? "is-running" : tool.fail ? "is-fail" : ""}`}>
      <button
        type="button"
        className="wc-tool-head"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={open}
      >
        {tool.running ? <Loader2 size={13} className="wc-spin" /> : tool.fail ? <CircleAlert size={13} /> : <Wrench size={13} />}
        <span className="wc-tool-summary">{tool.summary}</span>
        {hasDetail && <ChevronRight size={13} className={`wc-tool-chev ${open ? "is-open" : ""}`} />}
      </button>
      {open && hasDetail && (
        <div className="wc-tool-body">
          {tool.detail && (
            <>
              <div className="wc-tool-label">参数（示例）</div>
              <pre className="wc-tool-pre">{tool.detail}</pre>
            </>
          )}
          {tool.result && (
            <>
              <div className="wc-tool-label">结果（示例）</div>
              <pre className="wc-tool-pre">{tool.result}</pre>
            </>
          )}
          {tool.fail && (
            <button type="button" className="wc-tool-retry">重试</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────── 修改提案卡片（示例） ────────────────────── */

function WcProposalCard() {
  const [touched, setTouched] = useState(false);
  return (
    <div className="wc-prop-card">
      <div className="wc-prop-head">
        <span className="wc-prop-title">修改提案</span>
        <span className="wc-prop-branch">示例 · main · 2 个文件</span>
      </div>
      <div className="wc-prop-msg">更新 README 部署步骤表格并修正环境变量说明</div>
      <ul className="wc-prop-files">
        <li>README.md</li>
        <li>docs/deploy.md</li>
        <li className="is-del">− old-guide.txt（删除）</li>
      </ul>
      <div className="wc-prop-actions">
        <button
          type="button"
          className="wc-btn-primary"
          onClick={() => setTouched(true)}
        >
          应用
        </button>
        <button type="button" className="wc-btn-ghost" onClick={() => setTouched(true)}>
          取消
        </button>
        <span className="wc-prop-note">{touched ? "预览模式：正式接入后沿用现有确认逻辑" : "应用前需二次确认 · 不可逆操作有警示"}</span>
      </div>
    </div>
  );
}

/* ────────────────────── 附件 / 文件卡片（示例） ────────────────────── */

function WcFileCard({ name, meta, onOpen }: { name: string; meta: string; onOpen: () => void }) {
  return (
    <div className="wc-filecard">
      <div className="wc-filecard-icon"><FileText size={16} /></div>
      <div className="wc-filecard-info">
        <div className="wc-filecard-name">{name}</div>
        <div className="wc-filecard-meta">{meta} · 示例</div>
      </div>
      <button type="button" className="wc-filecard-open" onClick={onOpen} aria-label={`查看 ${name}`}>
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

/* ────────────────────── 消息渲染 ────────────────────── */

type SampleMsg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "tool"; tool: SampleTool }
  | { kind: "proposal" }
  | { kind: "filecard" };

function WcMessageItem({ msg, onOpenFile }: { msg: SampleMsg; onOpenFile: () => void }) {
  const { copy } = useCopy();
  if (msg.kind === "user") {
    return (
      <div className="wc-msg-user-row">
        <div className="wc-msg-user">{msg.text}</div>
      </div>
    );
  }
  if (msg.kind === "assistant") {
    return (
      <div className="wc-msg-ai">
        <div className="wc-msg-ai-head">
          <span className="wc-ai-mark"><ClaudeMark size={16} /></span>
          <span className="wc-ai-name">Claude</span>
          {msg.streaming && <span className="wc-ai-state">克克正在输出…</span>}
        </div>
        <div className="wc-msg-ai-body">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkCjkFriendly]} components={WC_MARKDOWN}>
            {msg.text}
          </ReactMarkdown>
          {msg.streaming && (
            <div className="wc-stream-row">
              <button type="button" className="wc-stop-btn" aria-label="停止生成">
                <Square size={12} />
                停止
              </button>
            </div>
          )}
        </div>
        {!msg.streaming && (
          <div className="wc-msg-actions">
            <button type="button" className="wc-msg-action" aria-label="复制" onClick={() => copy(msg.text)}>
              <Copy size={14} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    );
  }
  if (msg.kind === "tool") return <WcToolRow tool={msg.tool} />;
  if (msg.kind === "proposal") return <WcProposalCard />;
  return <WcFileCard name="部署笔记.md" meta="Markdown · 2.1 KB · 已读取" onOpen={onOpenFile} />;
}

/* ────────────────────── 示例会话内容 ────────────────────── */

const SAMPLE_SESSION: SampleMsg[] = [
  { kind: "user", text: "帮我把 README 里的部署步骤整理成表格，顺便检查下环境变量写对没有。" },
  { kind: "tool", tool: { summary: "读取文件 README.md", detail: "path: README.md\nrange: 全文", result: "共 274 行，包含「部署」小节 22 行。" } },
  { kind: "tool", tool: { summary: "搜索文档 docs/", detail: "query: 环境变量", result: "命中 2 处：docs/deploy.md、.env.example。" } },
  {
    kind: "assistant",
    text: `好的，我已经读完了 README 和相关文档。部署步骤整理如下：

## 部署步骤（示例内容）

| 步骤 | 操作 | 说明 |
| ---- | ---- | ---- |
| 1 | 安装依赖 | \`npm install\` |
| 2 | 配置环境变量 | 复制 \`.env.example\` 为 \`.env.local\` |
| 3 | 本地验证 | \`npm run dev\` 后打开 3000 端口 |
| 4 | 构建部署 | 推送 main 分支，Vercel 自动部署 |

**发现一个小问题**：README 里写的环境变量名是 \`API_KEY\`，但代码里实际读取的是 \`LLM_API_KEY\`，建议统一。

修正后的配置示例：

\`\`\`bash
# .env.local
LLM_API_KEY=sk-xxxx
\`\`\`

如果确认要改，我可以直接生成一份修改提案，你确认后再应用。`,
  },
  { kind: "proposal" },
  { kind: "filecard" },
  {
    kind: "assistant",
    text: `另外附上我整理好的部署笔记，可以直接预览或下载。

> 备注：以上为本预览页的**示例内容**，用于展示排版与组件效果，不代表真实工具执行。`,
    streaming: true,
  },
];

/* ────────────────────── 主预览组件 ────────────────────── */

type PreviewView = "welcome" | "session" | "states";

const SUGGESTIONS = [
  "怎么添加我的 API？",
  "聊天没有回复怎么排查？",
  "怎么部署到 Netlify / Vercel？",
  "数据存在哪里，怎么备份？",
];

export function WorkshopClaudePreview() {
  const [view, setView] = useState<PreviewView>("welcome");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewFileOpen, setPreviewFileOpen] = useState(false);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [modelName, setModelName] = useState("");
  const [repoName, setRepoName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 复用现有配置读取逻辑：显示真实连接信息，没有就显示真实空状态
    setApiReady(resolveQaApiConfig() != null);
    setModelName(resolveQaApiConfig()?.defaultModel ?? "");
    setRepoName(loadQaGithubConfig()?.repo ?? "");
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  const send = useCallback(() => {
    showToast("预览模式未接入引擎 · 正式接入后可发送");
  }, [showToast]);

  const openFile = useCallback(() => {
    setPreviewFileOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        setSettingsOpen(false);
        setPreviewFileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sampleSessions = useMemo(
    () => [
      { title: "部署表格整理（当前 · 示例）", time: "刚刚", active: true },
      { title: "修复白屏的依赖顺序问题", time: "09:12" },
      { title: "给工坊加附件上传", time: "昨天" },
      { title: "数据备份方案讨论", time: "周五" },
    ],
    [],
  );

  return (
    <div className="wc-root">
      {/* ── 顶栏 ── */}
      <header className="wc-topbar">
        <button type="button" className="wc-iconbtn" aria-label="打开菜单" onClick={() => setDrawerOpen(true)}>
          <Menu size={20} />
        </button>
        <div className="wc-topbar-title">
          工坊
          <span className="wc-badge-preview">预览 · 示例数据</span>
        </div>
        <button type="button" className="wc-iconbtn" aria-label="设置" onClick={() => setSettingsOpen(true)}>
          <Settings size={19} />
        </button>
      </header>

      {/* ── 视图切换（仅预览用） ── */}
      <nav className="wc-viewtabs" aria-label="预览视图切换">
        {([
          ["welcome", "欢迎页"],
          ["session", "会话页"],
          ["states", "状态页"],
        ] as [PreviewView, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`wc-viewtab ${view === key ? "is-active" : ""}`}
            onClick={() => {
              setView(key);
              bodyRef.current?.scrollTo({ top: 0 });
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── 内容区 ── */}
      <div className="wc-body" ref={bodyRef}>
        {view === "welcome" && (
          <div className="wc-welcome">
            <div className="wc-welcome-mark"><ClaudeMark size={44} /></div>
            <h1 className="wc-welcome-title">有什么问题？</h1>
            <p className="wc-welcome-sub">
              我是克克，可以帮你读仓库、改代码、整理文档。
              <br />
              下面是几个常见问题，点一下就能填进输入框。
            </p>
            <div className="wc-suggests">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="wc-suggest"
                  onClick={() => {
                    setInput(s);
                    textareaRef.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            {apiReady ? (
              <p className="wc-welcome-meta">
                已配置 API · 模型 {modelName || "（未命名）"}
              </p>
            ) : (
              <p className="wc-welcome-meta is-empty">
                还没有可用的 API：请先到「设置 → API 设置」添加 LLM API。
              </p>
            )}
          </div>
        )}

        {view === "session" && (
          <div className="wc-msglist" role="log" aria-label="示例会话">
            {SAMPLE_SESSION.map((m, i) => (
              <WcMessageItem key={i} msg={m} onOpenFile={openFile} />
            ))}
            <div className="wc-demo-note">
              以上为示例会话：工具行、提案、附件卡均可交互查看形态；「停止」为按钮状态演示，未连接引擎。
            </div>
          </div>
        )}

        {view === "states" && (
          <div className="wc-states">
            <section className="wc-state-block">
              <h2 className="wc-state-h">空状态（真实读取本地配置）</h2>
              <div className="wc-state-card">
                <div className="wc-state-card-title">仓库未连接</div>
                <p className="wc-state-text">当前设备没有已保存的 GitHub 配置。去「仓库配置」填入令牌后，这里会显示实际分支与权限。</p>
                <button type="button" className="wc-btn-ghost" onClick={() => setDrawerOpen(true)}>去配置</button>
              </div>
            </section>
            <section className="wc-state-block">
              <h2 className="wc-state-h">加载中（示例）</h2>
              <div className="wc-state-card">
                <Loader2 size={16} className="wc-spin" />
                <span className="wc-state-text">正在读取会话历史…</span>
              </div>
            </section>
            <section className="wc-state-block">
              <h2 className="wc-state-h">失败与重试（示例）</h2>
              <div className="wc-state-card is-error">
                <div className="wc-state-card-title">请求失败了</div>
                <p className="wc-state-text">网络断开或超时，已停止本次生成。收到的内容已保留，可直接重试。</p>
                <div className="wc-state-actions">
                  <button type="button" className="wc-btn-primary" onClick={() => showToast("预览模式：重试未接入引擎")}>重试</button>
                  <button type="button" className="wc-btn-ghost">取消</button>
                </div>
              </div>
            </section>
            <section className="wc-state-block">
              <h2 className="wc-state-h">完成态（示例）</h2>
              <div className="wc-state-card">
                <span className="wc-state-done">已回答 · 用时 12s</span>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ── 输入区附近的紧凑选择 + 输入容器 ── */}
      <div className="wc-composer">
        <div className="wc-composer-meta">
          <button type="button" className="wc-chip" onClick={() => showToast(apiReady ? `模型 ${modelName || "（未命名）"}（真实配置）` : "未配置 API（真实状态）")}>
            {apiReady ? `模型 ${modelName || "（未命名）"}` : "未配置 API"}
            <ChevronDown size={13} />
          </button>
          <button type="button" className="wc-chip" onClick={() => showToast(repoName ? `仓库 ${repoName}（真实配置）` : "未连接仓库（真实状态）")}>
            {repoName ? repoName : "未连接仓库"}
            <ChevronDown size={13} />
          </button>
        </div>
        <div className="wc-input-wrap">
          <button type="button" className="wc-input-btn" aria-label="添加附件" onClick={() => showToast("预览模式：附件入口已展示，未接入上传")}>
            <Paperclip size={17} />
          </button>
          <textarea
            ref={textareaRef}
            className="wc-textarea"
            placeholder="给克克发送消息…"
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            aria-label="消息输入框"
          />
          <button
            type="button"
            className={`wc-send-btn ${input.trim() ? "" : "is-disabled"}`}
            aria-label="发送消息"
            onClick={send}
          >
            <ArrowUp size={17} />
          </button>
        </div>
        <p className="wc-input-hint">克克也可能出错，请核实重要信息</p>
      </div>

      {/* ── 抽屉（手机侧边栏形态） ── */}
      {drawerOpen && (
        <div className="wc-overlay" onClick={() => setDrawerOpen(false)} role="presentation">
          <aside className="wc-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="工坊菜单">
            <div className="wc-drawer-head">
              <span className="wc-drawer-brand"><ClaudeMark size={18} /> 工坊</span>
              <button type="button" className="wc-iconbtn" aria-label="关闭菜单" onClick={() => setDrawerOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <button type="button" className="wc-new-session" onClick={() => { setView("welcome"); setDrawerOpen(false); }}>
              新会话
            </button>
            <div className="wc-history">
              <div className="wc-history-label">今天（示例）</div>
              {sampleSessions.map((s) => (
                <div key={s.title} className={`wc-history-item ${s.active ? "is-active" : ""}`}>
                  <span className="wc-history-title">{s.title}</span>
                  <span className="wc-history-time">{s.time}</span>
                </div>
              ))}
            </div>
            <div className="wc-drawer-menu">
              <button type="button" className="wc-drawer-menu-item" onClick={() => showToast("仓库配置：正式接入后沿用现有表单")}>
                <FileCode2 size={15} /> 仓库配置
              </button>
              <button type="button" className="wc-drawer-menu-item" onClick={() => showToast("云端电脑配置：正式接入后沿用现有能力")}>
                <Play size={15} /> 云端电脑配置
              </button>
              <button type="button" className="wc-drawer-menu-item" onClick={() => showToast("技能：第一批尚未配置，第三批接入")} aria-disabled="true">
                <Wrench size={15} /> 技能 <span className="wc-drawer-tag">尚未配置</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── 设置弹层（结构演示，保留现有配置能力说明） ── */}
      {settingsOpen && (
        <div className="wc-overlay" onClick={() => setSettingsOpen(false)} role="presentation">
          <div className="wc-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="设置">
            <div className="wc-sheet-head">
              <span>设置</span>
              <button type="button" className="wc-iconbtn" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="wc-sheet-body">
              <p className="wc-sheet-note">本页为界面预览；正式接入后沿用现有 API / 模型 / 密钥配置能力，数据结构不变。</p>
              <div className="wc-setting-row">
                <div className="wc-setting-name">API 设置</div>
                <div className="wc-setting-value">{apiReady ? "已配置（真实读取）" : "未配置（真实读取）"}</div>
              </div>
              <div className="wc-setting-row">
                <div className="wc-setting-name">默认模型</div>
                <div className="wc-setting-value">{modelName || "—"}</div>
              </div>
              <div className="wc-setting-row">
                <div className="wc-setting-name">GitHub 仓库</div>
                <div className="wc-setting-value">{repoName || "未连接"}</div>
              </div>
              <div className="wc-setting-row">
                <div className="wc-setting-name">上下文预算 / 轮次 / 输出上限</div>
                <div className="wc-setting-value">正式接入后沿用现有设置项</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 文件预览（全屏子页形态） ── */}
      {previewFileOpen && (
        <div className="wc-preview-page" role="dialog" aria-label="文件预览">
          <div className="wc-preview-head">
            <button type="button" className="wc-iconbtn" aria-label="返回" onClick={() => setPreviewFileOpen(false)}>
              <ChevronDown size={20} />
            </button>
            <span className="wc-preview-title">部署笔记.md · 示例</span>
            <div className="wc-preview-actions">
              <button type="button" className="wc-iconbtn" aria-label="下载（示例）" onClick={() => showToast("预览模式：下载为演示按钮")}>
                <Download size={18} />
              </button>
              <button type="button" className="wc-iconbtn" aria-label="关闭预览" onClick={() => setPreviewFileOpen(false)}>
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="wc-preview-body">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkCjkFriendly]} components={WC_MARKDOWN}>
              {`# 部署笔记（示例文件内容）

1. 安装依赖：\`npm install\`
2. 复制 \`.env.example\` 为 \`.env.local\`，填入 \`LLM_API_KEY\`
3. \`npm run dev\` 本地验证
4. 推送 main 分支，Vercel 自动部署

> 这是预览区形态演示：文件内容按文章方式阅读，代码块可横向滚动与复制。`}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* ── 轻提示 ── */}
      {toast && (
        <div className="wc-toast" role="status">
          <MoreVertical size={13} />
          {toast}
        </div>
      )}
    </div>
  );
}
