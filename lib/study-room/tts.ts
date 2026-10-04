// lib/study-room/tts.ts — 书房「AI 朗读」的播放层。
//
// 两种音色来源，都不在书房里重复配置：
//  1. 角色音色：直接用宿主机已有的角色语音绑定（resolveVoiceConfig + synthesizeSpeech）；
//  2. 基础音色：设备自带的系统语音（speechSynthesis），不需要任何密钥。
// 两者都没有时明确显示「尚未配置」，不假装合成成功。

import { loadCharacters } from "@/lib/character-storage";
import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import { loadVoiceConfigs } from "@/lib/settings-storage";
import { playAudioBlob, resolveVoiceConfig, synthesizeSpeech } from "@/lib/tts-service";

const PROGRESS_KEY = "ai_phone_studyroom_tts_progress_v1";
registerKvMigration(PROGRESS_KEY);

export type ReaderVoice = {
  id: string;
  label: string;
  kind: "system" | "character";
  /** kind="character" 时的角色 id */
  characterId?: string;
  lang?: string;
  /** 给界面看的说明，例如「来自角色卡的声音」 */
  note: string;
};

/** 系统语音（免费、无需配置）。 */
function systemVoices(): ReaderVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => /zh|cmn|yue/i.test(voice.lang))
    .map<ReaderVoice>((voice) => ({
      id: `sys:${voice.voiceURI}`,
      label: voice.name,
      kind: "system",
      lang: voice.lang,
      note: "设备自带语音",
    }));
}

/** 角色音色：只有宿主里给这个角色绑定了语音配置、且该配置可用时才算可用。 */
export function characterVoices(): ReaderVoice[] {
  const configs = loadVoiceConfigs();
  const out: ReaderVoice[] = [];
  for (const character of loadCharacters()) {
    const resolved = resolveVoiceConfig(character.id, "reading");
    if (!resolved) continue;
    if (!configs.some((config) => config.id === resolved.id)) continue;
    if (!resolved.apiKey) continue;
    out.push({
      id: `char:${character.id}`,
      label: character.name,
      kind: "character",
      characterId: character.id,
      note: "来自角色卡的音色",
    });
  }
  return out;
}

export function systemVoicesAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** 当前可用的音色清单（角色音色在前，系统语音在后）。 */
export function listReaderVoices(): ReaderVoice[] {
  return [...characterVoices(), ...systemVoices()];
}

export function pickDefaultVoice(voices: ReaderVoice[]): ReaderVoice | null {
  return voices.find((voice) => voice.kind === "character") ?? voices[0] ?? null;
}

/** 等系统语音列表就绪（Chrome 首次为空，需要等 voiceschanged）。 */
export function whenVoicesReady(callback: (voices: ReaderVoice[]) => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    callback([]);
    return () => undefined;
  }
  const emit = () => callback(listReaderVoices());
  emit();
  window.speechSynthesis.addEventListener?.("voiceschanged", emit);
  return () => window.speechSynthesis.removeEventListener?.("voiceschanged", emit);
}

export type SpeakHandle = { promise: Promise<void>; abort: () => void };

async function speakWithSystem(text: string, voice: ReaderVoice, rate: number): Promise<SpeakHandle | null> {
  if (!systemVoicesAvailable()) return null;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const uri = voice.id.startsWith("sys:") ? voice.id.slice(4) : "";
  const matched = synth.getVoices().find((item) => item.voiceURI === uri);
  if (matched) utterance.voice = matched;
  else if (voice.lang) utterance.lang = voice.lang;
  utterance.rate = Math.min(Math.max(rate, 0.5), 2.5);
  const promise = new Promise<void>((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
  });
  synth.speak(utterance);
  return {
    promise,
    abort: () => {
      try {
        synth.cancel();
      } catch {
        /* 忽略 */
      }
    },
  };
}

