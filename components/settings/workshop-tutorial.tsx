"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, AlertCircle, RotateCcw, Timer } from "lucide-react";

import { getQaTools } from "@/lib/qa-agent-tools";
import {
    groupQaTools,
    inferQaToolKind,
    QA_TOOL_KIND_LABEL,
    QA_TOOL_DOCS,
    type QaToolKind,
} from "@/lib/qa-tool-docs";

/**
 * 整页「工坊使用教程」（任务 7）。
 *
 * 放在设置 → 工坊 → 使用教程里，不占工坊主页面。页面框架复用任务 3
 * 整页编辑器的类名（identity-editor-page：圆形返回钮 + 居中标题 + 小字英文，
 * fixed 覆盖层整页滑入滑出）。
 *
 * 内容规则（任务书）：工具的名字与说明从 getQaTools() 运行时读取生成，
 * 以后新增工具教程自动同步；手写的只有总结、上手步骤、胶囊/结转说明、常见问题。
 * 内容多，分组折叠，默认只开总结和上手。
 */

const QUICK_STEPS = [
    "打开 Claude（桌面里的「Claude」应用），在输入框直接用大白话说你想要什么。",
    "想做 APP / 小游戏 / 剧场：直接描述，比如「做一个贪吃蛇」。克克会自己读创作指南、写文件、发布安装，你回桌面就能看到。",
    "想修东西：说明哪里不对，比如「XX 应用打开是白的」。克克会先读源码找原因，再改，改完让你确认。",
    "想连 GitHub 仓库：点 Claude 里的「仓库」按钮，填 owner / repo（改代码需要 PAT）。之后克克能查代码、改代码、提 PR。",
    "聊久了觉得它开始「忘事」：点「结转新会话」，把记忆浓缩着带到新对话里继续。",
];

const FAQ_ITEMS = [
    {
        icon: AlertCircle,
        q: "出错了怎么办",
        a: "把报错原样发给克克，它可以用「环境体检」「读取」等工具自己排查。如果是它改坏了东西，直接说「撤回你刚才的改动」，本地改动重新生成一遍即可；仓库提交用下面的撤销方法。",
    },
    {
        icon: RotateCcw,
        q: "怎么撤销一次提交",
        a: "Claude 里每一次提交都有记录，可以在会话里找到那次提交的「撤销」按钮一键回退；确认模式下没点「应用」的提案根本不会提交，直接忽略就行。",
    },
    {
        icon: Timer,
        q: "超时怎么办",
        a: "一次请求默认最多等 30 分钟，超过会自动中断。慢模型可以到 Claude 应用内（侧栏底部「Claude 配置」→ 请求超时时间）调大；中断后点「回复继续」能接着来，已经写到一半的内容不会丢。",
    },
];

function CollapsibleSection({
    id,
    title,
    subtitle,
    defaultOpen = false,
    children,
}: {
    id: string;
    title: string;
    subtitle?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className="workshop-tut-section">
            <button type="button" className="workshop-tut-section-head" onClick={() => setOpen(value => !value)}>
                <span className="workshop-tut-section-titles">
                    <span className="workshop-tut-section-title">{title}</span>
                    {subtitle ? <span className="workshop-tut-section-subtitle">{subtitle}</span> : null}
                </span>
                <ChevronDown size={16} strokeWidth={2} className={`workshop-tut-chevron${open ? " is-open" : ""}`} />
            </button>
            {open ? <div className="workshop-tut-section-body">{children}</div> : null}
        </section>
    );
}

const KIND_BADGE_CLASS: Record<QaToolKind, string> = {
    read: "is-read",
    "write-local": "is-write",
    "write-repo": "is-write",
    "write-workspace": "is-write",
};

