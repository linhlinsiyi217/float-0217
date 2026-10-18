# 来源清单（source-manifest）

最后核对：2026-10-18。本文件是长期来源记录，任何一次上游同步都以此为基础，
不要凭对话记忆或截图推断仓库地址。

## 1. momo.float.phone

- 完整仓库：https://github.com/jianchu-in/momo.float.phone.git
- 分支：`main`
- 本次采用 commit：`e455340c2e02c0dc702d2f221e46fa4c8f158989`（2026-10-15）
- 本地只读引用：`refs/sources/momo`（未加 remote，未推送）
- 许可证：AGPL-3.0-only（仓库根 `LICENSE` + `package.json`）
- 共同祖先：`fc65539`（2026-09-12）；已包含至 `cfc3ae0`（09-24）
- 移植功能：剧情分线与多人见面、邀请卡片、仿真拉黑、记忆标签与身份范围、
  聊天小号与字段级 `chatAccountId` 范围
- 为适配 Float 做的修改：
  - 小号身份只发送小号自己的资料，删掉「这是小号/不是主号」提示
  - 大小号隔离补到短期时间线、长期/核心记忆、记忆总结、群聊摘要、截图打卡等
- 上游更新后可能冲突：`lib/chat-alt-account-storage.ts`、`lib/chat-scope-storage.ts`、
  `lib/chat-engine.ts`、`lib/group-chat-engine.ts`、`components/chat/chat-room.tsx`
- 当前状态：已合入整合分支（`merge/three-sources-1015`），未合入 main

## 2. doremy.float.phone

- 完整仓库：https://github.com/doremy1203/doremy.float.phone.git
- 分支：`main`
- 本次采用 commit：`05b8bc5b415383a4a4ae6009d62579cf1147b7a1`（2026-10-12）
- 本地只读引用：`refs/sources/doremy`（未加 remote，未推送）
- 许可证：AGPL-3.0-only
- 关键提交：`c849806`（2026-10-12，一次性同步通话浮层、感知、截图打卡、
  桌面小组件、系统日历、推送自检、安卓壳与设备动作）
- 移植功能：全局通话与通话浮窗、通话字幕/自动接话、感知、截图打卡、
  桌面小组件与系统日历、个人离线推送自检、安卓壳与设备动作
- 为适配 Float 做的修改：
  - 修复合入时带入的 5 处 `prefer-const` lint 错误（0db29cc）
  - `app/globals.css` 保持原有 `@import` 顺序，仅追加 `perception.css`、`phone-widget.css`
  - 通话界面提升到 `desktop-shell` 的 `CallLayer`，聊天室只负责发起
- 上游更新后可能冲突：`components/chat/chat-room.tsx`、`components/desktop-shell.tsx`、
  `app/globals.css`、`android-shell/app/src/main/java/app/floatphone/shell/MainActivity.kt`
- 当前状态：已合入整合分支，未合入 main

## 3. ai-virtual-phone-Y2Kversion

- 完整仓库：https://github.com/Yyk-Y2k/ai-virtual-phone-Y2Kversion.git
- 分支：`main`
- 本次采用 commit：`3e6978630fa789be1b2d6c44c6b0497fb984833b`（2026-10-11）
- 本地只读引用：`refs/sources/y2k`（未加 remote，未推送）
- 许可证：AGPL-3.0-only
- 历史关系：Y2K 是重新初始化的仓库（`0c841fc Initial public release of float-Yyk`），
  与 Float 没有共同提交历史，只能按功能手工移植，不能 merge。
- 移植功能：仿苹果 iMessage 聊天室外观与交互、气泡颜色/美化预设、
  Tapback（含模型侧协议与自定义候选）、Apple Pay 转账卡与语音条图形、
  动态/主页苹果社交页、底部胶囊标签栏、回声/爱心/烟花屏幕特效、群聊 @提及
- 未移植：identity-runtime 命名空间代理、长按气泡整层位移、系统深色整套刷黑、
  画板、一起听邀请卡、照片标注、快捷回复窗、分享目标面板
- 上游更新后可能冲突：`styles/imessage26.css`、`components/chat/chat-room.tsx`、
  `components/chat/message-bubble.tsx`、`lib/rich-message-parser.ts`、`lib/chat-storage.ts`
- 当前状态：已按功能移植到整合分支，未合入 main

## 4. 上游原始项目（安卓快捷指令的真实来源）

- 仓库：`xiaolongbao0709/ai-virtual-phone`（Float-0217 的上游 fork 来源）
- 快捷指令文件 `lib/server/shortcut-commands.ts` 最早由该仓库提交
  `d00b0b0`（2026-08-24，xiaolongbao0709，`feat: 开源个人云离线推送与微信现实桥`）加入。
- 证据：该文件在 momo、doremy、Y2K 三个来源与 Float 中 **MD5 完全相同**
  （`e1214ebf934088597faaa11a2f93eef6`）；momo/doremy 的 `git log --diff-filter=A`
  指向 `d00b0b0 xiaolongbao0709`，Y2K 因其重新初始化只能指向 `0c841fc`。
- 结论：**安卓快捷指令不属于 momo、doremy 或 Y2K 的功能**，
  是上游原始项目自带能力。详见 `docs/progress/android-shortcut-commands.md`。

## 5. 来源待确认

- 安卓手机壳中的「快捷指令」原生执行入口（若存在于 APK 内）尚未逐行核实是
  上游自带还是 doremy 的 `android-shell` 新增；当前只能确认 Web/服务端
  `lib/server/shortcut-commands.ts` 的归属。
- 任何不在以上记录中的功能，一律标「来源待确认」，不得臆造仓库地址。
