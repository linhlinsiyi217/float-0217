// lib/chat-screenshot.ts
// 静态聊天长图：用 Canvas 2D 直接绘制（不依赖 DOM 截图库），发布者在右侧。
// 视觉沿用聊天室 iMessage 气泡：蓝/灰圆角气泡、语音波形、表情图、转账/红包卡片、时间条。
import type { ForwardedChat, ForwardedEntry } from "./chat-forward-types";
import { forwardedEntryLayout, forwardedShowTimestamp } from "./chat-forward-native";
import { projectChatScreenshot, screenshotTitle, type ScreenshotPerspective } from "./chat-screenshot-view";
import { formatChatUiTime } from "./chat-time";
import { voiceDisplayText } from "./voice-expression";

export type { ScreenshotPerspective } from "./chat-screenshot-view";
export type ChatScreenshot = { blob: Blob; previewUrl: string; width: number; height: number; perspective: ScreenshotPerspective };

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", sans-serif';
const MAX_CSS_HEIGHT = 16000;
const MAX_PIXELS = 16_000_000;

type Rgba = string;
/** 从计算样式里取出 canvas 能用的纯色（渐变/var() 取第一个颜色值）。 */
function pickColor(value: string | undefined, fallback: Rgba): Rgba {
    if (!value) return fallback;
    const match = value.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i);
    if (!match) return fallback;
    const color = match[0];
    // 完全透明（玻璃气泡底色常见）退回到默认色
    if (/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color)) return fallback;
    return color;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const image = new Image();
        if (!src.startsWith("data:") && !src.startsWith("blob:")) image.crossOrigin = "anonymous";
        const timer = setTimeout(() => resolve(null), 8000);
        image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth ? image : null); };
        image.onerror = () => { clearTimeout(timer); resolve(null); };
        image.src = src;
    });
}

