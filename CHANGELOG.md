# Changelog

Float-0217 的唯一正式发布日志（人类可读）。机器读取版本见 `public/app-version.json`，
应用内展示条目见 `lib/update-log/system-data.ts`，三者的 releaseId 保持一致。
新发布倒序追加在最上面；`<commit-sha>` 占位符在构建时由 `scripts/sync-app-version.mjs` 回填。

## [1.2.1] - 2026-10-24
Release ID: `2026-10-22-7-<commit-sha>`

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
