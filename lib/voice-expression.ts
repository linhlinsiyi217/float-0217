// lib/voice-expression.ts — 语音表达标记（{voice:...}）
//
// 模型在语音台词里写 {voice:happy} 这类标记；标记原样存进语音条文字
// （历史里保留，下一轮模型还能看到自己的语气），但：
// - 界面显示、引用预览、复制时用 voiceDisplayText 去掉；
// - 合成时由 tts-service 统一处理：支持行内表达的服务商（目前是 Fish Audio）
//   转成 [cue]，其他服务商直接去掉，不会把标记念出来。
// 表达指南按服务商分开写（lib/voice-guides/*），只发给绑定了该服务商音色的角色。

import { loadBindingConfig, loadVoiceConfigs, resolveBinding } from "./settings-storage";
import { FISH_AUDIO_MODELS } from "./fish-audio-protocol";
import { fishAudioVoiceInstruction } from "./voice-guides/fish-audio";

export function supportsVoiceExpression(provider: string, model: string | undefined): boolean {
    return provider === "FishAudio" && FISH_AUDIO_MODELS.includes(model?.trim() || "");
}

/** 只给绑定了支持行内表达音色的角色生成指南；都不支持时返回空串（提示词不变）。 */
export function voiceExpressionInstruction(characterIds: string[], call = false): string {
    const bindings = loadBindingConfig();
    const configs = loadVoiceConfigs();
    const fishIds: string[] = [];
    for (const id of new Set(characterIds)) {
        const slot = resolveBinding(bindings, id, "chat");
        const config = configs.find(item => item.id === slot.voiceConfigId);
        if (!config || !config.enableTTS || !supportsVoiceExpression(config.provider, config.model)) continue;
        fishIds.push(id);
    }
    return fishIds.length ? fishAudioVoiceInstruction(fishIds, call) : "";
}

const marker = /\{voice\s*[:：]\s*([^{}]*)\}/gi;
const directionAliases: Record<string, string> = {
    "呼气": "exhales", "叹气": "sighs", "叹息": "sighs", "深吸气": "inhales deeply",
    "短停顿": "short pause", "长停顿": "long pause", "停顿": "pause",
    "低沉": "low tone", "清嗓子": "clears throat", "清嗓": "clears throat",
    "轻笑": "chuckles", "笑": "laughs", "耳语": "whispers", "喊叫": "shouting",
};

export function hasVoiceMarkers(text: string): boolean {
    return /\{voice\s*[:：]/i.test(text);
}

/** 显示用：去掉全部 {voice:...} 标记。 */
export function voiceDisplayText(text: string): string {
    if (!hasVoiceMarkers(text)) return text;
    return text.replace(marker, "").replace(/[ \t]{2,}/g, " ").trim();
}

/** 合成用：{voice:x} → [x]；无法识别的标记丢掉，绝不当台词念出来。 */
export function voiceSpeechText(text: string): string {
    if (!hasVoiceMarkers(text)) return text;
    return text.replace(marker, (_whole, direction: string) => {
        const value = direction.trim();
        const translated = directionAliases[value];
        if (translated) return `[${translated}]`;
        return /^[a-zA-Z][a-zA-Z ,'-]{0,100}$/.test(value) ? `[${value}]` : "";
    }).trim();
}

/** 按服务商把带标记的文字转成真正送去合成的文字。 */
export function voiceTextForProvider(text: string, provider: string, model: string | undefined): string {
    if (!hasVoiceMarkers(text)) return text;
    return supportsVoiceExpression(provider, model) ? voiceSpeechText(text) : voiceDisplayText(text);
}
