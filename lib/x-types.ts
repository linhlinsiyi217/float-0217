// X 应用（仿 X/Twitter）类型定义 —— 自 wanwan/js/x-page.js 迁移改写

export type XPost = {
  id: string;
  /** seed = 内置示例帖；identity = 用户身份发的帖 */
  authorKind: "seed" | "identity";
  authorIdentityId?: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  verified?: boolean;
  content: string;
  createdAt: number;
  comments: number;
  retweets: number;
  likes: number;
  views: number;
};

export type XProfile = {
  name: string;
  handle: string;
  avatarUrl?: string;
  backgroundImage?: string;
  joinYear: string;
  joinMonth: string;
  following: string;
  followers: string;
};

export type XState = {
  version: 1;
  /** 当前登录的用户身份 id */
  sessionIdentityId: string | null;
  /** 时间线帖子（全局共享，本地持久化） */
  posts: XPost[];
  /** 每个身份各自点过赞的帖子 id */
  likes: Record<string, string[]>;
  /** 每个身份各自的资料卡（头像/背景/昵称/加入时间/关注数） */
  profiles: Record<string, XProfile>;
};
