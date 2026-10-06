# 书房第三批进度（2026-10-06）

规格来源：`BookRoom-Batch3-Instructions-And-All-Materials.txt`（第一部分 16–435 行为指令）。
分支：`feat/bookroom-batch3`。不提交 `public/weixin-local-assistant/cloud-function.mjs`、`supabase/functions/weixin-assistant/index.ts`。

## 阶段A
- [x] 帮助问号气泡：挂到屏幕根节点，按按钮位置测量并夹在屏幕内，避开键盘，内容过长内部滚动（help-tip.tsx）
- [x] 外观设置不生效：变量/自定义 CSS 只挂在 .sr-app，阅读器与聊天会话是独立根节点 → 改为三个根节点都生效
- [x] 阴影强度滑杆：以前带 % 写出，calc 后几乎为 0 → 改为纯数字
- [x] 外观分组：主题 / 背景 / 书架 / 聊天外观（并入共读侧栏专属）/ 阅读器 / 笔记与其他；无背景图时背景控件禁用并说明
- [x] 调色面板：HEX 跟随色块与滑杆同步；rgb() 输入识别修复；新增常用色板
- [x] 聊天尾巴：SVG 遮罩短弧，左右镜像，同色无缝；关尾巴时底角恢复；分组加 5 分钟间隔
- [ ] 收书/搜索键盘背景漏边
- [ ] 主页帖子详情弹窗
- [ ] 纯白底检查

## 阶段B / C / D
见规格第一部分；完成后在此勾选。
