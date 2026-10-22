"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, Github, Laptop } from "lucide-react";

import { getQaTools } from "@/lib/qa-agent-tools";
import { loadQaGithubConfig } from "@/lib/qa-github";
import { isWorkshopComputerEnabled } from "@/lib/agent-computer";
import { WorkshopTutorialPage } from "./workshop-tutorial";

/**
 * 设置 → 工坊（任务 7）。
 *
 * 任务书要求教程不放工坊主页面，而是放在「设置里工坊对应的那一页」：
 * 这里就是那一页——工坊的说明 + 「使用教程」整页入口 + 当前工具概况。
 * 工坊自己的参数配置（上下文预算、超时等）仍在工坊应用内的设置面板，不搬过来。
 */
export function WorkshopSettings() {
    const [tutorialOpen, setTutorialOpen] = useState(false);
    const [stats, setStats] = useState({ toolCount: 0, repo: "", computer: false });

    useEffect(() => {
        setStats({
            toolCount: getQaTools().length,
            repo: loadQaGithubConfig() ? "已连接" : "未连接",
            computer: isWorkshopComputerEnabled(),
        });
    }, []);

    const sectionTitle = "text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em]";

    return (
        <div className="flex flex-col gap-5 pb-6">
            <div className="flex flex-col gap-2">
                <p className={sectionTitle}>GUIDE</p>
                <button
                    type="button"
                    className="ui-group-card !flex-row !items-center justify-between text-left"
                    onClick={() => setTutorialOpen(true)}
                >
                    <span className="flex flex-col gap-0.5 min-w-0 pr-3">
                        <span className="menu-label flex items-center gap-1.5">
                            <BookOpen size={14} strokeWidth={2} />
                            使用教程
                        </span>
                        <span className="menu-desc">
                            工坊是什么、每个工具干什么用、出错了怎么撤销，看这一篇就够。
                        </span>
                    </span>
                    <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-gray-400" />
                </button>
            </div>

            <div className="flex flex-col gap-2">
                <p className={sectionTitle}>STATUS</p>
                <div className="ui-group-card flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                        <span className="menu-label">当前可用工具</span>
                        <span className="ts-13 text-gray-400">{stats.toolCount} 个</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="menu-label flex items-center gap-1.5">
                            <Github size={13} strokeWidth={2} />
                            GitHub 仓库
                        </span>
                        <span className="ts-13 text-gray-400">{stats.repo}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="menu-label flex items-center gap-1.5">
                            <Laptop size={13} strokeWidth={2} />
                            角色电脑
                        </span>
                        <span className="ts-13 text-gray-400">{stats.computer ? "已连接" : "未连接"}</span>
                    </div>
                </div>
                <p className="menu-desc">
                    连上仓库或角色电脑后，工坊能用的工具会自动变多。仓库和参数配置在工坊应用内（「仓库」按钮和设置面板）。
                </p>
            </div>

            {tutorialOpen ? <WorkshopTutorialPage onClose={() => setTutorialOpen(false)} /> : null}
        </div>
    );
}
