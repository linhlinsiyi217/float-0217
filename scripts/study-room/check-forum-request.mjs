// scripts/study-room/check-forum-request.mjs — 书友圈（论坛）请求组装检查（不调用模型、不联网）。
//
// 检查：
//  1. 论坛活人感规则、用户规则、作者资料、隐藏背景确实进入模型实际收到的 messages；
//  2. 论坛规则没有套用私聊的硬限制（固定条数、去句号、两行以内、消息气泡 JSON）；
//  3. 供应商角色适配是显式转换：Gemini 把 system 并进第一条 user，文字一个不少；
//  4. 两个真实生成入口（首页发帖、评论/回复）都走这份 builder，旧的字符串提示词已删除；
//  5. 调试日志只记元数据，不记正文。
//
// 用法：node scripts/study-room/check-forum-request.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const {
  adaptMessagesForProvider,
  buildForumCommentMessages,
  buildForumPostMessages,
  completeJsonObjects,
  forumDeadline,
  forumFeedMaxTokens,
  FORUM_HUMANLIKE_BASE,
  FORUM_PROMPT_VERSION,
  forumRequestMeta,
  forumRuleFields,
} = await import(pathToFileURL(path.join(ROOT, "lib/study-room/forum-prompt.ts")).href);

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed += 1;
};
const all = (messages) => messages.map((m) => m.content).join("\n");

// ── 测试数据（假的书友，不读任何真实数据）──
const npcA = {
  id: "npc_a",
  nickname: "灯下拾页",
  occupation: "中学物理老师",
  personality: "较真，慢热",
  readingTaste: "硬科幻、科普",
  speechStyle: "句子短，爱举例子",
  relations: "和用户在论坛里互关",
  interests: ["天文", "围棋"],
  shelfTitles: ["三体", "时间简史"],
  characterId: "char_1",
};
const npcB = { id: "npc_b", nickname: "晚风读诗", occupation: "护士", speechStyle: "温和，偶尔一句话就结束" };
const npcC = { id: "npc_c", nickname: "老周", occupation: "出租车司机", characterId: "char_1" };
const rules = {
  feedTypes: "只发书评和推荐，不发闲聊",
  feedCount: 5,
  feedScope: "不聊政治；剧透必须标出",
  searchScope: "只要与查询高度相关的",
  commentLength: "一两句话",
  commentTone: "温和但敢反驳",
  commentRelation: "把用户当熟人",
  commentFollowUp: false,
  hotTopics: "秋天读什么书",
};
const SECRET_BACKGROUND = "你的人设（只作背景，别照念）：测试专用背景 X7Q";

// 1. 首页发帖
const post = buildForumPostMessages({
  topic: { key: "t1", label: "硬科幻值不值得入坑", bookTitle: "三体" },
  participants: [npcA, npcB, npcC],
  rules,
  backgrounds: { npc_a: SECRET_BACKGROUND, npc_c: SECRET_BACKGROUND },
  recentTitles: ["已经有的一条标题"],
});
const postText = all(post);
check(post.length === 2 && post[0].role === "system" && post[1].role === "user", "首页发帖：一条 system + 一条 user");
check(post[0].content.includes(FORUM_HUMANLIKE_BASE), "首页发帖：论坛活人感规则整段进入 system");
check(post[0].content.includes("只发书评和推荐，不发闲聊"), "首页发帖：用户的「帖子类型」进入请求");
check(post[0].content.includes("一共 5 条"), "首页发帖：用户的「每次几条」进入请求");
check(post[0].content.includes("不聊政治；剧透必须标出"), "首页发帖：用户的「内容边界 / 剧透」进入请求");
check(post[0].content.includes("秋天读什么书"), "首页发帖：用户的「热门话题」进入请求");
check(post[1].content.includes("本批一共要产出 5 条"), "首页发帖：数量在任务说明里再写一遍");
for (const value of ["灯下拾页", "中学物理老师", "硬科幻、科普", "句子短，爱举例子", "和用户在论坛里互关", "天文", "时间简史", "晚风读诗", "护士"]) {
  check(post[1].content.includes(value), `首页发帖：作者资料「${value}」进入请求`);
}
check(postText.split("测试专用背景 X7Q").length - 1 === 1, "首页发帖：两位书友挂同一角色时，隐藏背景只注入一次");
check(post[1].content.includes("硬科幻值不值得入坑") && post[1].content.includes("《三体》"), "首页发帖：话题与相关书籍进入请求");
check(post[1].content.includes("已经有的一条标题"), "首页发帖：已有标题进入请求（避免撞车）");
check(/author：必须是上面某一位的昵称/.test(post[1].content) && /spoiler：布尔值/.test(post[1].content), "首页发帖：输出结构写明 author / spoiler 字段");
check(post[0].content.includes("界面会保留 AI 标识"), "首页发帖：保留 AI 标识，不冒充真人");

