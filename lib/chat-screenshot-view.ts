// lib/chat-screenshot-view.ts
// 聊天长图的视角投影：发布者永远在右侧。只改渲染的左右与配色，说话人、原话、时间不变。
import type { ForwardedAppearance, ForwardedChat } from "./chat-forward-types";

export type ScreenshotPerspective = { kind: "user" } | { kind: "character"; characterId: string; name: string };

const DEFAULT_SELF: ForwardedAppearance = { bubble: { background: "#38acfc", color: "#ffffff" }, voiceInk: "#ffffff" };
const DEFAULT_OTHER: ForwardedAppearance = { bubble: { background: "#e9e9eb", color: "#202024" }, voiceInk: "#38acfc" };

export function isOwnEntry(entry: ForwardedChat["entries"][number], perspective: ScreenshotPerspective): boolean {
    if (perspective.kind === "user") return entry.isUser;
    if (entry.isUser) return false;
    return entry.speakerId ? entry.speakerId === perspective.characterId : entry.speaker === perspective.name;
}

/** 返回投影后的副本：isUser 表示「在右侧」。原记录不被修改。 */
export function projectChatScreenshot(record: ForwardedChat, perspective: ScreenshotPerspective): ForwardedChat {
    const selfTemplate = record.theme?.self || record.entries.find(item => item.isUser)?.appearance;
    const otherTemplate = record.theme?.other || record.entries.find(item => !item.isUser)?.appearance;
    return {
        ...record,
        entries: record.entries.map(entry => {
            const own = isOwnEntry(entry, perspective);
            if (own === entry.isUser) return { ...entry };
            // 换边的消息换成那一侧的气泡配色，避免「右边灰泡泡、左边蓝泡泡」
            const template = (own ? selfTemplate : otherTemplate) || (own ? DEFAULT_SELF : DEFAULT_OTHER);
            const bubble = { ...entry.appearance?.bubble };
            for (const key of ["background", "color", "borderRadius", "border", "boxShadow", "--bubble-surface-color", "--bubble-text-ink"]) {
                if (template.bubble[key]) bubble[key] = template.bubble[key];
                else delete bubble[key];
            }
            return {
                ...entry,
                isUser: own,
                appearance: {
                    bubble,
                    ...(template.surface ? { surface: template.surface } : {}),
                    voiceInk: template.voiceInk || (own ? "#ffffff" : "#38acfc"),
                    voiceTextVisible: entry.appearance?.voiceTextVisible,
                },
            };
        }),
    };
}

/** 长图顶栏标题：私聊显示「对面那个人」，群聊显示群名。 */
export function screenshotTitle(record: ForwardedChat, perspective: ScreenshotPerspective): string {
    if (record.sourceKind === "group") return record.sourceNames?.group || record.title;
    return perspective.kind === "character"
        ? record.sourceNames?.user || record.entries.find(entry => entry.isUser)?.speaker || record.title
        : record.sourceNames?.character || record.entries.find(entry => !entry.isUser)?.speaker || record.title;
}
