# Changelog

Float-0217 的唯一正式发布日志（人类可读）。机器读取版本见 `public/app-version.json`，
应用内展示条目见 `lib/update-log/system-data.ts`，三者的 releaseId 保持一致。
新发布倒序追加在最上面；`<commit-sha>` 占位符在构建时由 `scripts/sync-app-version.mjs` 回填。

## [1.2.5] - 2026-10-28
Release ID: `2026-10-28-1-<commit-sha>`

### app
- title: 音乐系统与 Y2K 最新版完全同步
  summary: 一起听、歌曲评论、悬浮播放器、播放器与歌单界面全部对齐 Y2K 最新版。
  details: 一起听可以邀请角色一起听歌，双方进度一致，聊天里会收到一起听的邀请卡片；歌曲页可以看评论、写评论；悬浮播放器支持暂停、继续、切歌、进度拖动。

- title: 桌面歌词与歌词卡片分享
  summary: 播放时可以在桌面开歌词，换歌自动滚动；聊天里可以把正在听的歌分享成歌词卡片。
  details: 桌面歌词独立开关，点一下关闭；歌词卡片在聊天里以卡片样式显示歌词。

- title: 新应用「深谈」
  summary: 深度聊天入口、会话总结、长期记忆，支持角色关系网。
  details: 桌面新增深谈应用；会话总结与长期记忆需要接口配合。

- title: 新应用「剧情」
  summary: HTML 互动剧情、主线引导，专注模式配全局白噪音。
  details: 进入剧情可开启专注模式，白噪音全局播放。

- title: 新应用「桌宠」与后台消息
  summary: 桌面上可以养桌宠，它有自己的状态、日程和通知历史。
  details: 桌宠后台定时活跃，消息进通知历史。

### content
- title: 聊天消息转发批次并入
  summary: 消息可以转发给其他角色，以只读快照气泡显示；语音消息支持表情化呈现。
  details: 转发与引用样式一致。

- title: 回忆面板与悄悄话
  summary: 聊天里可以打开回忆面板翻看大事记；角色可以和你说悄悄话。
  details: 悄悄话气泡样式与普通消息不同。

- title: 情侣页与相遇页
  summary: 联系人列表新增情侣和相遇页签，情侣关系数据单独保存。
  details: 不影响普通聊天记录。

### global
- title: 锁屏和密码彻底移除
  summary: 开机不再有锁屏和密码验证，启动后直接进入桌面；本机数据全部保留。
  details: 双击状态栏锁定、回前台重新锁定一并移除；设置里的「锁屏与开屏」入口删除。

- title: 启动画面换回最初那版
  summary: 开屏恢复成项目最初的吐司落日动画与 Klein 蓝标题，看完点按钮进主屏。
  details: 不再使用后来加的 iOS 风格进度开屏；书房 0.7.7（共读与阅读器增强）随本版一并发布。

## [1.2.1] - 2026-10-24
Release ID: `2026-10-22-7-263368d37468e76969215d46768359fa8f8f6acd`

### app
- title: 更新系统重构：每次部署自动生成新发布标识
  summary: 版本清单新增 releaseId / commitSha / releasedAt，每次生产部署都会生成新的发布标识，即使版本号没变也能检测为新版本。
  details: 构建时由 sync-app-version.mjs 注入发布标识；releaseId 优先于 commitSha、webVersion 和 versionCode 比较；设置 → 更新日志新增手动「检查更新」。

- title: 推送常驻通知文案细分与去重（安卓壳 1.2.1）
  summary: 常驻通知按真实原因区分为「未登录」「站点不可达」「在线服务未配置」三类，且同状态不重复刷新通知。
  details: PushService 把 fetchConfig 失败原因拆成 NotLoggedIn / SiteUnreachable / NotConfigured，对应三句具体文案；同文案不再重复 notify()，避免国产 ROM 反复弹 heads-up。需要安装 1.2.1(10201) APK 生效。

### global
- title: 版本清单与更新日志的缓存绕过
  summary: /app-version.json 与 /CHANGELOG.md 返回 no-store，网页拉取时叠加 no-cache 头与时间戳查询参数，Service Worker 显式排除这两个文件。
  details: 更新检测不再可能吃到旧缓存；离线时弹窗保持可关闭，不因请求失败循环重试。

- title: 更新公告五类语义色对齐
  summary: 应用功能=蓝、全局系统=紫、页面内容=绿、AI 与提示词=橙、修复与兼容=红，小面积点缀，浅色/深色主题都可读。
  details: 影响范围标签与圆点使用半透明底色适配深浅色；旧数据「提示词」键自动归入「AI 与提示词」。

### fix
- title: 手动检查更新与更新公告弹窗分离
  summary: 设置 → 更新日志提供独立的手动「检查更新」，支持检查中、已有更新、已是最新、离线、超时、失败与重试。
  details: 手动检查与公告弹窗共用同一套清单拉取与比较逻辑，但状态互相独立；公告弹窗每个 releaseId 只出现一次，点「我知道了」后才不再提示该版本。