// 2. 评论 / 回复
const comment = buildForumCommentMessages({
  post: {
    id: "p1",
    authorId: "user",
    authorName: "我",
    title: "读完了",
    body: "结尾那段让我想了很久。",
    bookTitle: "三体",
    comments: [{ id: "c1", authorId: "npc_b", authorName: "晚风读诗", body: "我也是" }],
  },
  npc: npcA,
  rules,
  target: { id: "c1", authorId: "npc_b", authorName: "晚风读诗", body: "我也是" },
  meName: "小林",
  background: SECRET_BACKGROUND,
});
check(comment[0].content.includes(FORUM_HUMANLIKE_BASE), "评论：论坛活人感规则整段进入 system");
for (const value of ["一两句话", "温和但敢反驳", "把用户当熟人", "不允许反问"]) {
  check(comment[0].content.includes(value), `评论：用户规则「${value}」进入请求`);
}
check(comment[0].content.includes("灯下拾页") && comment[0].content.includes("句子短，爱举例子"), "评论：发言书友的身份与口吻进入请求");
check(comment[0].content.includes("测试专用背景 X7Q"), "评论：角色人设 / 世界书背景进入请求");
check(comment[0].content.includes("小林"), "评论：用户名字进入请求");
check(comment[1].content.includes("你这次是回复 晚风读诗"), "回复：回复对象进入请求");
check(comment[1].content.includes("就是你认识的这位用户"), "评论：楼主是用户本人时写明");
const allowFollowUp = buildForumCommentMessages({ post: { id: "p", authorId: "npc_b", authorName: "晚风读诗", body: "x" }, npc: npcB, rules: { ...rules, commentFollowUp: true } });
check(all(allowFollowUp).includes("允许顺着内容追问一句"), "评论：「允许追问」开关会切换请求内容");

// 3. 论坛不套私聊的硬限制
const base = FORUM_HUMANLIKE_BASE;
check(!/禁止.*句号|不要.*使用句号|每条最多两行|两三秒|每次回复\s*\d\s*条/.test(base), "论坛规则没有「禁句号 / 每条两行 / 固定等待 / 固定条数」");
check(/正常使用标点/.test(base) && /长评允许分段/.test(base), "论坛规则明确允许正常标点与长评");
check(!/气泡|bubbles?/i.test(base), "论坛规则没有私聊消息气泡 JSON");

// 4. 供应商适配：显式转换，不丢内容
const openai = adaptMessagesForProvider(post, "openai-compatible");
check(JSON.stringify(openai) === JSON.stringify(post), "OpenAI 兼容：原样透传 system + user");
const anthropic = adaptMessagesForProvider(post, "anthropic");
check(anthropic[0].role === "system" && anthropic.length === 2, "Anthropic：保留一条 system，交给公共层提到顶层 system 字段");
const gemini = adaptMessagesForProvider(post, "gemini");
check(gemini.every((m) => m.role !== "system"), "Gemini：没有 system 角色（避免连续两个 user 段被拒）");
check(gemini.length === 1 && gemini[0].content.includes(post[0].content) && gemini[0].content.includes(post[1].content), "Gemini：system 文本并进第一条 user，一个字不少");

