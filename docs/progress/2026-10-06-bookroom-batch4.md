# 书房第四批：联网、分享与界面修复（进度记录）

来源指令：`BookRoom-Batch4-Repair-Instructions.txt`（2026-10-06），原文已存为 `docs/requirements/2026-10-06-bookroom-batch4-instructions.txt`。
工作方式：独立工作树 `../float-0217-b4`，分支 `feat/bookroom-batch4`，基于 `origin/main`（4d0cf7c）。
主目录的工坊预览分支与两份微信助手未提交改动（`public/weixin-local-assistant/cloud-function.mjs`、
`supabase/functions/weixin-assistant/index.ts`）属于其他任务，本批不碰。工坊、用户外部视频小窗不在本批范围。

本次对话只做第 1 组；其他组记为待办，下一次新对话从这里继续。

## 交接（新对话先读这一节）

### 1. 完整需求
- **完整原文**：[docs/requirements/2026-10-06-bookroom-batch4-instructions.txt](../requirements/2026-10-06-bookroom-batch4-instructions.txt)
  （用户附件 `BookRoom-Batch4-Repair-Instructions.txt` 逐字节原样复制，共十节 + 参考来源）。
  下面的分组只是摘要，**以原文为准**，每组开工前重读原文对应章节。
- 用户在第 1 组发布时追加的「全项目统一更新规则」已写进 CLAUDE.md 第四节，每次发布都要遵守。

### 2. 状态
- 当前分支 `feat/bookroom-batch4`（工作树 `C:\Users\Administrator\Desktop\float-0217-b4`），已与 main 同步。
- main 最新提交：`8108074`（只改进度文档）；最近一次产品发布提交：`17b5d39`（Vercel Production 成功）。
  新对话开工先 `git fetch` 查真实状态，不要按这里的提交号重置。
- 正式网址：https://float-0217.vercel.app （核对用 `/api/release` 看部署提交与发布标识）。
- 已线上的发布标识：总日志 0.6.2 `system-2026-10-06-v062`、书房 0.7.1 `studyroom-2026-10-06-v071`。
- 本地已提交、**尚未推送上线**：`d8e7140`，标识总日志 0.6.3 `system-2026-10-06-v063`、书房 0.7.2 `studyroom-2026-10-06-v072`。
  推送到 main 时被 Claude Code 权限拦截（没有绕过）。维护者放行后：`git fetch` → 确认 origin/main 仍是 d8e7140 的祖先 →
  `git push origin HEAD:main` → 查 Vercel Production 与 `/api/release`。如果 main 期间有新发布，需重新换标识。

| 组 | 内容（原文章节） | 状态 |
|---|---|---|
| 1 | 联网搜书 + 完整内置书库（一、二） | 已完成并发布；手机未实测；Google Books 缺 `GOOGLE_BOOKS_API_KEY` |
| 2 | 书房内容分享到聊天：卡片 + AI 读取（三） | 未开始 |
| 3 | 头像状态气泡 + 书友圈发布按钮越界（五、六） | 代码已完成（d8e7140），**未推送**（推送被权限拦截）；手机未实测 |
| 4 | 主题纯白 + 自有删除/排序面板 + 书友圈布局重做（四、七、八） | 书友圈部分 + 灰底迁移已完成（d8e7140），**未推送**；其他文件的 confirm() 与各页底色审计未做 |
| 5 | 文风接入核查（九） | 未开始 |
| 收尾 | 每组上线按第十节 + CLAUDE.md 第四节 | 每组做 |

### 3. 截图现象的文字版（原文已把截图转成文字，这里再摘出关键要求）
本批**没有随附截图文件**，项目里也没有保存任何截图；原文说明「已经把截图现象翻译成文字，不需要用户重新发送图片」。
所以只按下列文字实施，不要声称比对过截图。
- **分享到聊天（三）**：发书/帖子到聊天后显示「查看网页 HTTP 422」，错误里有 `SubmittedDataMalformedError`、
  `path=url` 和一串异常长的域名；角色随后拿失败开玩笑，根本没看到内容。异常域名只是线索，要查载荷、链接生成、
  URL 解析、读取工具（「查看网页」= Jina Reader）和角色上下文。
- **默认主题（四）**：书城、书架、书桌、抽卡、书友圈、我的等主页面是大面积冷灰底 → 改为纯白 #FFFFFF 为底，
  黑/炭黑做主按钮和主文字，灰做次要；绿/紫/黄/蓝只点缀分类、当前项、提示；无荧光/霓虹/刺眼渐变。
