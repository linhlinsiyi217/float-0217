// scripts/study-room/check-writing-request.mjs — 书房写作请求组装检查（不调用模型、不联网）。
//
// 检查：内置「防八股」等写作规范确实进入书房写作请求；只在书房写作范围生效；
// 优先级说明写明用户要求 / 文风 / 世界书在前；世界书来自作品或角色的关联，不靠写作前强制选择；
// 其他应用没有引用这份规范。
//
// 用法：node scripts/study-room/check-writing-request.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const { composeWritingWorldbook, STUDYROOM_WRITING_SCOPE, WRITING_WORLDBOOK } = await import(
  pathToFileURL(path.join(ROOT, "lib/study-room/writing-worldbook.ts")).href
);

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed += 1;
};

// 1. 常驻条目（防八股两份来源）都会进入请求
const plain = composeWritingWorldbook(STUDYROOM_WRITING_SCOPE, "一个普通的日常故事");
for (const id of ["anti-cliche", "anti-template", "aesthetic-cliche", "dialogue-voice"]) {
  check(plain.ids.includes(id), `常驻条目 ${id} 进入书房写作请求`);
}
check(!/拦截指令|审美重构/.test(plain.block) && plain.block.includes("〔去套话〕"), "请求里是改写后的规则，不带来源文件名");
check(/用户本次的要求.*文风.*世界书.*> 本规范/.test(plain.block), "优先级：用户要求 > 文风 / 世界书 > 内置规范");
check(!plain.block.includes("禁止心理旁白"), "《审美重构》的意识流专属限制没有强加给所有文风");

// 2. 关键词条目按需带上，总长受预算限制
const hot = composeWritingWorldbook(STUDYROOM_WRITING_SCOPE, "两人久别重逢，他嘴硬，又吵架");
check(hot.ids.includes("armor-break") || hot.ids.includes("emotion-dynamics"), "命中关键词时带上人物情感条目");
const total = WRITING_WORLDBOOK.filter((e) => hot.ids.includes(e.id)).reduce((n, e) => n + e.content.length, 0);
check(total <= 2600, `总字数在预算内（${total} 字）`);

// 3. 范围：不是书房写作就什么都不带
check(composeWritingWorldbook("chat", "任何内容").block === "", "非书房写作范围不返回任何规则");

// 4. 请求链路：服务端文风写作、本机写作两条都带规范；世界书来自作品 / 角色关联
const route = read("app/api/study-room/style/route.ts");
check(/composeWritingWorldbook\(STUDYROOM_WRITING_SCOPE/.test(route) && /\[worldbook, styleBlock/.test(route), "内置文风写作（服务端）带上规范");
const creative = read("lib/study-room/creative.ts");
check(/buildChapterPrompt[\s\S]{0,200}writingNorms\(draft\)/.test(creative), "本机写作（无文风 / 自建文风）带上规范");
check(/resolveWriterWorldBooks\(draft\)/.test(creative) && /cocreate/.test(creative), "世界书按作品关联，否则跟随角色共创绑定");
const desk = read("components/study-room/study-room-desk-start.tsx");
check(!/WorldBookPicker|setAssistantWorldBooks/.test(desk), "开新书流程里没有世界书勾选步骤");
const editor = read("components/study-room/study-room-creative-editor.tsx");
check(/<WorldBookPicker/.test(editor), "作品「写作设置」里仍可关联 / 调整世界书");

// 5. 其他应用不引用书房写作规范
const offenders = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const stat = fs.statSync(path.join(ROOT, rel));
    if (stat.isDirectory()) walk(rel);
    else if (/\.(ts|tsx)$/.test(name) && read(rel).includes("writing-worldbook")) offenders.push(rel);
  }
};
for (const dir of ["app", "components", "lib"]) walk(dir);
const allowed = offenders.every((rel) => /study-room/.test(rel));
check(allowed, `只有书房代码引用写作规范（${offenders.join("、")}）`);

if (failed) {
  console.log(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log("\n书房写作请求组装检查通过（没有调用模型）");
