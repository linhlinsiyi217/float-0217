# 三来源整合（进行中）· 交接

- 工作目录：`I:\float-0217-work`（C 盘满，原 `Desktop\float-0217` 未动，main 已快进到 84fc1dd）
- 分支：`merge/three-sources-1015`，基于 origin/main 84fc1dd
- 来源克隆：`I:\float-merge-src\{momo.float.phone,doremy.float.phone,ai-virtual-phone-Y2Kversion}`，
  取入本仓库只读引用 `refs/sources/{momo,doremy,y2k}`（未加 remote，未推送）

## 祖先关系
- momo、doremy 与目标共同祖先 fc65539（2026-09-12）；doremy 已包含 momo 至 cfc3ae0（09-24）
- momo 在 cfc3ae0 之后 11 个提交：聊天身份范围/小号、剧情小手机、头像覆盖、记忆工具
- doremy 在 cfc3ae0 之后：c849806 一次性大提交（通话浮层、感知、截图打卡、桌面小组件、系统日历、推送自检、安卓壳）
- y2k 无共同历史（重新起的初始提交）；与 09 月上游接近，全部 CRLF。只能按功能手工移植

## 当前状态
- 已执行 `git merge --no-ff --no-commit refs/sources/momo`：自动合并无冲突，**未提交**
- 未跑 tsc/build（权限被拦，需用户明确同意对合并后的来源代码做检查）
- doremy 预演冲突：README、MainActivity.kt、app/globals.css、chat-room.tsx、phone-qa-app.tsx

## 已发现必须改的点
- momo `lib/chat-alt-account-storage.ts` 的 `resolveChatAltAccountIdentity` 会在 customSettings 里写
  「这是小号，不是主号」——违反需求第五条，要删掉这段提示，只发小号自身资料
- momo 小号身份复用主身份的 customSettings（基础人设），需确认是否属于「共享」还是「私有」

## 10-16 已改
- `lib/chat-alt-account-storage.ts`：小号身份只发小号自己的资料，删掉"这是小号/不是主号"提示，不再继承主身份人设与头像（未提交，仍在 momo 合并的暂存状态里）

## 10-16 下午
- 已提交：909a40e（momo，tsc 通过）、f50b75d（doremy，冲突已解，**tsc 未跑**）
- 未提交：无（进度文档未纳入版本）
- 阻塞：C 盘 0 字节（bash 临时文件、npm 缓存都在 C 盘，命令直接失败）；
  tsc 在合并代码上被自动模式拦截，用户口头授权不生效，需用户在设置里加允许规则
- 大小号方案决定：沿用 momo 的字段级 chatAccountId 方案并补全；**不移植** Y2K 的
  identity-runtime（整套 localStorage/IndexedDB 命名空间代理），两套并存会重复且互相冲突
- 已确认的隔离缺口（待修）：
  - `lib/short-term-assembler.ts:225-228` loadNativeTimeline 取全部会话，
    私聊用 `find(!isGroup && contactId)`，会拿到别的账号的私聊；群聊同理
  - `lib/chat-engine.ts:1878/1897` 短期记忆、长期/核心记忆检索不带账号作用域
  - 记忆总结 memory-summarizer、MemoryEntry 无账号字段（需加 chatAccountId 并按旧数据=主号兼容）

## 用户补充要求（10-16，本次整合重点，优先级高于 DESIGN.md 默认）
Y2K 的界面美化与聊天风格必须保留并整合：
1. 聊天室：保留 Y2K 仿 iMessage 的整体设计——气泡、消息排列、输入区、间距、圆角、交互细节。
   不能只换颜色，不能改回普通聊天 UI。
2. 整体美化：认真检查 Y2K 的样式、布局、动效、图标和细节，有价值的完整移植并适配本项目。
3. 聊天风格：保留 Y2K 的聊天呈现与相关体验；原有角色卡、记忆、聊天功能和数据不丢。
4. 不整体覆盖；先查 Y2K 实际组件/CSS/主题/依赖再逐项移植。冲突时功能兼容优先，
   但不能因此放弃 iMessage 聊天视觉。
5. 完成后检查：手机端布局、输入框、消息气泡、长消息、键盘弹出、深浅色、原有功能。
交付时列出：哪些 Y2K 界面已真正移植、哪些未完成。
→ DESIGN.md 需同步加一节「聊天室 iMessage 风格（来自 Y2K）」，避免与现有冷白玻璃规则冲突。

## 10-16 晚 · 大小号记忆隔离（未提交，tsc 未跑）
- short-term-assembler：loadNativeTimeline / prepareShortTermContext / prepareGroupShortTermContext
  加 `chatAccountId` 选项（省略=当前聊天范围，null=主号）；私聊、群聊会话按账号过滤；
  朋友圈用户动态、用户点赞/评论只取该账号
- MemoryEntry 加可选 `chatAccountId`（旧记忆无字段=主号，不迁移、不删）
- memory-storage：`memoryEntryInAccount`、`resolveMemoryAccountScope`；计数器/总结水位线
  对小号加 `::账号` 后缀，主号沿用旧键