- **头像状态气泡（五）**：现在是一个巨大气泡横跨头像和姓名上方；空状态「写点此刻的状态」撑起一整块。
  → 气泡放在**头像左上方**、紧贴头像，尾巴轻压头像边缘一点；不旋转/翻转素材；可见宽度约头像直径 1–1.25 倍
  （按裁掉留白后的可见轮廓算）；不盖脸、姓名、SVIP、统计，不撑出大片空白；尾巴与主体相连，没有断开的白圆点；
  空状态只显示小「＋」；长文受限预览，点开编辑；360/390/430 宽测无内容/短句/长句/表情/长名字。
- **书友圈发布越界（六）**：顶部一行「头像 + 搜索框 + 黑色发布按钮」，发布按钮右半截被屏幕裁掉。
  → 容器不写死宽度，搜索区可收缩，发布按钮完整同一行（极窄可改图标或搜索下移），不能用 overflow:hidden 掩盖；
  页面无横向滚动；键盘弹出时发布/保存仍可点。
- **删除与排序面板（七）**：现在是浏览器风格的删除确认；排序面板（默认/最新/热门）字小、空白巨大、每行有无意义箭头。
  先查实现（不一定是原生 select）。→ 书房自有确认弹窗（明确对象、取消/删除）；排序用紧凑锚点菜单或高度贴合三项的
  底部面板，选中勾、去掉箭头、不被 overflow 或 Dock 裁掉。
- **书友圈布局（八）**：顶部搜索 + 两排分类占很大面积，正文是一张张厚圆角大白卡片。→ 推荐/关注做主导航（短下划线），
  全部/书评/讨论做次级筛选，排序为次要入口；正文连续列表、细分隔线，去掉厚边框/大圆角/大阴影；每帖右上的 X 和禁止符号
  收进「更多」菜单（自己/他人不同）；最后一条不被 Dock 挡住。

### 4. 已保存的素材与缺失
- 气泡素材：`public/study-room/bubble/bubble-mask.png`、`bubble-rim.png`，来源说明 `public/study-room/bubble/SOURCE.md`
  （据 SOURCE.md 记录，由用户云朵原图按 alpha 裁剪缩放得到；原图直链 statically 2026-10-05 返回 404，
  用户仓库 `LinH-Pocket-YI` 的 `uploads/20261005_225043_tg4y.png` 是原图）。
- 内置书库：`public/study-room/library/<id>/`，来源与许可见 NOTICE。
- 缺失：原文提到的各张界面截图没有保存在项目里，本对话也没收到，只有上面的文字描述。

### 5. 第 2 组（分享到聊天）先读的代码
- `lib/study-room/share-to-chat.ts`：现有分享消息结构 → 改成带版本、类型、bookId/postId、标题、作者/封面、安全摘要、剧透标记。
- `components/study-room/share-sheet.tsx`：预览 → 发送 / 取消、选好友、防重复。
- `components/chat/message-bubble.tsx`（app_card 渲染）、`components/chat/chat-room.tsx`（发送、点卡片回跳、AI 读取）。
- `lib/rich-message-parser.ts`、`lib/llm-prompt-assembler.ts`、`lib/short-term-assembler.ts`：卡片怎么进角色上下文。
- `lib/tool-storage.ts`（第 567 行「查看网页」工具 = Jina Reader）、`lib/internal-capability-storage.ts`：查明为何抓了 SPA 路由 / 长域名。
- `components/study-room/study-room-app.tsx`（回跳打开书/帖子）、`study-room-book-detail.tsx`、`study-room-forum-post.tsx`（分享入口、剧透）、
  `components/study-room/spoiler.tsx`、`lib/study-room/forum.ts`、`lib/study-room/read-range.ts`（按章/选段读取）。

### 6. 后面几组的入口
- 第 3 组：`components/study-room/study-room-profile-parts.tsx`（用 bubble-mask 的气泡）、`study-room-mine.tsx`、`study-room-forum.tsx`（顶部发布栏）。
- 第 4 组：`study-room-forum.tsx`、`study-room-forum-post.tsx`、`study-room-dock.tsx`、`lib/study-room/appearance.ts`；
  用了 `confirm(` 的文件：study-room-backup / creative-editor / creative-panel / draw / forum-post / gifts / messages / notes / npc-panel / reading-memory。
- 第 5 组：`app/api/study-room/style/route.ts`、`lib/study-room/writing-styles-client.ts`、`lib/study-room/creative.ts`、
  `lib/study-room/writing-worldbook.ts`、`components/study-room/study-room-creative-editor.tsx`。
- UI 组（3、4）开工前按 CLAUDE.md 第二·五节先读 DESIGN.md 并调用 apple-ui-designer 等 Skill。

