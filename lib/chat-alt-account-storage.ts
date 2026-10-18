import type { UserIdentity } from "@/components/settings/user-identity";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadUserIdentities } from "./settings-storage";

const CHAT_ALT_ACCOUNTS_KEY = "ai_phone_chat_alt_accounts_v1";
export const CHAT_ALT_ACCOUNTS_UPDATED_EVENT = "chat-alt-accounts-updated";

registerKvMigration(CHAT_ALT_ACCOUNTS_KEY);

export type ChatAltAccount = {
    id: string;
    /** 小号从哪个完整用户身份派生；角色与世界范围均以此身份的绑定为准。 */
    userIdentityId: string;
    nickname: string;
    gender: string;
    age: string;
    signature: string;
    /** 该小号自己的好友集合。主号通讯录不会被修改。 */
    friendCharacterIds: string[];
    createdAt: string;
    updatedAt: string;
};

function normalizeAccount(value: Partial<ChatAltAccount>): ChatAltAccount | null {
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const userIdentityId = typeof value.userIdentityId === "string" ? value.userIdentityId.trim() : "";
    if (!id || !userIdentityId) return null;
    const now = new Date().toISOString();
    return {
        id,
        userIdentityId,
        nickname: typeof value.nickname === "string" && value.nickname.trim() ? value.nickname.trim() : "未命名小号",
        gender: typeof value.gender === "string" ? value.gender.trim() : "",
        age: typeof value.age === "string" ? value.age.trim() : "",
        signature: typeof value.signature === "string" ? value.signature.trim() : "",
        friendCharacterIds: Array.from(new Set(Array.isArray(value.friendCharacterIds)
            ? value.friendCharacterIds.filter((item): item is string => typeof item === "string" && !!item.trim()).map(item => item.trim())
            : [])),
        createdAt: typeof value.createdAt === "string" && value.createdAt ? value.createdAt : now,
        updatedAt: typeof value.updatedAt === "string" && value.updatedAt ? value.updatedAt : now,
    };
}

export function loadChatAltAccounts(): ChatAltAccount[] {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(kvGet(CHAT_ALT_ACCOUNTS_KEY) || "[]") as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.map(item => normalizeAccount(item as Partial<ChatAltAccount>)).filter((item): item is ChatAltAccount => Boolean(item));
    } catch {
        return [];
    }
}

export function saveChatAltAccounts(accounts: ChatAltAccount[]): void {
    if (typeof window === "undefined") return;
    const normalized = accounts.map(item => normalizeAccount(item)).filter((item): item is ChatAltAccount => Boolean(item));
    kvSet(CHAT_ALT_ACCOUNTS_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(CHAT_ALT_ACCOUNTS_UPDATED_EVENT));
}

export function createChatAltAccount(input: Pick<ChatAltAccount, "userIdentityId" | "nickname" | "gender" | "age" | "signature">): ChatAltAccount {
    const now = new Date().toISOString();
    const account: ChatAltAccount = {
        id: `chat-alt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userIdentityId: input.userIdentityId,
        nickname: input.nickname.trim() || "未命名小号",
        gender: input.gender.trim(),
        age: input.age.trim(),
        signature: input.signature.trim(),
        friendCharacterIds: [],
        createdAt: now,
        updatedAt: now,
    };
    saveChatAltAccounts([...loadChatAltAccounts(), account]);
    return account;
}

export function findChatAltAccount(accountId?: string | null): ChatAltAccount | null {
    if (!accountId) return null;
    return loadChatAltAccounts().find(item => item.id === accountId) || null;
}

export function addChatAltAccountFriend(accountId: string, characterId: string): void {
    const accounts = loadChatAltAccounts();
    const index = accounts.findIndex(item => item.id === accountId);
    if (index < 0 || accounts[index].friendCharacterIds.includes(characterId)) return;
    accounts[index] = {
        ...accounts[index],
        friendCharacterIds: [...accounts[index].friendCharacterIds, characterId],
        updatedAt: new Date().toISOString(),
    };
    saveChatAltAccounts(accounts);
}

export function removeChatAltAccountFriend(accountId: string, characterId: string): void {
    const accounts = loadChatAltAccounts();
    const index = accounts.findIndex(item => item.id === accountId);
    if (index < 0) return;
    accounts[index] = {
        ...accounts[index],
        friendCharacterIds: accounts[index].friendCharacterIds.filter(item => item !== characterId),
        updatedAt: new Date().toISOString(),
    };
    saveChatAltAccounts(accounts);
}

/**
 * 将小号资料变成现有提示词装配器可识别的用户身份。
 * 对 AI 来说小号是另一个账号：只带小号自己的资料，不沿用主身份的头像/人设，
 * 也不在提示里说明“这是小号/主号是谁”。主身份只用于决定共享的角色与世界绑定。
 */
export function resolveChatAltAccountIdentity(accountId?: string | null): UserIdentity | null {
    const account = findChatAltAccount(accountId);
    if (!account) return null;
    const base = loadUserIdentities().find(item => item.id === account.userIdentityId);
    if (!base) return null;
    return {
        id: `chat-alt-identity:${account.id}`,
        name: account.nickname,
        gender: account.gender || "未填写",
        age: account.age || "未填写",
        bio: account.signature,
        occupation: "",
        customSettings: "",
    };
}
