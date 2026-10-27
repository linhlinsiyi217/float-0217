"use client";

// Module-level tracker for in-flight diary generation. Generation survives the
// diary app unmounting (the async work keeps running), but component state does
// not — so re-entering the app showed no "generating" indicator. This keeps the
// in-flight set at module scope and lets the UI re-attach to it.

import { useEffect, useState } from "react";
import { clearIslandActivity, setIslandActivity } from "./island-center";

const inFlight = new Set<string>();
const listeners = new Set<() => void>();

// 后台写日记时在灵动岛显示进行中，全部写完自动收起
function syncIsland(): void {
  if (inFlight.size === 0) {
    clearIslandActivity("diary-generation");
    return;
  }
  setIslandActivity({
    key: "diary-generation",
    kind: "task",
    title: inFlight.size > 1 ? `正在写 ${inFlight.size} 篇手记` : "正在写手记",
    detail: "手记在后台生成，可以先去做别的，写好后到「手记」里查看。",
    target: { appId: "diary" },
  });
}

function emit(): void {
  syncIsland();
  listeners.forEach((listener) => {
    try { listener(); } catch { /* ignore */ }
  });
}

export function beginDiaryGeneration(characterId: string): void {
  inFlight.add(characterId);
  emit();
}

export function endDiaryGeneration(characterId: string): void {
  inFlight.delete(characterId);
  emit();
}

export function useDiaryGenerating(): string[] {
  const [ids, setIds] = useState<string[]>(() => Array.from(inFlight));
  useEffect(() => {
    const handler = () => setIds(Array.from(inFlight));
    listeners.add(handler);
    handler();
    return () => { listeners.delete(handler); };
  }, []);
  return ids;
}
