import type { Character } from "./character-types";
import type { ChatSession } from "./chat-storage";
import { loadChatSessions } from "./chat-storage";
import { kvGet, kvSet } from "./kv-db";

// FLOT adaptation: CharacterAvatarHistoryEntry not exported by FLOT's character-types; define inline.
type CharacterAvatarHistoryEntry = { avatar: string | null; lastSelectedAt: string };
// FLOT adaptation: FLOT's ChatSession lacks characterAvatars/characterAvatarHistories;
// augment for the legacy upgrade path in appRecord (inert for FLOT sessions).
type ChatSessionWithAvatars = ChatSession & {
  characterAvatars?: Record<string, string | null>;
  characterAvatarHistories?: Record<string, CharacterAvatarHistoryEntry[]>;
};
// FLOT adaptation: permissive session shape for the public API; accepts FLOT's ChatSession.
// Intersected with Record<string, unknown> to avoid TS weak-type rejection for sessions
// that do not declare characterAvatars at all.
type AvatarSession = ({ characterAvatars?: Record<string, string | null> } & Record<string, unknown>) | null | undefined;

export const CHAT_SESSION_AVATARS_UPDATED_EVENT = "chat-session-avatars-updated";
const KEY = "chat-app-character-avatars-v1";
type AvatarRecord = { avatar: string | null; history: CharacterAvatarHistoryEntry[] };
let cachedRaw: string | null | undefined;
let cachedStore: Record<string, AvatarRecord> = {};
function readStore(): Record<string, AvatarRecord> {
    const raw = kvGet(KEY);
    if (raw === cachedRaw) return cachedStore;
    cachedRaw = raw;
    cachedStore = {};
    try {
        const parsed = JSON.parse(raw || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const [id, value] of Object.entries(parsed)) {
                const record = value as AvatarRecord | null;
                if (record && (record.avatar === null || typeof record.avatar === "string") && Array.isArray(record.history)) cachedStore[id] = record;
            }
        }
    } catch { /* Ignore invalid saved records. */ }
    return cachedStore;
}
export function saveChatAppCharacterAvatar(characterId: string, avatar: string | null, history: CharacterAvatarHistoryEntry[]) {
    kvSet(KEY, JSON.stringify({ ...readStore(), [characterId]: { avatar, history } }));
}
function appRecord(characterId: string): AvatarRecord | undefined {
    const saved = readStore()[characterId];
    if (saved) return saved;
    // Upgrade legacy per-session avatars deterministically, using the latest
    // actual avatar selection (not the session's last chat-message timestamp).
    const candidates = (loadChatSessions() as ChatSessionWithAvatars[]).filter(s => Object.prototype.hasOwnProperty.call(s.characterAvatars || {}, characterId));
    const selectedAt = (s: ChatSessionWithAvatars) => Math.max(0, ...(s.characterAvatarHistories?.[characterId] || [])
        .filter(entry => entry.avatar === s.characterAvatars?.[characterId])
        .map(entry => Date.parse(entry.lastSelectedAt) || 0));
    candidates.sort((a, b) => selectedAt(b) - selectedAt(a) || Number(!!a.isGroup) - Number(!!b.isGroup) || a.id.localeCompare(b.id));
    const source = candidates[0];
    if (!source) return;
    const record = { avatar: source.characterAvatars![characterId] ?? null, history: source.characterAvatarHistories?.[characterId] || [] };
    saveChatAppCharacterAvatar(characterId, record.avatar, record.history);
    return record;
}
export function getChatCharacterAvatar(session: AvatarSession, character: Pick<Character, "id" | "avatar"> | null | undefined): string | null {
    if (!character) return null;
    const shared = appRecord(character.id);
    const avatar = shared ? shared.avatar : Object.prototype.hasOwnProperty.call(session?.characterAvatars || {}, character.id)
        ? session!.characterAvatars![character.id] ?? null
        : null;
    // A cleared chat avatar restores the profile fallback. Read the profile last.
    return avatar?.trim() ? avatar : character.avatar || null;
}
export function getChatCharacterAvatarHistory(session: { characterAvatarHistories?: Record<string, CharacterAvatarHistoryEntry[]> } | null | undefined, characterId: string): CharacterAvatarHistoryEntry[] {
    const shared = appRecord(characterId);
    if (shared) return shared.history;
    const value = session?.characterAvatarHistories?.[characterId];
    return Array.isArray(value) ? value : [];
}
export function withChatCharacterAvatar<T extends Pick<Character, "id" | "avatar">>(session: AvatarSession, character: T): T {
    return { ...character, avatar: getChatCharacterAvatar(session, character) };
}
