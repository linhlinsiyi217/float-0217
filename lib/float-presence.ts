"use client";

export type FloatPresenceState = "idle" | "thinking" | "offline" | "error";

export type FloatPresenceDetail = {
  state: FloatPresenceState;
  label: string;
  characterName?: string;
  sessionId?: string;
  updatedAt: number;
};

export const FLOAT_PRESENCE_EVENT = "float-presence-updated";

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
  window.dispatchEvent(new CustomEvent<FloatPresenceDetail>(FLOAT_PRESENCE_EVENT, { detail }));
}
