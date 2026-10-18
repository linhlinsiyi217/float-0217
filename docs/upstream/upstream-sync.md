# 上游同步记录（upstream-sync）

只记录已实际执行过的同步；未执行的计划不要写成已完成。

## 2026-10-16 ~ 2026-10-18 · 首次三来源整合

| 来源 | 旧 SHA | 新 SHA | 差异摘要 | 冲突文件与处理 |
| --- | --- | --- | --- | --- |
| momo.float.phone | 无（首次） | `e455340` | 聊天小号/身份范围、剧情分线与邀请、记忆标签、头像覆盖、图片引用 | 自动合并无冲突；小号提示文案按需求删除 |
| doremy.float.phone | 无（首次） | `05b8bc5` | 通话浮层、感知、截图打卡、桌面小组件、系统日历、推送自检、安卓壳与设备动作 | 冲突：README、MainActivity.kt、app/globals.css、chat-room.tsx、phone-qa-app.tsx；保留 Float 结构与 CSS 导入顺序，追加 doremy 新能力 |
| ai-virtual-phone-Y2Kversion | 无（首次） | `3e69786` | 无共同历史，按功能手工移植 | 不 merge；逐文件复制后适配导入、类型与账号字段 |

验证与人工决定：

- 冲突时以「保留 Float 既有功能、明确接入新能力」为原则，没有静默删除功能。
- 阅读应用（components/reading/**）未移植：Float 已在 `ececef3` 用书房替换旧阅读入口。
- 关于与声明页、离线推送公告未移植：Float 已按更新日志统一入口的规则处理。
- `npm run build` 会重新生成推送/微信产物；没有提交这些构建产物改动，
  差异备份在仓库根 `build-artifacts-backup-2026-10-17.patch`（未提交）。

## 2026-10-18 · Y2K 聊天特效与 @提及补移植

| 来源 | 旧 SHA | 新 SHA | 差异摘要 | 冲突文件与处理 |
| --- | --- | --- | --- | --- |
| ai-virtual-phone-Y2Kversion | `3e69786` | `3e69786`（未更新上游） | 补齐上次未移植的 `[Echo]`/`[Love]`/`[Fireworks]` 特效、渲染器、发送手势、群聊 @提及 | 新增模块与 Float 现有 `chat-screen-effects.ts` 并存；不改动原有骰子/炸弹/emoji_rain 特效 |

## 下次同步流程（固定）

1. 在来源副本执行 `git fetch`，记录新 SHA 与提交范围（不要直接覆盖当前实现）。
2. 用 `docs/upstream/migration-map.md` 找到对应文件，只筛选与 Float 功能相关的提交。
3. 在独立同步分支或临时工作区适配；先跑 `npx tsc --noEmit`，再视范围决定是否构建。
4. 更新 `source-manifest.md` 的采用 SHA 和本文件的同步记录。
5. 不把 Float 自己的改动反向推送到来源仓库；不 force push；不自动合并 main。
