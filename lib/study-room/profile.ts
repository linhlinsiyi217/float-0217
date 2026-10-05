// lib/study-room/profile.ts — 书房里的「我」：昵称、签名、标签、头像与稳定 ID。
//
// 只保存书房自己需要的那几项；角色卡、账号等仍由宿主管理，这里不复制宿主的身份数据。

import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import { avatarFromKey, type NpcAvatar } from "./npc-avatar";

const KEY = "ai_phone_studyroom_profile_v1";
registerKvMigration(KEY);

export type UserProfile = {
  /** 稳定 ID：第一次打开书房时生成，之后不变 */
  id: string;
  /** 显示名；留空表示跟随宿主的用户身份 */
  name: string;
  signature: string;
  /** 常驻状态气泡（如「在读《简·爱》」），留空不显示 */
  status: string;
  tags: string[];
  /** 头像：生成式头像（可换） */
  avatar: NpcAvatar;
  /** 是否使用宿主用户身份的头像 */
  useHostAvatar: boolean;
  /** 自己上传的头像照片（压缩后的 data:image），优先于生成式头像与宿主头像；旧数据没有这一项 */
  avatarUrl?: string;
};

/** 状态气泡最多多少字（两三行） */
export const STATUS_MAX = 40;

function makeId(): string {
  return `uh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function loadProfile(): UserProfile {
  try {
    const raw = kvGet(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      const id = typeof parsed.id === "string" && parsed.id ? parsed.id : makeId();
      const profile: UserProfile = {
        id,
        name: typeof parsed.name === "string" ? parsed.name : "",
        signature: typeof parsed.signature === "string" ? parsed.signature : "",
        status: typeof parsed.status === "string" ? parsed.status : "",
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 6) : [],
        avatar: parsed.avatar && typeof parsed.avatar === "object"
          ? (parsed.avatar as NpcAvatar)
          : avatarFromKey(id),
        useHostAvatar: parsed.useHostAvatar === true,
        ...(typeof parsed.avatarUrl === "string" && parsed.avatarUrl.startsWith("data:image/")
          ? { avatarUrl: parsed.avatarUrl }
          : {}),
      };
      return profile;
    }
  } catch {
    // 落到默认
  }
  const id = makeId();
  const profile: UserProfile = { id, name: "", signature: "", status: "", tags: [], avatar: avatarFromKey(id), useHostAvatar: true };
  saveProfile(profile);
  return profile;
}

export function saveProfile(profile: UserProfile): void {
  kvSet(KEY, JSON.stringify(profile));
}

/** 头像地址：上传的照片 > 宿主头像（选了且有）> 生成式头像。 */
export function profileAvatarSrc(profile: UserProfile, hostAvatar: string | null | undefined, generated: string): string {
  if (profile.avatarUrl) return profile.avatarUrl;
  if (profile.useHostAvatar && hostAvatar) return hostAvatar;
  return generated;
}

/** 展示名：优先用书房里改过的名字，否则跟随宿主的用户身份。 */
export function displayName(profile: UserProfile, hostName?: string | null): string {
  return profile.name.trim() || hostName?.trim() || "我";
}