/** 中日韩逐字换行、拉丁按词换行；保留原有换行。 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
        if (!paragraph) { lines.push(""); continue; }
        const tokens = paragraph.match(/[⺀-鿿가-힯豈-﫿＀-￯]|[^\s⺀-鿿가-힯豈-﫿＀-￯]+|\s+/g) || [paragraph];
        let line = "";
        for (const token of tokens) {
            const next = line + token;
            if (ctx.measureText(next).width <= maxWidth || !line) {
                if (ctx.measureText(next).width > maxWidth && !line) {
                    // 单个超长词：按字符硬切
                    let piece = "";
                    for (const char of token) {
                        if (ctx.measureText(piece + char).width > maxWidth && piece) { lines.push(piece); piece = ""; }
                        piece += char;
                    }
                    line = piece;
                } else line = next;
            } else {
                lines.push(line.trimEnd());
                line = token.trimStart();
            }
        }
        lines.push(line.trimEnd());
    }
    return lines.slice(0, 400);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
    const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
}

type Block = {
    entry: ForwardedEntry;
    index: number;
    showTime: boolean;
    showName: boolean;
    showAvatar: boolean;
    consecutive: boolean;
    kind: "text" | "image" | "voice" | "payment" | "card";
    lines: string[];
    width: number;
    height: number;
    image?: HTMLImageElement | null;
    cardTitle?: string;
    cardSub?: string;
};

const PAD_X = 16;
const AVATAR = 30;
const GAP_AVATAR = 8;
const BUBBLE_PAD_X = 13;
const BUBBLE_PAD_Y = 8;
const LINE = 21;
const FONT_SIZE = 15;

async function measureBlocks(ctx: CanvasRenderingContext2D, record: ForwardedChat, width: number, guard: () => void): Promise<Block[]> {
    const maxBubble = Math.round((width - PAD_X * 2 - AVATAR - GAP_AVATAR) * 0.82);
    const blocks: Block[] = [];
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    for (let index = 0; index < record.entries.length; index++) {
        guard();
        const entry = record.entries[index];
        const layout = forwardedEntryLayout(record, index);
        const base = {
            entry, index,
            showTime: forwardedShowTimestamp(entry.createdAt, record.entries[index - 1]?.createdAt),
            showName: layout.showName,
            showAvatar: layout.showAvatar,
            consecutive: layout.consecutive,
        };
        const kind = entry.kind;
        if ((kind === "image" || kind === "sticker") && entry.mediaUrl) {
            const image = await loadImage(entry.mediaUrl);
            if (image) {
                const limit = kind === "sticker" ? 120 : Math.min(maxBubble, 220);
                const scale = Math.min(limit / image.naturalWidth, (kind === "sticker" ? 120 : 280) / image.naturalHeight, 1);
                blocks.push({ ...base, kind: "image", lines: [], image, width: Math.max(40, Math.round(image.naturalWidth * scale)), height: Math.max(40, Math.round(image.naturalHeight * scale)) });
                continue;
            }
        }
        if (kind === "audio") {
            const transcript = voiceDisplayText(entry.voice?.transcript || entry.text.replace(/^\[语音条[:：]/, "").replace(/\](?:\s*\n[\s\S]*)?$/, ""));
            const showText = entry.appearance?.voiceTextVisible ? wrapText(ctx, transcript, maxBubble - BUBBLE_PAD_X * 2) : [];
            const w = showText.length ? maxBubble : 168;
            blocks.push({ ...base, kind: "voice", lines: showText, width: w, height: 38 + (showText.length ? showText.length * LINE + 8 : 0) });
            continue;
        }
        if (kind === "transfer" || kind === "red_packet") {
            ctx.font = `13px ${FONT}`;
            const note = wrapText(ctx, entry.text || (kind === "red_packet" ? "恭喜发财" : "转账"), 196).slice(0, 2);
            ctx.font = `${FONT_SIZE}px ${FONT}`;
            blocks.push({ ...base, kind: "payment", lines: note, width: 220, height: 64 + note.length * 18 });
            continue;
        }
        if (kind && kind !== "quote") {
            const title = entry.nested ? entry.nested.title
                : entry.music ? `${entry.music.title}${entry.music.artist ? " · " + entry.music.artist : ""}`
                : kind === "video" ? "视频" : kind === "image" ? "图片" : kind === "sticker" ? "表情" : "分享内容";
            const sub = entry.nested ? `聊天记录 · ${entry.nested.entries.length}条` : entry.music ? "音乐" : "";
            ctx.font = `14px ${FONT}`;
            const lines = entry.nested
                ? entry.nested.entries.slice(0, 3).map(item => `${item.speaker}：${(item.displayText ?? item.text).replace(/\s+/g, " ")}`).map(line => {
                    let cut = line;
                    while (cut.length > 1 && ctx.measureText(cut + "…").width > 200) cut = cut.slice(0, -1);
                    return cut === line ? line : cut + "…";
                })
                : [];
            ctx.font = `${FONT_SIZE}px ${FONT}`;
            blocks.push({ ...base, kind: "card", lines, cardTitle: title, cardSub: sub, width: 228, height: 30 + lines.length * 18 + (sub ? 22 : 0) + 14 });
            continue;
        }
        const text = (entry.displayText ?? entry.text).trim() || " ";
        const lines = wrapText(ctx, text, maxBubble - BUBBLE_PAD_X * 2);
        const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width), 8);
        blocks.push({ ...base, kind: "text", lines, width: Math.ceil(textWidth) + BUBBLE_PAD_X * 2, height: lines.length * LINE + BUBBLE_PAD_Y * 2 });
    }
    return blocks;
}

function drawWaveform(ctx: CanvasRenderingContext2D, x: number, y: number, ink: string, duration: number) {
    // 播放键
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(x, y - 6); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 6); ctx.closePath(); ctx.fill();
    // 波形条（与 VoiceReferenceGraphic 同样的固定节奏）
    const bars = [4, 8, 12, 7, 14, 10, 5, 11, 15, 9, 6, 12, 8, 4, 10, 13, 7, 5, 9, 6];
    let bx = x + 20;
    for (const h of bars) {
        roundRect(ctx, bx, y - h / 2, 2.4, h, 1.2);
        ctx.fill();
        bx += 4.6;
    }
    ctx.font = `13px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.max(1, Math.round(duration))}″`, bx + 6, y);
}

async function renderChatScreenshot(record: ForwardedChat, perspective: ScreenshotPerspective, guard: () => void): Promise<ChatScreenshot> {
    guard();
    if (typeof document === "undefined") throw new Error("聊天截图需要在应用页面中生成");
    const projected = projectChatScreenshot(record, perspective);
    const width = Math.round(Math.min(480, Math.max(320, record.theme?.width || 390)));
    const background = pickColor(record.theme?.background, "#ffffff");
    const ink = pickColor(record.theme?.ink, "#050505");
    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d");
    if (!mctx) throw new Error("当前浏览器不支持生成聊天截图");
    const blocks = await measureBlocks(mctx, projected, width, guard);
    const avatarImages = new Map<string, HTMLImageElement | null>();
    for (const block of blocks) {
        const src = block.entry.avatar;
        if (src && block.showAvatar && !avatarImages.has(src)) avatarImages.set(src, await loadImage(src));
    }
    guard();

    const HEADER = 64;
    let height = HEADER + 18;
    for (const block of blocks) {
        if (block.showTime) height += 34;
        height += (block.consecutive ? 3 : 12) + (block.showName ? 18 : 0) + block.height;
    }
    height += 28;
    if (height > MAX_CSS_HEIGHT || width * height > 8_000_000) throw new Error("所选聊天过长，请减少消息后分批截图");
    const ratio = Math.min(2, MAX_CSS_HEIGHT / height, Math.sqrt(MAX_PIXELS / (width * height)));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持生成聊天截图");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    // 顶栏：返回箭头 + 标题 + 细分隔线
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(26, 24); ctx.lineTo(18, 32); ctx.lineTo(26, 40); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = `600 17px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let title = screenshotTitle(record, perspective);
    while (title.length > 1 && ctx.measureText(title).width > width - 110) title = title.slice(0, -1);
    ctx.fillText(title === screenshotTitle(record, perspective) ? title : title + "…", width / 2, 32);
    ctx.fillStyle = "rgba(136,136,136,.22)"; ctx.fillRect(0, HEADER, width, 0.5);
    ctx.textAlign = "left";

    let y = HEADER + 18;
    const muted = "rgba(142,142,147,1)";
    for (const block of blocks) {
        guard();
        const { entry } = block;
        const right = entry.isUser;
        if (block.showTime) {
            ctx.font = `11px ${FONT}`; ctx.fillStyle = muted; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatChatUiTime(entry.createdAt), width / 2, y + 12);
            ctx.textAlign = "left";
            y += 34;
        }
        y += block.consecutive ? 3 : 12;
        if (block.showName) {
            ctx.font = `11px ${FONT}`; ctx.fillStyle = muted; ctx.textBaseline = "top";
            ctx.fillText(entry.speaker, PAD_X + AVATAR + GAP_AVATAR + 4, y);
            y += 18;
        }
        const bubbleX = right ? width - PAD_X - AVATAR - GAP_AVATAR - block.width : PAD_X + AVATAR + GAP_AVATAR;
        const bubbleBg = pickColor(entry.appearance?.bubble["--bubble-surface-color"] || entry.appearance?.bubble.background, right ? "#38acfc" : "#e9e9eb");
        const bubbleInk = pickColor(entry.appearance?.bubble.color, right ? "#ffffff" : "#202024");
        const tailRadius: [number, number, number, number] = right ? [18, 18, block.showAvatar ? 6 : 18, 18] : [18, 18, 18, block.showAvatar ? 6 : 18];

        if (block.showAvatar) {
            const ax = right ? width - PAD_X - AVATAR : PAD_X;
            const ay = y + block.height - AVATAR;
            const image = entry.avatar ? avatarImages.get(entry.avatar) : null;
            ctx.save();
            ctx.beginPath(); ctx.arc(ax + AVATAR / 2, ay + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2); ctx.clip();
            if (image) {
                const s = Math.max(AVATAR / image.naturalWidth, AVATAR / image.naturalHeight);
                ctx.drawImage(image, ax + (AVATAR - image.naturalWidth * s) / 2, ay + (AVATAR - image.naturalHeight * s) / 2, image.naturalWidth * s, image.naturalHeight * s);
            } else {
                ctx.fillStyle = "rgba(136,136,136,.25)"; ctx.fillRect(ax, ay, AVATAR, AVATAR);
                ctx.fillStyle = ink; ctx.font = `12px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(entry.speaker.slice(0, 1), ax + AVATAR / 2, ay + AVATAR / 2);
                ctx.textAlign = "left";
            }
            ctx.restore();
        }

        if (block.kind === "image" && block.image) {
            ctx.save();
            roundRect(ctx, bubbleX, y, block.width, block.height, entry.kind === "sticker" ? 0 : 14);
            ctx.clip();
            ctx.drawImage(block.image, bubbleX, y, block.width, block.height);
            ctx.restore();
        } else if (block.kind === "payment") {
            const isRedPacket = entry.kind === "red_packet";
            const done = entry.paymentState && entry.paymentState !== "待领取";
            ctx.fillStyle = isRedPacket ? (done ? "#f6b39a" : "#f0884d") : (done ? "#f8d6a8" : "#f5a340");
            roundRect(ctx, bubbleX, y, block.width, block.height, 14); ctx.fill();
            ctx.fillStyle = "#ffffff"; ctx.textBaseline = "top";
            ctx.font = `600 16px ${FONT}`;
            ctx.fillText(isRedPacket ? "红包" : `${entry.currency || "CNY"} ${entry.amount ?? 0}`, bubbleX + 14, y + 12);
            ctx.font = `13px ${FONT}`;
            block.lines.forEach((line, i) => ctx.fillText(line, bubbleX + 14, y + 36 + i * 18));
            ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `11px ${FONT}`;
            ctx.fillText(`${isRedPacket ? "红包" : "转账"} · ${entry.paymentState || "待领取"}`, bubbleX + 14, y + block.height - 20);
        } else if (block.kind === "card") {
            ctx.fillStyle = right ? "rgba(56,172,252,.14)" : "rgba(136,136,136,.12)";
            roundRect(ctx, bubbleX, y, block.width, block.height, 16); ctx.fill();
            ctx.fillStyle = ink; ctx.textBaseline = "top"; ctx.font = `600 14px ${FONT}`;
            let cardTitle = block.cardTitle || "";
            while (cardTitle.length > 1 && ctx.measureText(cardTitle).width > block.width - 28) cardTitle = cardTitle.slice(0, -1);
            ctx.fillText(cardTitle, bubbleX + 14, y + 12);
            ctx.font = `12px ${FONT}`; ctx.fillStyle = muted;
            block.lines.forEach((line, i) => ctx.fillText(line, bubbleX + 14, y + 34 + i * 18));
            if (block.cardSub) {
                ctx.fillStyle = "rgba(136,136,136,.22)"; ctx.fillRect(bubbleX + 14, y + block.height - 30, block.width - 28, 0.5);
                ctx.fillStyle = muted; ctx.font = `10px ${FONT}`;
                ctx.fillText(block.cardSub, bubbleX + 14, y + block.height - 22);
            }
        } else {
            ctx.fillStyle = bubbleBg;
            roundRect(ctx, bubbleX, y, block.width, block.height, tailRadius); ctx.fill();
            if (block.kind === "voice") {
                const voiceInk = pickColor(entry.appearance?.voiceInk, right ? "#ffffff" : "#38acfc");
                const duration = entry.voice?.duration || Math.max(2, Math.ceil(voiceDisplayText(entry.voice?.transcript || "").length / 4));
                drawWaveform(ctx, bubbleX + BUBBLE_PAD_X + 2, y + 19, voiceInk, duration);
                if (block.lines.length) {
                    ctx.fillStyle = bubbleInk; ctx.font = `14px ${FONT}`; ctx.textBaseline = "top";
                    block.lines.forEach((line, i) => ctx.fillText(line, bubbleX + BUBBLE_PAD_X, y + 40 + i * LINE));
                }
            } else {
                ctx.fillStyle = bubbleInk; ctx.font = `${FONT_SIZE}px ${FONT}`; ctx.textBaseline = "top";
                block.lines.forEach((line, i) => ctx.fillText(line, bubbleX + BUBBLE_PAD_X, y + BUBBLE_PAD_Y + i * LINE + 2));
            }
        }
        y += block.height;
    }

    guard();
    const blob = await new Promise<Blob | null>(resolve => {
        try { canvas.toBlob(resolve, "image/png"); } catch { resolve(null); }
    });
    if (!blob) throw new Error("截图生成失败（可能包含无法读取的外链图片），请去掉该消息后重试");
    if (blob.size > 20 * 1024 * 1024) throw new Error("截图过大，请减少消息后分批截图");
    return { blob, previewUrl: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, perspective };
}

let screenshotQueue: Promise<void> = Promise.resolve();
/** 串行生成，避免多个长图同时占用大块画布内存。 */
export async function createChatScreenshot(record: ForwardedChat, perspective: ScreenshotPerspective, guard: () => void = () => {}): Promise<ChatScreenshot> {
    const previous = screenshotQueue;
    let release!: () => void;
    screenshotQueue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
        guard();
        return await renderChatScreenshot(record, perspective, guard);
    } finally {
        release();
    }
}

/** 存进聊天图片库（与朋友圈配图同一处），返回 asset:// 引用。 */
export async function saveChatScreenshot(image: ChatScreenshot): Promise<string> {
    if (image.blob.type !== "image/png") throw new Error("截图格式不正确");
    const { saveChatImageToIndexedDB } = await import("./chat-asset-storage");
    return "asset://" + await saveChatImageToIndexedDB(image.blob);
}
