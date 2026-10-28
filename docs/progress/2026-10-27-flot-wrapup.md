# FLOT 收尾修复与灵动岛重构 · 进度（2026-10-27）

需求原文：用户提供的《FLOT 收尾修复与灵动岛重构任务书》（Downloads/新建空白.txt）。
约束：不新增大型功能、不合并 main、不部署、不碰 Vercel/Supabase；完成后只跑一次 tsc + 一次 build，然后停。

- 分支：`fix/flot-wrapup-island`（基于 origin/main cecf689）
- 第一个提交 a221255：保留开工前工作区里已有的未提交改动（1.2.2 日志、快穿局/生活模拟顶栏让位等），未改内容

## 1. 灵动岛（已完成代码）
- 新增 `lib/island-center.ts`：全局状态中心（持续活动 + 临时事件队列，同来源合并计数）
- `lib/island-notify.ts` 改为转发到中心；`lib/float-presence.ts`（角色正在回复）登记为活动
- `lib/call-session-store.ts` 增加 `startedAt`（显示通话时长）
- 新组件 `components/island/dynamic-island.tsx` 取代 `components/music/music-dynamic-island.tsx`（已删）
  优先级：事件 > 通话 > 活动 > 一起听 > 音乐 > 空闲
- `styles/dynamic-island.css` 重写；`styles/music.css` 删掉旧 `.music-dynamic-island` 整段
- 手记后台生成接入为活动
- 未知来电筛选：项目里没有陌生来电的来源，本次不新增（列入未解决）

- 来电：desktop-shell 的来电横幅处理抽成 accept/decline 两个函数，岛和横幅共用；岛可见时来电显示在岛上
  （系统状态栏模式下壳状态栏被 CSS 隐藏，会退回横幅）

## 2. 更新公告与日志（已完成代码）
- `lib/update-log/user-view.ts`：同一份发布记录派生公告（标题级）与日志（八类分组、全部说明）；
  生产环境不显示 releaseId / pending；文本兜底过滤文件名、代码标识
- `/api/release` 增加 `latest`（用户可见字段）；`update-service.ts` 改为拉它（no-store + 时间戳），
  启动 / 切回前台（1 分钟节流）/ 进入更新日志 / 手动检查；失败统一「暂时无法获取最新更新信息」
- 公告与日志页共用 `useReleaseList()`；已读仍只在「知道了」里写一次
- `sync-app-version.mjs`：app-version.json 的 summary / changes 从 system-data 最新一版生成
- 旧日志里技术性条目（0.6.19 / 0.6.18 / 0.6.15 / 0.6.11 / 0.6.10 / 0.6.8 / 0.6.7 / 0.3.0）改写为大白话
- check-update-log.mjs 的关联检查改为新的数据路径（未放松）

## 3. Claude 工坊（已完成代码）
- 修改提案逐行差异（`lib/qa-diff.ts`、`components/qa/qa-commit-review.tsx`）
- 提交后读取仓库 CI 真实检查结果（`getQaGithubChecks`）；顶栏「任务状态」面板（检查 + 待合并 PR）
- 侧栏：新对话放顶部，底部工具一行；删掉重复的「文件与会话」「新对话」按钮
- 撤销时仓库配置丢失给出原因；工具执行 / 失败同步到灵动岛
- 小卷：工具卡片标「已完成 / 未成功」，有失败时结束提示如实说明

## 4. 顶栏与返回键（已完成代码）
- `lib/back-navigation.ts`：浏览器返回 / 安卓返回 → 灵动岛 → 弹窗（Esc，再找关闭按钮）→ 应用顶栏返回按钮 → 主屏 → 再按一次退出
- 应用打开时状态栏 pointer-events: none，只有灵动岛可点
- Miya 手机应用 body 顶部改用 `--ai-phone-app-safe-top`，已装旧版自动刷新一次（作者 Miya 且 1.0.0 才动）
- 快穿局、X 写作页返回按钮补 aria-label

## 5. 外部名称（已完成代码）
- 网页标题 / manifest / apple 标题、书房启动画面小标题：LinH Pocket YI → FLOT
- Claude 知识库与答疑文档标题、请求头 X-Title、小组件名「Y2K卡片」
- 未改：代码注释、内部标识、MCP client 名、上游仓库地址（贡献功能需要）、agent-computer 模板仓库链接（部署说明需要）

## 未做
- 书房启动页（用户 10-27 第二条消息只列了四项剩余工作，本次未动）
- 未知来电筛选（无来源）