// 5. 真实入口确实使用 builder；旧提示词已删除
const forumSrc = read("lib/study-room/forum.ts");
const socialSrc = read("lib/study-room/forum-social.ts");
check(!/buildForumPrompt\s*\(/.test(forumSrc), "旧的首页发帖字符串提示词已删除");
check(!/buildCommentPrompt\s*\(/.test(socialSrc), "旧的评论字符串提示词已删除");
const feedFn = forumSrc.slice(forumSrc.indexOf("export async function generateForumPosts"));
check(/buildForumPostMessages\(/.test(feedFn) && /forumMessagesFor\(/.test(feedFn) && /simpleLLMCall\(apiConfig, messages/.test(feedFn), "首页发帖入口：builder → 供应商适配 → simpleLLMCall");
const commentFn = socialSrc.slice(socialSrc.indexOf("export async function generateComment"));
check(/buildForumCommentMessages\(/.test(commentFn) && /forumMessagesFor\(/.test(commentFn) && /simpleLLMCall\(apiConfig, messages/.test(commentFn), "评论入口：builder → 供应商适配 → simpleLLMCall");
check(/npcHiddenContext\(npc\)/.test(commentFn), "评论入口：带上角色人设 / 世界书背景");
const feedUi = read("components/study-room/study-room-forum.tsx");
check(/generateForumPosts\([^)]*controller\.signal,\s*\{[\s\S]{0,200}rules[\s\S]{0,200}collectHiddenContexts/.test(feedUi), "界面刷新首页：把用户规则与隐藏背景传进生成");
const engine = read("components/study-room/forum-reply-engine.tsx");
check(/generateComment\([^)]*normalizeRules\(current\.rules\)[^)]*meName\)/.test(engine), "回应引擎：把合并后的用户规则与用户名传进评论生成");

// 6. 调试元数据：只有版本、来源、体积、耗时
const meta = forumRequestMeta(post, "home-feed", { npcCount: 3, ruleFields: forumRuleFields(rules), elapsedMs: 12 });
const metaText = JSON.stringify(meta);
check(meta.version === FORUM_PROMPT_VERSION && meta.source === "home-feed", "调试元数据：带提示词版本与上下文来源");
check(!metaText.includes("测试专用背景") && !metaText.includes("灯下拾页") && !metaText.includes("只发书评"), "调试元数据：不含提示词正文、人设或规则原文");
check(meta.ruleFields.includes("commentFollowUp") && meta.ruleFields.includes("feedCount"), "调试元数据：记录生效的规则字段名");

// 7. 输出预算、半截 JSON、总时长上限
check(forumFeedMaxTokens(2) < forumFeedMaxTokens(8) && forumFeedMaxTokens(8) <= 4000 && forumFeedMaxTokens(1) >= 1000, "输出上限按条数放大，并有天花板");
const truncated = '[{"author":"灯下拾页","kind":"post","body":"第一条，含 } 和 \\" 符号","spoiler":false},{"author":"晚风读诗","kind":"review","body":"第二条完整"},{"author":"老周","body":"写到一半被截';
const salvaged = completeJsonObjects(truncated);
check(salvaged.length === 2 && salvaged[0].body.includes("} 和") && salvaged[1].author === "晚风读诗", "被截断的 JSON：只保留写完整的帖子，半截那条丢弃");
const whole = '[{"author":"a","body":"1"},{"author":"b","body":"2"}]';
check(JSON.stringify(completeJsonObjects(whole)) === JSON.stringify(JSON.parse(whole)), "完整 JSON：与 JSON.parse 结果一致");
check(completeJsonObjects("没有 JSON").length === 0, "没有 JSON 时返回空，交给行解析");
check(/max_tokens:\s*forumFeedMaxTokens\(/.test(feedFn) && /forumDeadline\(signal, FORUM_FEED_TIMEOUT_MS\)/.test(feedFn), "首页发帖入口：用按条数的输出上限与总时长上限");
check(/forumDeadline\(signal, FORUM_COMMENT_TIMEOUT_MS\)/.test(commentFn), "评论入口：有总时长上限");
check(/if \(!names\.has\(author\)\) return null/.test(forumSrc), "解析：作者不在本批书友里就丢弃，不冒名");
{
  const user = new AbortController();
  const d = forumDeadline(user.signal, 60_000);
  user.abort();
  check(d.signal.aborted && !d.timedOut(), "用户点停止：请求中断，且不算超时");
  d.done();
  const t = forumDeadline(undefined, 5);
  await new Promise((r) => setTimeout(r, 30));
  check(t.signal.aborted && t.timedOut(), "超过总时长：请求中断，并能区分成「等太久」");
  t.done();
}

if (failed) {
  console.log(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log("\n书友圈请求组装检查通过（没有调用模型）");