- memory-service 长期/核心检索、memory-summarizer、core-memory-builder 按账号过滤与写入；
  锁按「角色+账号」
- chat-engine、group-chat-engine 传 `session.chatAccountId`（后台总结切号后仍写回原账号）
- memory-bank-page：只显示/清空/手写当前账号的记忆
- 其他应用引擎（小红书、剧情、日记等）不传参数 → 跟随当前聊天范围

## Y2K iMessage 盘点结论（子代理只读盘点）
- Y2K 聊天室始终开 iMessage：`.chat-room-wrapper[data-imessage-private]` + `styles/imessage26.css`（3271 行）
- 深色由 `useChatAppearance` 写 `data-chat-dark`；美化预设 classic/glass 只换材质
- 移植顺序：素材 public/imessage26 → 叶子 lib（beauty-preset、avatar-name-color、bubble-colors、
  tapback、quote-preview、exchange-rates、menu-reorder、text-layout、session-avatar）→ 无依赖组件 →
  globals.css 在 chat.css 后引入 imessage26.css → chat-room 外层属性 → 消息行 → 顶栏/输入栏/菜单 →
  message-bubble → 设置页 / 消息列表（chat-social-apple.css）
- 不需要新 npm 包（roughjs 只给照片标注）

## 下一步（续接时）
1. 用户同意后跑 `npx tsc --noEmit`，修 momo 合并的类型错误，提交 momo 合并
2. 审计小号作用域：记忆、群聊、通话、动态、钱包、后台任务是否按 chatAccountId 隔离；切号时旧请求不写入新账号
3. 合并 doremy（处理 5 个冲突文件，globals.css 保持导入顺序）
4. y2k 按功能手工移植（相册、多图、tapback、画板、一起听等），逐项决定
5. 更新日志 system-data.ts、check:updates、tsc、build

## 10-17 · 续接完成情况

分支 `merge/three-sources-1015`，基于 origin/main 84fc1dd，未合入 main、未部署。

### 已完成
- 合入 momo（909a40e）与 doremy（f50b75d）主分支；doremy 的 5 个冲突文件已解。
- 大小号隔离（6cdcf0c、27e3f7c）：短期时间线、长期/核心记忆、记忆总结、群聊摘要、
  截图打卡、经期关心、未读胶囊按 `chatAccountId` 过滤；其他应用引擎不传参 → 跟随当前聊天范围。
  小号身份只发小号自身资料，不告诉模型「这是小号」。
- Y2K iMessage 完整移植（7b01ee9 → 62c1040、fa61153、ed20685、c98cadb）：
  素材与三张样式表、聊天室外层、气泡与尾巴、顶栏、输入区、加号菜单、长按菜单、
  Apple Pay 转账卡、语音条图形、设置页（气泡颜色/美化预设/Tapback 候选）、
  模型侧 `[Tapback:emoji]`（单聊/群聊/流式/主动消息）、自定义 Tapback 输入、
  动态/主页苹果社交页外观与底部胶囊标签栏。
- 发布 0.6.8 更新日志（447d8cc）：8 条记录 26 条内容，4 条未实测写进 pending。
- NOTICE 补三来源署名；DESIGN.md §8.9.1 写已移植 / 未移植清单。

### 检查结果
- `npx tsc --noEmit`：通过（0 错误）。
- `npm run build`：通过（3 次，含最后一次）。
- `npm run check:updates`：通过。
- `npm run lint`：仍有 136 个错误，其中 132 处主分支就已存在（多为 `no-explicit-any`），
  本次合入带入的 5 处 `prefer-const` 已修（0db29cc）。**没有做全仓库 lint 清理**，
  避免在整合分支里大规模改动无关文件。

### 未验证 / 待确认
- 没有浏览器或手机实机验收：iMessage 键盘、长消息、深浅色、Tapback 实际贴纸效果都需真机确认。
- 模型侧 Tapback 未真实调用付费模型验证（只验证代码路径与类型）。
- 安卓壳原生小组件、通话浮层、推送需打包 APK 后真机确认。
- 多账号切换没有做实机回归。

### 构建产物注意
`npm run build` 会重新生成 `public/ai-phone-push/{gateway,push-generate}.mjs` 与
`public/weixin-local-assistant/cloud-function.mjs`、`supabase/functions/weixin-assistant/index.ts`。
其中推送两个产物在仓库里比源码多约 180 行，重新生成会覆盖；本次没有提交这些改动，
改动已备份到 `.merge-tmp/build-artifacts/`（该目录不提交）。下次发布前需要决定：
是把源码补回去，还是把产物恢复成已提交版本。

### 构建产物决定（10-18，已解决，见 4878a75）
核对结论：doremy 合入时把「推送预览应用用户输出正则」和「自检读表类型注解」只写进了
`public/ai-phone-push/*.mjs` 产物、漏写 `supabase/functions/*/index.ts` 源文件。
选择**把缺失逻辑补回源文件**（`supabase/functions/push-generate/index.ts` +187 行、
`supabase/functions/ai-phone-push/index.ts` 早已正确），再 `npm run push:build-dist` 重新生成，
`npm run check:push` 通过。这样 `npm run build` 不再漂移，功能（推送预览正则）也保住。
`build-artifacts-backup-2026-10-17.patch` 保留为备份参考，不提交。

