# 中文排版细节（筛选版）

改编自 anthropic-style-cn 的 typography-cn.md。只保留适用于聊天/阅读界面的部分。

## 字体栈（系统字体，不引入字体文件）

```css
--wc-font-ui: -apple-system, 'PingFang SC', 'Hiragino Sans GB',
              'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
--wc-font-serif-title: Georgia, 'Songti SC', 'STSong', 'SimSun', serif; /* 仅欢迎页标题用 */
--wc-font-mono: ui-monospace, 'SF Mono', Consolas, 'JetBrains Mono', monospace;
```

- 英文字体在前中文字体在后，unicode-range 自然分流，中英混排不割裂。
- 聊天正文一律无衬线；衬线只允许出现在欢迎页大标题。
- 霞鹜文楷：仅当用户明确要求时才考虑，且需完整字体文件或可靠系统降级，
  不能只做源码静态字子集（聊天内容是动态的）。

## 字号 / 行高 / 字重

| 用途 | size | line-height | weight |
|------|------|-------------|--------|
| 欢迎标题 | clamp(24px, 8vw, 32px) | 1.3 | 400（衬线） |
| 消息正文 | 16px | 1.75 | 400 |
| 用户消息 | 16px | 1.6 | 400 |
| 小标题/卡片标题 | 15px | 1.5 | 500 |
| UI 标签/时间 | 13px | 1.4 | 400/500 |
| 代码 | 13px | 1.6 | 400（等宽） |

- 中文标题字重 400 即有分量；需要强调用颜色（`--wc-accent`）而不是加粗到 700。
- 中文正文不小于 16px；弱化辅助文字可到 13px 但不再小。

## 排版细节

```css
.wc-prose {
  word-break: normal;
  overflow-wrap: break-word;   /* 不断词中截断，但超长 URL 可断 */
  line-break: strict;          /* 行末标点不悬空 */
  text-spacing-trim: trim-start allow-end; /* 全角标点压缩（新浏览器） */
  orphans: 2; widows: 2;
}
.wc-prose h1, .wc-prose h2, .wc-prose h3 { word-break: keep-all; }
```

- 代码块：`overflow-x: auto` + `-webkit-overflow-scrolling: touch`，
  外层不撑宽；字号 13px；复制按钮在代码块头部。
- 表格：容器 `overflow-x: auto`；表头浅底；单元格 8px 12px。
- 数字统计类文案：`font-variant-numeric: tabular-nums`。
- 中英文之间浏览器自动加 0.25em 间距，无需手动处理。

## 可访问性

- 正文对比度 ≥ 4.5:1（#141413 on #faf9f5 ≈ 15:1，达标；弱化文字只用于辅助信息）。
- 焦点环：`box-shadow: 0 0 0 3px rgba(217,119,87,0.35)`，不用默认蓝色。
- 触摸目标 ≥ 44×44px。
- `@media (prefers-reduced-motion: reduce)` 下关闭所有非必要动效。
