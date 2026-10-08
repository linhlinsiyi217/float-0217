# 2026-10-08 书友圈：规则页、书房私信、活人感、请求提速

需求原文：`Downloads/BookRoom-Forum-Humanlike-API-Fix.txt`（2026-10-07）。发布 0.6.7 / 书房 0.7.6。

## 完成情况

1. 规则页滚动与保存：`study-room-forum-settings.tsx` + `styles/study-room.css`（`.sr-rule-body` / `.sr-rule-fields`；
   动作行样式只作用于 `.sr-rule-body > .sr-css-actions`，不改书房其他按钮行）。
2. 书房独立私信：`lib/study-room/dm.ts`（键 `ai_phone_studyroom_dm_v1`）+ `components/study-room/study-room-forum-dm.tsx`；
   不再跳宿主聊天，不复用宿主 sessionId。
3. 论坛活人感：`lib/study-room/forum-prompt.ts` 统一 builder（首页发帖、评论、回复评论）；
   `forum.ts` 的 `forumMessagesFor` 按协议做显式角色转换（Gemini 把 system 并进第一条 user）。
4. 请求：输出上限按条数（`forumFeedMaxTokens`）；截断时只保留完整对象（`completeJsonObjects`）；
   总时长上限 发帖 120s / 评论 60s（`forumDeadline`，与用户停止分开提示）；首页等待显示已等秒数。
5. 检查：`node scripts/study-room/check-forum-request.mjs`（不调用模型）。

## 没做 / 未验证

- 没有调用付费接口，没有任何实测耗时。
- 流式：`simpleLLMCall` 不支持；Anthropic `cache_control` 需要改公共层；`pushApiLog` 仍记完整 messages（公共层，约 18 个功能共用，未改）。
- ESLint：仓库没有 `eslint.config.*`，`npx eslint` 跑不起来。
- `tsc` 仅剩既有无关错误 `lib/qa-chat-store.ts(610,82)`。
- 活人感原始 `.docx` 找到但没打开（无法解析 docx），按 TXT 文字实现。