## 分组与状态

### 第 1 组：联网搜书 + 完整内置书库 —— 已完成并发布（2026-10-06，17b5d39，待真机验证）
- [x] 逐层复现：搜索请求 → 书源 → 解析 → 详情 → 导入 → 阅读，记录状态码/耗时/来源
- [x] 错误分类：无匹配 / 超时 / 响应异常（HTTP）/ 限流 / 鉴权或配置缺失 / 解析失败
- [x] 中文规范化：简繁、书名号、空格、标点；别名带作者约束，避免「呐喊→Call to Arms」刷出无关书
- [x] 来源解耦：各自超时与报错；Gutenberg 在 Vercel 上 403 时的备用路径
- [x] 维基文库目录页（如《吶喊》）导入只得到目录 → 汇总子篇正文
- [x] 导入去重：同一来源重复「开始阅读」不新建重复书
- [x] 内置书库 6–10 本中文经典（真实原文、脚本整理、来源与许可、按需加载）
- [x] 内置书接入书城搜索、书架、阅读器、进度
- [x] 验证：简爱 / 呐喊 / Jane Eyre / 不存在书名 / 书源失败 / 连续两次快速搜索；内置书开头/中间/末尾/跳章/进度
- [x] 更新日志（书房），pending 如实

### 第 2 组：书房内容分享到聊天（卡片 + AI 读取）—— 待办
指令第三节全部 8 条：结构化消息（版本/类型/bookId|postId/标题/封面作者/摘要/剧透标记）、
按 ID 读真实存储、不让网页抓取器抓 SPA 路由（HTTP 422 SubmittedDataMalformedError path=url 异常长域名）、
正式域名回跳与旧卡片兼容、角色按章/选段读取不塞整书、剧透只发安全摘要、失败提示+重试、
预览后发送/取消不发/防重复；实测普通书/帖/剧透帖/已删除/旧链接/请求失败。

### 第 3 组：头像状态气泡 + 书友圈发布越界 —— 待办
- 气泡（第五节 6 条）：头像左上、尾巴轻压头像边缘、用 `public/study-room/bubble/bubble-mask.png`（核对同款）、
  裁留白后按可见轮廓 ≈ 头像直径 1–1.25 倍；空状态小「＋」；长文受限预览；保存/清空/刷新持久化；
  360/390/430 宽验证无内容/短句/长句/表情/长名字。
- 发布越界（第六节）：顶部容器不写死宽度、搜索可收缩、发布按钮完整、无横向滚动、键盘弹出时可达。

### 第 4 组：主题纯白 + 自有选择/删除面板 + 书友圈布局重做 —— 待办
- 第四节：主体 #FFFFFF，黑/炭黑主按钮，灰作次要；绿/紫/黄/蓝点缀分类/当前项；玻璃只给 Dock/工具栏/浮层；
  保留用户壁纸/主题/夜间；「我的」动态小卡浅灰底；审计书城/书架/书桌/抽卡/书友圈/我的/各面板底色。
- 第七节：删除用书房自有确认弹窗（不用 window.confirm/alert/prompt）；排序默认/最新/热门用紧凑锚点菜单，
  选中勾、无箭头、不被 overflow/Dock 裁掉。
- 第八节：书友圈连续列表+细分隔线、推荐/关注主导航短下划线、全部/书评/讨论次级筛选、作者行、
  书籍引用可点、互动行真实计数、管理项收进更多菜单（自己/他人不同）、Dock 安全区、保留剧透/警告/中央详情/评论折叠。

### 第 5 组：文风接入核查 —— 待办
第九节：名称/ID/规则正文/保存/刷新恢复/请求 styleId/后端匹配；切换生效；默认值；
书房 AI 与角色卡 AI 写书都用对文风；写作世界书只用于写书/续写/改写；不新增潮声/旧雨/R09；
同一短任务做请求组装检查，真实模型调用受控，无配置记待验。

### 收尾（每组上线时）
类型检查、lint、`npm run check:updates`；书房与系统更新日志同步、pending 如实；
提交→合并 main→推送（不强推）→查 Vercel Production 状态、SHA、正式域名新资源。

## 第 1 组记录

**发现的问题**
- 别名把「呐喊」映射成英文译名后不带作者约束，刷出无关外文书；繁体「吶喊」「紅樓夢」搜不到。
- 任一来源超时/报错会让整次搜索失败；Gutendex 慢时拖满总超时，不会退到 OPDS。
- 维基文库目录页《吶喊》的篇目是独立页面（不是子页面），导入只得到「自序」。
- 「开始阅读」每点一次就新建一本重复的书；导入失败统一说「没有这本书」。