## 10-18 · 来源纠正与 Y2K 特效/@提及补移植

### 来源核实（有代码证据）
- momo：https://github.com/jianchu-in/momo.float.phone.git · main · `e455340`
- doremy：https://github.com/doremy1203/doremy.float.phone.git · main · `05b8bc5`
- Y2K：https://github.com/Yyk-Y2k/ai-virtual-phone-Y2Kversion.git · main · `3e69786`
- 三者均为 AGPL-3.0-only；本地只读引用 `refs/sources/{momo,doremy,y2k}` 与上述 SHA 一致。
- **安卓快捷指令纠正**：`lib/server/shortcut-commands.ts` 在 Float、momo、doremy、Y2K 四处
  MD5 完全相同（`e1214ebf934088597faaa11a2f93eef6`）；momo/doremy 的最早提交是
  `d00b0b0 2026-08-24 xiaolongbao0709 feat: 开源个人云离线推送与微信现实桥`。
  因此快捷指令属于上游原始项目，**不是 Y2K、也不是 momo/doremy 的功能**。
  详见 `docs/progress/android-shortcut-commands.md`。
- 来源跟踪入口：`docs/upstream/source-manifest.md`、`migration-map.md`、`upstream-sync.md`。

### 本轮实际改动
- 补移植 Y2K 屏幕特效：`lib/chat-echo.ts`、`chat-love.ts`、`chat-fireworks.ts`、
  `lib/message-effects/**`（渲染器保留 `.js` + `.d.ts`，与 Y2K 相同，项目不需要打开 allowJs）、
  `components/chat/message-effect-playback.tsx`、`use-chat-echo.tsx`、`use-echo-send-gesture.tsx`。
- 解析 `[Echo]`/`[Love]`/`[Fireworks]`：`lib/rich-message-parser.ts` 绑定到该段第一个文字气泡，
  每轮最多一次；`lib/stream-preview.ts` 隐藏未打完的标记。
- 提示词：单聊 `lib/chat-engine.ts`、群聊 `lib/group-chat-engine.ts` 注入三套特效说明。
- 群聊 @提及：`lib/group-mentions.ts` + `use-group-mentions.tsx` 接入输入区；
  发送时写入 `mediaData.mentions`；群聊历史标注被提及成员。
- 聊天室接线：输入区特效选择器、发送键长按手势、长按菜单「重播特效」、
  消息列表特效播放层 `{echo.overlay}`；特效消息记录 `screenEffectScene` 快照。
- 数据结构：`ChatMessage.mediaData` 增加 `screenEffect`、`screenEffectScene`、`mentions`。
- 更新日志：0.6.8 增加「屏幕特效与 @提及」条目，并把未实机验证写进 pending。
- 文档：NOTICE 补 Y2K 特效/提及署名；DESIGN.md §8.9.1 已移植/未移植清单同步。

### 本轮检查
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`：通过（0 错误）。
- 未跑 build、未跑全量 lint（按额度控制要求，等到阶段性检查点再跑）。
- 未在浏览器/手机播放特效，未调用付费模型验证 [Echo] 使用率。

### 仍未移植（Y2K）
- 画板 `drawing-board.tsx`（依赖 `lib/chat-drawing*` 三套模型调用，工作量较大）。
- 一起听邀请卡、照片标注、快捷回复窗、分享目标面板。
- identity-runtime 命名空间代理、长按气泡整层位移、系统深色刷黑（沿用现有做法，不移植）。
- `echo-preview.tsx` / `echo-playback.tsx`：源仓库自身也没有引用（死代码），不移植。

## 10-18 · 收尾：构建产物对齐与更新日志四色体系

### 构建产物（见上方「构建产物决定」，提交 4878a75）
把 doremy 只写进产物的推送预览正则与自检类型补回源文件，重新生成，check:push 通过。

### 更新日志分类改版（提交 4d77cc3，有用户可见变化）
按《AI 项目更新记录强制规范》，分类从「新增/修复/优化/调整」改为
「新功能(绿)/体验优化(蓝)/问题修复(橙)/隐私与安全(紫)」：
- `lib/update-log/types.ts`：新增 `privacy` 分类，perf/tweak 归并到「体验优化」，
  `normalizeUpdateCategory` 统一旧数据；颜色改为四色。
- `components/update-log/update-log-view.tsx`、`update-note-popup.tsx`：按新分类分组渲染。
- `lib/update-log/system-data.ts`：大小号隔离条目改归「隐私与安全」，新增「更新日志分类更清晰」条目，
  移除「开发检查」这条工程状态条目（未实测信息已在 pending 里）。
- `DESIGN.md` §2 更新分类色。

### 检查
- `tsc --noEmit` 通过；`npm run build` 通过；`npm run check:updates` 通过；`npm run check:push` 通过。
- 未跑全量 lint、未在浏览器/手机实测（特效播放、@提及键盘交互、深色模式仍待真机确认）。
- PR #1：OPEN、MERGEABLE；推送后 Vercel Preview 为 PENDING（未轮询，不宣称部署成功）。
