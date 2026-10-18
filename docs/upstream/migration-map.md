# 迁移映射（migration-map）

记录每个来源的功能对应到 Float 的文件/模块，便于上游更新时只同步相关部分。

## momo.float.phone → Float

| 源功能 | Float 文件/模块 | 状态 |
| --- | --- | --- |
| 聊天小号与账号范围 | `lib/chat-scope-storage.ts`、`lib/chat-alt-account-storage.ts` | 已合入 |
| 范围切换入口 | `components/chat/chat-scope-switcher.tsx` | 已合入 |
| 用户身份编辑 | `components/settings/user-identity.tsx`、`user-identity-editor-sheet.tsx` | 已合入 |
| 记忆标签与账号过滤 | `lib/memory-storage.ts`、`lib/memory-service.ts`、`lib/short-term-assembler.ts` | 已合入并补全隔离 |
| 剧情分线/多人见面 | `components/story/**`、`lib/story-*` | 已合入 |
| 图片引用选择 | `lib/image-reference-selection.ts` | 已合入 |

## doremy.float.phone → Float

| 源功能 | Float 文件/模块 | 状态 |
| --- | --- | --- |
| 全局通话与浮窗 | `lib/call-session-store.ts`、`components/chat/call-layer.tsx`、`call-mini-window.tsx` | 已合入 |
| 通话字幕/自动接话 | `components/chat/call-subtitle-item.tsx`、`use-call-auto-chat.ts`、`use-call-reply-queue.ts` | 已合入 |
| 安卓壳通话浮层 | `android-shell/.../CallOverlayService.kt` | 已合入（需真机验证） |
| 感知 | `components/perception/**`、`styles/perception.css` | 已合入 |
| 截图打卡 | `components/screenshot/**`、`components/chat/checkin-*` | 已合入 |
| 桌面小组件/系统日历 | `styles/phone-widget.css`、`android-shell/.../PhoneWidgetProvider.kt`、`CalendarBridge.kt` | 已合入（需真机验证） |
| 推送自检 | `app/api/push/selfcheck/route.ts` | 已合入 |
| 设备动作 | `components/device-action/**`、`android-shell/.../DeviceActionBridge.kt` | 已合入（需真机验证） |

## ai-virtual-phone-Y2Kversion → Float

| 源功能 | Float 文件/模块 | 状态 |
| --- | --- | --- |
| iMessage 样式表与素材 | `styles/imessage26.css`、`styles/chat-settings.css`、`styles/chat-social-apple.css`、`public/imessage26/**` | 已移植 |
| 聊天气泡/尾巴/分组 | `components/chat/message-bubble.tsx`、`components/chat/chat-room.tsx` | 已移植 |
| 输入区与加号菜单 | `components/chat/chat-room.tsx`（ChatTextInputBar） | 已移植 |
| 长按菜单与 Tapback | `components/chat/chat-room.tsx`、`lib/chat-tapback.ts`、`components/chat/imessage-tapback-badge.tsx` | 已移植 |
| 模型侧 `[Tapback:emoji]` | `lib/chat-tapback.ts`、`lib/rich-message-parser.ts`、`lib/chat-engine.ts`、`lib/group-chat-engine.ts`、`lib/follow-up-service.ts` | 已移植 |
| 气泡颜色/美化预设 | `components/chat/bubble-color-settings.tsx`、`beauty-preset-picker.tsx`、`components/chat/chat-settings-panel.tsx` | 已移植 |
| 动态/主页/底栏苹果社交外观 | `components/chat/moments-*`、`user-profile-panel.tsx`、`chat-social-apple.css` | 已移植 |
| 回声/爱心/烟花特效 | `lib/chat-echo.ts`、`chat-love.ts`、`chat-fireworks.ts`、`lib/message-effects/**`、`components/chat/message-effect-playback.tsx`、`use-chat-echo.tsx`、`use-echo-send-gesture.tsx` | 已移植（2026-10-18） |
| 特效标记解析 | `lib/rich-message-parser.ts`（`[Echo]`/`[Love]`/`[Fireworks]`） | 已移植（2026-10-18） |
| 特效提示词 | `lib/chat-engine.ts`、`lib/group-chat-engine.ts` | 已移植（2026-10-18） |
| 群聊 @提及 | `lib/group-mentions.ts`、`components/chat/use-group-mentions.tsx`、`components/chat/chat-room.tsx` | 已移植（2026-10-18） |
| @提及写入历史提示 | `lib/group-chat-engine.ts` | 已移植（2026-10-18） |
| identity-runtime 命名空间代理 | — | 不移植（与字段级 `chatAccountId` 冲突） |
| 长按气泡整层位移 | — | 不移植（Float 用自动避让浮层） |
| 系统深色刷黑整个聊天模块 | — | 不移植（深浅色由「聊天外观」控制） |
| 画板 | `components/chat/drawing-board.tsx`（未复制） | 未移植 |
| 一起听邀请卡 | `components/chat/listening-invite-card.tsx` | 未移植 |
| 照片标注 | `components/chat/photo-markup-editor.tsx` | 未移植 |
| 快捷回复窗/分享目标面板 | `components/chat/quick-reply-window.tsx`、`share-destination-sheet.tsx` | 未移植 |
| echo-preview/echo-playback | 源仓库内亦无引用（死代码） | 不移植 |

## 安卓快捷指令（独立任务，不属于上述三个来源）

| 现有实现 | Float 文件 | 来源 |
| --- | --- | --- |
| 服务端快捷指令列表/执行 | `lib/server/shortcut-commands.ts`、`app/api/**` 相关路由 | 上游 `xiaolongbao0709/ai-virtual-phone` `d00b0b0` |
| 客户端入口 | 搜索 `shortcut` 相关组件/设置页 | 待逐项确认 |