**修复**
- book-source.ts：normalizeQuery（简繁/书名号/空格/标点）、FailureKind 分类、每来源 SourceReport、editionLanguageLabel（外文标「英文原版」等）。
- aliases.ts：作者与中文经典别名，带作者约束。
- providers.ts：各来源独立超时；Gutendex 只占 55% 时间，超时退 OPDS。
- search 路由：返回部分失败列表；store 全部联网失败时退到内置书库匹配并说明原因。
- wikitext 路由：子页面优先，没有时取目录列表项链接；>40 篇返回 422 too_large；篇名去消歧义后缀。
- import-result.ts：书城与抽一本共用导入；按来源链接去重；失败带服务端真实原因。
- 内置书库：scripts/study-room/build-library.mjs 从中文维基文库抓真实原文（zh-hans 转换），去导航行、分章、分包，
  输出 public/study-room/library/<id>/manifest.json + part-NN.json 和 builtin-library.generated.ts；按需逐包加载。

**内置书目（8 本，约 9.4 MB）**
呐喊 15 章/7.0 万字 · 彷徨 11/7.1 万 · 朝花夕拾 12/4.1 万 · 西游记 100/71.5 万 · 红楼梦 120/86.5 万 ·
三国演义 120/59.1 万 · 儒林外史 56/32.7 万 · 聊斋志异 497 篇/48.3 万（作者自志 + 12 卷）。来源与许可见 NOTICE 与各 manifest。

**验证（本机，真实联网）**
- 内置搜索：呐喊/吶喊→呐喊；鲁迅→3 本；石头记/紅樓夢→红楼梦；Journey to the West→西游记；聊斋、三国命中；简爱、乱码不命中。
- 联网：Open Library、维基文库正常；Google Books 无 key 报「缺少配置」；Jane Eyre 保留空格；不存在书名 0 结果；
  Gutenberg 回退 OPDS 5.4 秒、Pride and Prejudice 走 Gutendex 6 条。
- wikitext：吶喊 200/15 篇/7.07 万字；彷徨 11 篇；孔乙己 单篇；紅樓夢 422 too_large；不存在 404。
- 内置正文抽查开头/中间/末尾（红楼梦末句「由来同一梦，休笑世人痴！」），无导航残留。
- tsc 仅剩 origin/main 既有的 lib/qa-chat-store.ts(610) 工坊错误（不属本批、未改）；改动文件 lint 无警告；check:updates 通过。

**未验证（写入更新日志 pending）**
- 手机上实际搜书、加书架、翻章、进度。
- Vercel 上 gutenberg.org 是否可达。
- Google Books 需配置 GOOGLE_BOOKS_API_KEY。

## 第 1 组发布收尾 + 全项目统一更新规则（2026-10-06）

**规则**：写入 CLAUDE.md 第四节「全项目统一更新规则」（每次发布的完成条件、已读规则、正式网址与部署核对）。

**实现**
- 总日志：lib/update-log/global.ts 组合函数；system-data.ts 本次发布用 includes.studyroom 并入书房条目，
  设置「更新日志」与全局弹窗读同一份（lib/update-log/system.ts 的 SYSTEM_RELEASE_LIST / latestSystemRelease）。
- 已读：lib/update-log/seen.ts；只有「知道了」写已读，「查看完整日志」/Esc 只收起；全局确认时同批书房版本一起记已读。
- 弹窗按钮改为「查看完整日志」「知道了」；设置日志页显示当前版本、发布标识、构建提交。
- /api/release：返回部署提交、总日志/书房当前发布标识，用于正式域名核对。
- scripts/check-update-log.mjs 扩展：书房同步、弹窗与总日志关联、只在「知道了」写已读、已读模拟 9 项、
  相对 origin/main 的发布标识/版本号/涉及模块。反向测试：删掉新版本、在 Esc 里写已读，都会不通过。

**发布标识**：总日志 0.6.2（system-2026-10-06-v062）includes 书房 0.7.1（studyroom-2026-10-06-v071）。
第 1 组条目从 0.7.0 移到 0.7.1，看过 0.7.0 的用户也会收到新通知。

**发布与正式域名验证**：见下方「发布结果」。

## 发布结果（2026-10-06）