async function speakWithCharacter(
  text: string,
  voice: ReaderVoice,
  rate: number,
): Promise<SpeakHandle | null> {
  if (!voice.characterId) return null;
  const config = resolveVoiceConfig(voice.characterId, "reading");
  if (!config?.apiKey) return null;
  // 宿主语音配置里的语速是它自己的字段；这里只在用户明确改过倍速时传给合成器
  const tuned = rate === 1 ? config : { ...config, speechSpeed: rate };
  const blob = await synthesizeSpeech(text, tuned);
  if (!blob) return null;
  const handle = playAudioBlob(blob);
  return { promise: handle.promise, abort: handle.abort };
}

/**
 * 朗读一段文字。角色音色走宿主 TTS，基础音色走系统语音；
 * 两者都不可用时返回 null（界面据此显示「尚未配置」）。
 */
export async function speakParagraph(params: {
  text: string;
  voice: ReaderVoice;
  rate: number;
}): Promise<SpeakHandle | null> {
  const text = params.text.trim();
  if (!text) return null;
  if (params.voice.kind === "character") {
    try {
      const handle = await speakWithCharacter(text, params.voice, params.rate);
      if (handle) return handle;
    } catch {
      // 合成失败就退回系统语音（并让调用方知道当前用的是哪个音色）
    }
  }
  return speakWithSystem(text, params.voice, params.rate);
}

export function stopSpeaking(): void {
  if (systemVoicesAvailable()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* 忽略 */
    }
  }
}

// ── 断点续播：记录每本书读到哪一段 ──

export type TtsProgress = { chapterIndex: number; paragraphIndex: number; at: string };

function loadAll(): Record<string, TtsProgress> {
  try {
    const raw = kvGet(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, TtsProgress>) : {};
  } catch {
    return {};
  }
}

export function loadTtsProgress(bookId: string): TtsProgress | null {
  return loadAll()[bookId] ?? null;
}

export function saveTtsProgress(bookId: string, chapterIndex: number, paragraphIndex: number): void {
  const all = loadAll();
  kvSet(PROGRESS_KEY, JSON.stringify({ ...all, [bookId]: { chapterIndex, paragraphIndex, at: new Date().toISOString() } }));
}

// ── 白噪音：本地生成，不联网、不用音频文件 ──

export type NoiseKind = "off" | "rain" | "room";

let noiseContext: AudioContext | null = null;
let noiseSource: AudioBufferSourceNode | null = null;
let noiseGain: GainNode | null = null;

function noiseBuffer(ctx: AudioContext, kind: Exclude<NoiseKind, "off">): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (kind === "rain") {
      // 雨：高频偏亮，轻微起伏
      last = 0.85 * white + 0.15 * last;
      data[i] = last * 0.5;
    } else {
      // 室内底噪：低频偏多，接近空调声
      last = 0.97 * last + 0.03 * white;
      data[i] = last * 3.2;
    }
  }
  return buffer;
}

export function startNoise(kind: Exclude<NoiseKind, "off">, volume: number): void {
  if (typeof window === "undefined") return;
  stopNoise();
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    noiseContext = new Ctor();
    const ctx = noiseContext;
    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer(ctx, kind);
    noiseSource.loop = true;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = Math.min(Math.max(volume, 0), 1) * 0.35;
    noiseSource.connect(noiseGain).connect(ctx.destination);
    noiseSource.start();
  } catch {
    // 音频上下文不可用就静默跳过，不影响朗读
  }
}

export function setNoiseVolume(volume: number): void {
  if (noiseGain) {
    try {
      noiseGain.gain.value = Math.min(Math.max(volume, 0), 1) * 0.35;
    } catch {
      /* 忽略 */
    }
  }
}

export function stopNoise(): void {
  try {
    noiseSource?.stop();
  } catch {
    /* 忽略 */
  }
  noiseSource?.disconnect();
  noiseGain?.disconnect();
  noiseSource = null;
  noiseGain = null;
  void noiseContext?.close().catch(() => undefined);
  noiseContext = null;
}