export function WorkshopTutorialPage({ onClose }: { onClose: () => void }) {
    // 运行时读当前可用工具：连了仓库 / 角色电脑后卡片会自动多出来
    const groups = useMemo(
        () => (typeof window === "undefined" ? [] : groupQaTools(getQaTools().map(tool => ({ name: tool.name, description: tool.description })))),
        []
    );
    const [closing, setClosing] = useState(false);

    const startClose = () => {
        setClosing(true);
        window.setTimeout(onClose, 290);
    };

    return (
        <div className={`identity-editor-page${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Claude 使用教程">
            <header className="identity-editor-header">
                <button type="button" onClick={startClose} className="identity-editor-back" aria-label="返回">
                    <ChevronLeft size={20} strokeWidth={2} />
                </button>
                <div className="identity-editor-titles">
                    <span className="identity-editor-title">Claude 使用教程</span>
                    <span className="identity-editor-subtitle">WORKSHOP GUIDE</span>
                </div>
                <span className="identity-editor-header-spacer" aria-hidden="true" />
            </header>

            <div className="identity-editor-body workshop-tut-body">
                {/* 总结 */}
                <section className="workshop-tut-section">
                    <p className="workshop-tut-section-title">Claude 是什么</p>
                    <div className="workshop-tut-prose">
                        <p>
                            Claude 是住在手机里的「克克」——一个能动手干活的助手。你用大白话说需求，
                            它自己调用工具去读、写、查、修：能做单文件的小 APP、小游戏、剧场并直接装进手机；
                            能排查报错和存储问题；连上 GitHub 仓库后还能帮你查代码、改代码、提 PR。
                        </p>
                        <p>
                            它<strong>不能</strong>替你做需要账号密码的事，不会未经确认就往你的仓库提交
                            （确认模式下每次提交前都先把「将要提交的改动」展示给你，点「应用」才真正提交）。
                            它写的东西都在你自己的设备和你自己的仓库里。
                        </p>
                    </div>
                </section>

                {/* 快速上手 */}
                <section className="workshop-tut-section">
                    <p className="workshop-tut-section-title">五步上手</p>
                    <ol className="workshop-tut-steps">
                        {QUICK_STEPS.map((step, index) => (
                            <li key={index}>
                                <span className="workshop-tut-step-no">{index + 1}</span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* 工具卡片：分组折叠 */}
                <section className="workshop-tut-section">
                    <p className="workshop-tut-section-title">工具说明书</p>
                    <p className="workshop-tut-section-note">按用途分组，点一组展开。连了仓库或角色电脑后这里会自动多出对应的工具。</p>
                    <div className="workshop-tut-groups">
                        {groups.map(group => (
                            <CollapsibleSection
                                key={group.id}
                                id={group.id}
                                title={`${group.title}（${group.tools.length}）`}
                                subtitle={group.subtitle}
                            >
                                <div className="workshop-tut-cards">
                                    {group.tools.map(tool => {
                                        const kind = inferQaToolKind(tool.name, tool.description);
                                        const doc = QA_TOOL_DOCS[tool.name];
                                        return (
                                            <article key={tool.name} className="workshop-tut-card">
                                                <header className="workshop-tut-card-head">
                                                    <span className="workshop-tut-name">{tool.name}</span>
                                                    <span className={`workshop-tut-badge ${KIND_BADGE_CLASS[kind]}`}>
                                                        {QA_TOOL_KIND_LABEL[kind]}
                                                    </span>
                                                </header>
                                                <p className="workshop-tut-desc">{tool.description}</p>
                                                {doc?.use && (
                                                    <p className="workshop-tut-use">
                                                        <strong>什么时候用：</strong>{doc.use}
                                                    </p>
                                                )}
                                                {doc?.example && (
                                                    <p className="workshop-tut-example">
                                                        <strong>例子：</strong>{doc.example}
                                                    </p>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>
                            </CollapsibleSection>
                        ))}
                    </div>
                </section>

                {/* 大纲胶囊与结转 */}
                <section className="workshop-tut-section">
                    <p className="workshop-tut-section-title">对话大纲与结转</p>
                    <div className="workshop-tut-prose">
                        <p>
                            <strong>「x / N 轮」胶囊</strong>：往上翻历史消息时，屏幕边上有颗小胶囊标着当前在第几轮。
                            点开能看到整场对话的大纲，点某一轮直接跳过去，找之前聊过的东西不用一直划。
                        </p>
                        <p>
                            <strong>结转新会话</strong>：Claude 一次能记住的内容有限（上下文满了会提示）。
                            点「结转新会话」，克克把这场对话的重点浓缩成一份记忆带进新对话，
                            聊天窗口清爽了，它还记得之前的事。干活聊久了推荐用这个，比硬撑着继续省力。
                        </p>
                    </div>
                </section>

                {/* 常见问题 */}
                <section className="workshop-tut-section">
                    <p className="workshop-tut-section-title">常见问题</p>
                    <div className="workshop-tut-cards">
                        {FAQ_ITEMS.map(item => (
                            <article key={item.q} className="workshop-tut-card">
                                <header className="workshop-tut-card-head">
                                    <span className="workshop-tut-name">{item.q}</span>
                                    <item.icon size={15} strokeWidth={1.8} className="workshop-tut-faq-icon" />
                                </header>
                                <p className="workshop-tut-desc">{item.a}</p>
                            </article>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