- 发布提交：`17b5d39`（快进推到 main，没有强推；推送前 origin/main 是 4d0cf7c，未被覆盖）。
- Vercel Production：项目 float-0217，提交 17b5d39，状态 success（2026-10-06 13:08 UTC）。
- 正式网址 https://float-0217.vercel.app 实测：
  - `/api/release`：commit 17b5d39…、env production、总日志 0.6.2 / system-2026-10-06-v062、
    includes studyroom-2026-10-06-v071、涉及 设置/全局/书房；书房 0.7.1。
  - 首页加载的页面代码（app/page chunk）里含 `system-2026-10-06-v062`，弹窗与设置日志读的是这次发布。
  - 中文搜索：简爱 25 条（Gutenberg 可读 + Open Library）、呐喊 9 条（维基文库可读排第一）、
    Jane Eyre 22 条、Pride and Prejudice 21 条、不存在书名 0 条；都在 1–2.3 秒内返回 200。
  - Gutenberg 在 Vercel 上可用（返回可读 txt 链接）。
  - 内置书：nahan / hongloumeng / liaozhaizhiyi 目录 200，红楼梦第一部分正文 200。
  - 在线书源：维基文库《吶喊》200（约 209KB 正文汇总）、《孔乙己》200；《紅樓夢》按设计返回 422（篇数太多，提示改用内置书）。
- 缺配置：Google Books 没配 `GOOGLE_BOOKS_API_KEY`，公共额度已用完，每次搜索都显示为失败来源（其他来源不受影响）。
  需要维护者在 Vercel 环境变量里加这个密钥。
- 没有实测（仍在 pending）：手机上的弹窗弹出/确认/重弹、书城搜索与内置书阅读观感。

## 第 3/4 组记录（2026-10-06，本地提交 d8e7140，未上线）

已修：
- 主题：`lib/study-room/appearance.ts` `sanitizeState()` 把存档里的旧默认灰 `#f1f2f6` 迁回 `#ffffff`；自选色/背景图/夜间不动。
- 气泡：`study-room-profile-parts.tsx` 气泡移进头像包装 `.sr-pf-avatar-wrap` 绝对定位在头像左上（108px，窄屏 96px）；
  蒙版只取素材上部 480×226（`mask-size: 100% calc(100% * 284 / 226)`，top 对齐），裁掉独立小圆点，不拉伸；
  文字 2 行截断；按压只缩放无回弹；空状态 `.sr-pf-status-add` 小「＋」（24px，点按区 44px）。
- 书友圈：新 `components/study-room/confirm-sheet.tsx`（`ConfirmSheet` 应用内确认、`PopMenu` 锚点菜单）；
  帖子卡片改连续列表 `.sr-fpost`（4 行截断、一行书籍引用、赞/评/分享/礼物、「更多」菜单：自己=删除，书友=不感兴趣/屏蔽）；
  详情里删帖/删评/屏蔽改用 ConfirmSheet；排序改 PopMenu；次分类当前项深色胶囊；搜索 `min-width:0`、≤359px 发布只留图标。
- 我的动态浮层：`onOpenAuthor` 不再跳书友圈；评论区固定 `clamp(150px, 28dvh, 210px)` 内部滚动；回复原本已默认折叠。
- DESIGN.md 8.5 / 8.6 同步修订（气泡位置、小＋、书友圈列表、确认弹窗、浮层、页面底色）。

验证：`npx tsc --noEmit` 只剩既有的工坊错误 `lib/qa-chat-store.ts(610)`（不属本批）；改动文件 `next lint` 无警告；
`npm run check:updates` 通过（已读模拟 9/9）。没有跑本地生产构建（之前内存不足）；没有在手机或浏览器里看过真实效果。

剩余待办：
- 推送上线并在正式域名核对（见上面「状态」）。
- 第 4 组剩余：书房其他文件仍有浏览器 `confirm()`（backup、creative-editor、creative-panel、draw、gifts、messages、notes、npc-panel、reading-memory）；
  书城/书架/书桌/抽卡等各页底色真机审计。
- 第 3 组剩余：360/390/430 宽实测气泡（无内容/短句/长句/表情/长名字）与发布按钮、键盘弹出。
- 第 2 组分享、第 5 组文风：未开始。

## 下一步

先处理 d8e7140 的推送上线（需维护者放行推送权限），再从「第 2 组：书房内容分享到聊天」开始。第 2 组先读这些文件：
- lib/study-room/share-to-chat.ts（结构化分享消息）
- components/study-room/share-sheet.tsx（发送前预览、取消、防重复）
- components/study-room/study-room-app.tsx（从卡片回跳打开书/帖子）
- components/study-room/study-room-book-detail.tsx、study-room-forum-post.tsx（分享入口、剧透标记）
- components/chat/message-bubble.tsx（app_card 卡片渲染）、components/chat/chat-room.tsx（卡片发送与 AI 读取）
- 不让网页抓取器抓 SPA 路由的问题：先在 app/api 下 grep 抓取/预览相关路由再定位
