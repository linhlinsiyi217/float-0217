// lib/fish-audio-protocol.ts — Fish Audio 请求构造（浏览器与服务端中转共用）
// 只用用户选定的模型：模型不在列表 / 免费期已过时直接报错，不自动换成其他模型。

import type { VoiceApiConfig } from "./settings-types";

export const FISH_AUDIO_BASE_URL = "https://api.fish.audio/v1";
export const FISH_AUDIO_FREE_MODEL = "s2.1-pro-free";
export const FISH_AUDIO_MODELS = [FISH_AUDIO_FREE_MODEL, "s2.1-pro", "s2-pro", "drama-3"];
export const FISH_AUDIO_MODEL_OPTIONS = [
    { id: FISH_AUDIO_FREE_MODEL, name: "S2.1 Pro Free（免费期）" },
    { id: "s2.1-pro", name: "S2.1 Pro" },
    { id: "s2-pro", name: "S2 Pro" },
    { id: "drama-3", name: "Drama 3" },
];
/** 免费模型的当前免费期截止；过期后不偷偷换成付费模型。 */
export const FISH_AUDIO_FREE_UNTIL = Date.parse("2026-12-01T00:00:00Z");

export function fishAudioSpeechRequest(text: string, config: VoiceApiConfig, now = Date.now()) {
    if (!config.model || !FISH_AUDIO_MODELS.includes(config.model)) throw new Error("请选择有效的 Fish Audio 模型；不会自动使用默认模型");
    if (config.model === FISH_AUDIO_FREE_MODEL && (!Number.isFinite(now) || now >= FISH_AUDIO_FREE_UNTIL)) {
        throw new Error("Fish Audio 免费模型已到免费期截止时间；不会自动切换付费模型，请手动选择模型");
    }
    if (config.baseUrl && config.baseUrl !== FISH_AUDIO_BASE_URL) throw new Error("Fish Audio 仅支持官方接口地址");
    if (!config.apiKey?.trim()) throw new Error("Fish Audio API Key 未配置");
    if (!config.defaultVoice?.trim()) throw new Error("请填写 Fish Audio 音色 ID（reference_id）");
    return {
        url: `${FISH_AUDIO_BASE_URL}/tts`,
        headers: {
            Authorization: `Bearer ${config.apiKey.trim()}`,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
            model: config.model,
        },
        body: {
            text: fishAudioSpeechText(text),
            reference_id: config.defaultVoice.trim(),
            format: "mp3",
            sample_rate: 44100,
            mp3_bitrate: 128,
        },
    };
}

/** 把通用的英文发声提示映射成 Fish S2 的写法（[laughs] → [laughing] 等）。 */
export function fishAudioSpeechText(text: string): string {
    const aliases: Record<string, string> = {
        chuckles: "chuckling", laughs: "laughing", sighs: "sighing", whispers: "whispering",
        "clears throat": "clear throat", "short pause": "break", "long pause": "long-break",
    };
    return text.replace(/\[([a-zA-Z][a-zA-Z ,'-]{0,100})\]/g, (whole, cue: string) => {
        const alias = aliases[cue.toLowerCase()];
        return alias ? `[${alias}]` : whole;
    });
}
