// lib/study-room/events.ts — 书房内部的小型事件约定（跨组件跳转用，避免层层透传 props）。
//
// 目前只有一条：阅读时选中文字后「搜索」，希望带着关键词跳到书城。

export const STUDYROOM_SEARCH_EVENT = "studyroom:search";

export type StudyRoomSearchDetail = { query: string };

export function requestSearchInStore(query: string): void {
  const value = query.trim();
  if (!value) return;
  window.dispatchEvent(new CustomEvent<StudyRoomSearchDetail>(STUDYROOM_SEARCH_EVENT, { detail: { query: value } }));
}
