# 参考源清单与筛选决策记录

配置日期：2026-10-06。本记录说明每个来源实际读取了什么、采纳了什么、
为什么拒绝其余部分。冲突时按"用户截图与附件要求 > 官方品牌值 > 社区组件
经验 > 社区营销页规则"取舍，不全部叠加。

## 1. anthropics/skills · brand-guidelines（官方，Apache-2.0）

已读取：SKILL.md 全文（品牌色 + Poppins/Lora 字体说明）。
原样安装在 `.trae/skills/brand-guidelines/`。

采纳：
- 官方品牌色：dark #141413、light #faf9f5、mid gray #b0aea5、
  light gray #e8e6dc；accent orange #d97757、blue #6a9bcc、green #788c5d。
  这些作为工坊色板的权威基准。

不采纳：
- Poppins 标题/Lora 正文作为聊天 UI 必需品——附件明确：该指南是品牌辅助
  规范，不是 Claude 聊天产品 UI 图纸；中文正文用清晰无衬线。
- 该 skill 面向 python-pptx 工件的应用方式。

## 2. anthropics/skills · frontend-design（官方，Apache-2.0）

已读取：SKILL.md 全文（设计流程、AI 套路清单、动效与文案原则）。
原样安装在 `.trae/skills/frontend-design/`。

采纳：
- 计划→对照简报→实现→自审的流程。
- 动效克制原则：只留一个编排时刻；hover 全卡片动效是生成感来源。
- 文案原则：动词句式、按钮写明结果、错误态给方向。
- "用户简报锁定方向时按简报执行"——本项目的简报就是 Claude 风，
  因此"米色+陶土橙已成 AI 套路"的警惕条款不适用于本工坊。

不采纳：
- 每次输出求独特性的总体立场（工坊要稳定一致）。

## 3. TartSlayer/anthropic-style-cn（社区完整版）

已读取：SKILL.md 全文、SKILL-lite.md、references/components/chat.md 全文、
references/typography-cn.md 全文；浏览了 assets/ 与组件索引结构。
以筛选改编形式并入本 skill（未整包复制仓库文件；该仓库无 LICENSE，
避免原样分发其内容）。

采纳：
- CSS token 组织方式与色值（bg-base 系暖米色、唯一强调橙、危险红 #C0453A）。
- chat.md 的聊天组件结构：无气泡、左右分列、深色用户消息、
  工具卡片左竖条、输入容器圆角+聚焦橙环、typing 指示器、移动端抽屉。
- typography-cn.md 的中文行高 1.75、正文 ≥16px、标题字重 400、
  字体栈英文前中文后、标点压缩、word-break 规则。
- 可访问性：44px 触摸区、对比度、reduced-motion。

不采纳（附件明确筛选结论）：
- 模式系统里的"品牌增强"及营销页大留白（64px 区块间距）。
- "每次输出必须差异化、加入非标准元素（非对称分栏/突破边界）"。
- "纯色背景显得廉价"与渐变 mesh/噪点/几何纹理背景——聊天界面要干净。
- 霞鹜文楷作为聊天正文默认；Lora 正文/Poppins UI 的英文字体组合。
- Lora/Poppins/DM 系 woff2 字体文件——不引入未经确认的字体资产。

## 4. catyiqian/claude-design-style（社区简明版）

已读取：SKILL.md 全文（通用 token + 网页/PPT/海报三节）。
以筛选改编形式并入本 skill。

采纳：
- 通用色板补充：primary-dark #C4653A（hover）、暖调文字层级
  #1A1A1A/#4A4543/#9C9590（工坊映射为 #141413/#6b6860/#b0aea5）、
  暖色低透明阴影 rgba(193,165,140,0.12)、
  success sage/warning amber/error coral 的思路（工坊用官方绿 #788c5d 等）。
- 字体降级思路：不可靠获得品牌字体时用 Georgia + system-ui 组合。
- 动效基调：ease-out、短、克制；"冷静而深思熟虑"。

不采纳：
- PPT 与海报两节全部（与工坊无关）。
- 按钮圆角 24–32px（聊天输入容器实际更小，取 12–16px）。
- 示例代码中的 `transition: all`（用户约束明确禁止）。
- 8px 网格 + 64–128px 区段 padding 的营销页密度。

## 与项目既有约束的关系

- 用户界面元素约束（不引入默认灰输入框/蓝系统按钮等）继续有效；
  本规范与其一致（橙色焦点环、暖色系）。
- 玻璃效果仅用于弹窗/启动屏/语音条/表情半窗的全局规则不变；
  工坊预览中弹窗如需玻璃质感仅限弹窗。
- middleware.ts、app/api/* 后端不触碰；显示名 Claude/克克与存储键解耦。
