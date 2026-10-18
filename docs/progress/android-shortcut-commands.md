# 安卓快捷指令 · 独立任务记录

更新时间：2026-10-18。本项与 momo / doremy / Y2K 三个来源**分开处理**，
不得因为名字相近就归到 Y2K。

## 一、来源核实结论

- 真实来源：上游原始项目 `xiaolongbao0709/ai-virtual-phone`。
- 证据 1：`lib/server/shortcut-commands.ts` 在 Float 目标仓库、momo、doremy、Y2K
  四处 **MD5 完全相同**：`e1214ebf934088597faaa11a2f93eef6`。
- 证据 2：在 momo / doremy 中执行
  `git log --diff-filter=A -- lib/server/shortcut-commands.ts` 最早提交为
  `d00b0b0 2026-08-24 xiaolongbao0709
  feat: 开源个人云离线推送与微信现实桥`。
- 证据 3：Y2K 因重新初始化仓库，只能追到 `0c841fc Initial public release of float-Yyk`，
  不代表它是作者；同哈希说明它同样来自上游。
- 结论：**快捷指令不是 Y2K 功能，也不是 momo/doremy 新增功能**，属于上游自带能力。

## 二、当前真实实现（已核实）

| 部分 | 文件 | 实际能力 |
| --- | --- | --- |
| 数据表与状态机 | `lib/server/shortcut-commands.ts` | pending / claimed / succeeded / failed / expired / cancelled |
| 创建命令 | `app/api/push/shortcut-commands/route.ts` | 登录 + Supabase 后可创建；`resultMode` 支持 none/text/image |
| 投递 | `app/api/push/shortcut-commands/deliver/`、`deliver-email/` | 推送通知或邮件两种通道 |
| 客户端 | `lib/shortcut-command-client.ts` | 创建、查询、取消、结果回填；`runUrl`（`/shortcut-run?...`）在前台直接拉起 |
| 执行页 | `app/shortcut-run/route.ts` | 把命令参数转成 iOS 快捷指令 URL，由系统打开 |
| 设置/界面 | `components/reality-bridge-app.tsx` | 现实桥里登记「快捷动作」，包含投递方式与结果模式 |

边界说明：

- 这些是 **Web/PWA + iOS 快捷指令** 能力：靠 URL scheme、通知、邮件、Supabase 队列，
  不是 Android 原生 ShortcutManager / Intent 实现。
- `android-shell/` 目前没有任何快捷指令执行代码，只有 `MainActivity.kt:307`
  把 `shortcuts://` 等自定义协议交给系统；也就是说安卓壳只能「把链接交给系统」，
  没有登记、触发并取回安卓原生快捷指令的能力。
- 因此现状是：**网页模拟 + 推送/邮件投递可用；安卓原生快捷指令未实现**。

## 三、独立 TODO（等待满足条件后再做）

1. 明确产品定义：目标平台是 Android 的「应用快捷方式 / 自动化（如 Tasker 等）」，
   还是继续沿用 iOS 快捷指令？两者 API 完全不同，不能混写。
2. 若做 Android 原生：
   - 需要在 `android-shell` 增加 ShortcutManager 登记、Intent 触发、结果回传（ActivityResult）。
   - 需要 APK 权限、前台服务或无障碍能力（视具体动作），并写清用户授权步骤。
   - 需要真机验证；浏览器/PWA 无法验证。
3. 若只做网页：保持现有 `shortcut-run` + 推送/邮件通道，界面文案不得声称
   「已在安卓原生执行」。
4. 未确认前不新增猜测性的原生代码，也不把未实现能力写成已完成。

## 四、状态

- 来源：已确认（上游 `xiaolongbao0709`，`d00b0b0`）。
- 迁移：本次不需要迁移——目标仓库本来就有。
- 待办：Android 原生快捷指令（来源已明，平台能力未实现），需用户先确认平台与动作范围。
