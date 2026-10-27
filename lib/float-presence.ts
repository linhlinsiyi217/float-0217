"use client";

// 聊天里「角色正在回复 / 线下互动中」的状态，统一登记到灵动岛状态中心；
// 回到空闲时清除，灵动岛自动恢复之前的状态。
import { clearIslandActivity, setIslandActivity } from "./island-center";

export type FloatPresenceState = "idle" | "thinking" | "offline" | "error";

export type FloatPresenceDetail = {
  state: FloatPresenceState;
  label: string;
  characterName?: string;
  sessionId?: string;
  updatedAt: number;
};

export const FLOAT_PRESENCE_EVENT = "float-presence-updated";

function activityKey(sessionId?: string) {
  return `ai-reply:${sessionId || "default"}`;
}

export function publishFloatPresence(
  state: FloatPresenceState,
  options: Partial<Omit<FloatPresenceDetail, "state" | "updatedAt">> = {},
) {
  if (typeof window === "undefined") return;
  const detail: FloatPresenceDetail = {
    state,
    label: options.label || (state === "thinking" ? "正在思考" : state === "offline" ? "线下互动中" : "刚刚活跃"),
    characterName: options.characterName,
    sessionId: options.sessionId,
    updatedAt: Date.now(),
  };
  if (state === "thinking" || state === "offline") {
    setIslandActivity({
      key: activityKey(detail.sessionId),
      kind: "ai",
      title: detail.characterName ? `${detail.characterName} ${detail.label}` : detail.label,
      detail: state === "offline" ? "线下剧情正在生成，完成后会自动收起" : "正在生成回复，完成后会自动收起",
      target: detail.sessionId ? { appId: "chat", sessionId: detail.sessionId } : undefined,
    });
  } else {
    clearIslandActivity(activityKey(detail.sessionId));
  }
  window.dispatchEvent(new CustomEvent<FloatPresenceDetail>(FLOAT_PRESENCE_EVENT, { detail }));
}
