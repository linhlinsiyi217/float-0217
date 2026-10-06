// app/api/release/route.ts — 当前部署的发布信息（只读）。
//
// 发布后在正式域名上核对：这次部署的提交、总日志 / 书房日志的当前发布标识，
// 与全局更新弹窗、设置总日志用同一个组合函数（lib/update-log/global.ts）。不含任何密钥。

import { NextResponse } from "next/server";

// 只引纯数据，不引带浏览器存储的 system.ts / studyroom.ts
import { composeGlobalReleases } from "@/lib/update-log/global";
import { STUDYROOM_RELEASES } from "@/lib/update-log/studyroom-data";
import { SYSTEM_RELEASES } from "@/lib/update-log/system-data";

export const dynamic = "force-dynamic";

export function GET() {
  const system = composeGlobalReleases(SYSTEM_RELEASES, STUDYROOM_RELEASES)[0];
  const studyroom = STUDYROOM_RELEASES[0];
  return NextResponse.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      env: process.env.VERCEL_ENV ?? null,
      system: {
        version: system.version,
        releaseId: system.releaseId,
        includes: system.includes ?? null,
        apps: Array.from(new Set(system.entries.map((entry) => entry.app.split(" · ")[0]))),
      },
      studyroom: { version: studyroom.version, releaseId: studyroom.releaseId },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
