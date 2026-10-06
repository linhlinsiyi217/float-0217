// lib/study-room/ambient.ts — 书房阅读的「背景声音」（白噪音）与朗读音量。
//
// 白噪音：在本机用 Web Audio 实时生成，不下载、不联网、不调用模型。
// 整个书房只有一路背景声音：换一种会先停掉上一种，连点同一种不会叠出第二路。
// 朗读音量与背景音量各存各的；朗读时背景音临时降低（ducking），停下后回到用户设定值。
// 背景音乐（小手机音乐 / 网易云）还没有真实接口，见 reader-music.ts。

import { getReaderMusicController } from "./reader-music";

export type NoiseKind = "rain" | "room";

export const NOISE_LABELS: Record<NoiseKind, string> = {
  rain: "雨声",
  room: "室内底噪",
};

export type AmbientStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type AmbientState = {
  kind: NoiseKind | null;
  status: AmbientStatus;
  /** 用户设定的背景音量 0..1（朗读降低不会改这个值） */
  volume: number;
  /** 朗读音量 0..1，只作用于书房朗读 */
  readingVolume: number;
  /** 当前是否因为朗读被临时降低 */
  ducked: boolean;
  error: string | null;
};

const STORE_KEY = "studyroom_ambient_v1";
/** 生成的噪声本身偏响，按这个系数换算成实际增益 */
const GAIN_SCALE = 0.35;
/** 朗读时背景音降到用户设定值的这个比例（具体比例需求未指定，先取适中值） */
const DUCK_RATIO = 0.35;
/** 音量渐变时间常数（秒） */
const RAMP = 0.12;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function loadSaved(): { volume: number; readingVolume: number } {
  if (typeof window === "undefined") return { volume: 0.5, readingVolume: 1 };
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "null") as
      | { volume?: number; readingVolume?: number }
      | null;
    return {
      volume: raw?.volume == null ? 0.5 : clamp01(raw.volume),
      readingVolume: raw?.readingVolume == null ? 1 : clamp01(raw.readingVolume),
    };
  } catch {
    return { volume: 0.5, readingVolume: 1 };
  }
}

function save(): void {
  try {
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ volume: state.volume, readingVolume: state.readingVolume }),
    );
  } catch {
    /* 存不下就只在本次生效 */
  }
}

let state: AmbientState = { kind: null, status: "idle", volume: 0.5, readingVolume: 1, ducked: false, error: null };
let loaded = false;
const listeners = new Set<() => void>();

let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;
/** 每次开始播放递增；旧的异步启动发现编号变了就放弃，避免连点叠出多路 */
let token = 0;

function ensureLoaded(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = { ...state, ...loadSaved() };
}

function emit(next: Partial<AmbientState>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function getAmbientState(): AmbientState {
  ensureLoaded();
  return state;
}

export function subscribeAmbient(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function targetGain(): number {
  return state.volume * GAIN_SCALE * (state.ducked ? DUCK_RATIO : 1);
}

function applyGain(immediate = false): void {
  if (!gain || !ctx) return;
  try {
    const value = targetGain();
    if (immediate) gain.gain.setValueAtTime(value, ctx.currentTime);
    else gain.gain.setTargetAtTime(value, ctx.currentTime, RAMP);
  } catch {
    try {
      if (gain) gain.gain.value = targetGain();
    } catch {
      /* 忽略 */
    }
  }
}

function noiseBuffer(audio: AudioContext, kind: NoiseKind): AudioBuffer {
  const length = audio.sampleRate * 2;
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
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

function teardown(): void {
  try {
    source?.stop();
  } catch {
    /* 忽略 */
  }
  try {
    source?.disconnect();
    gain?.disconnect();
  } catch {
    /* 忽略 */
  }
  source = null;
  gain = null;
  const old = ctx;
  ctx = null;
  if (old) void old.close().catch(() => undefined);
}

/**
 * 开始播放一种白噪音（必须由用户点击触发，浏览器才允许出声）。
 * 已经在播同一种就什么也不做；在播别的就先停掉再换。
 */
export async function playNoise(kind: NoiseKind): Promise<void> {
  ensureLoaded();
  if (typeof window === "undefined") return;
  if (state.kind === kind && (state.status === "playing" || state.status === "loading")) return;
  if (state.kind === kind && state.status === "paused") {
    await resumeAmbient();
    return;
  }
  teardown();
  const mine = ++token;
  emit({ kind, status: "loading", error: null });
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    emit({ status: "error", error: "这个浏览器不支持生成背景声音。" });
    return;
  }
  try {
    const audio = new Ctor();
    ctx = audio;
    if (audio.state === "suspended") {
      await Promise.race([audio.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 800))]);
    }
    if (mine !== token) return;
    if (audio.state !== "running") {
      teardown();
      emit({ status: "error", error: "浏览器没有允许播放声音，请再点一次播放。" });
      return;
    }
    const node = audio.createBufferSource();
    node.buffer = noiseBuffer(audio, kind);
    node.loop = true;
    const level = audio.createGain();
    level.gain.value = targetGain();
    node.connect(level).connect(audio.destination);
    node.start();
    source = node;
    gain = level;
    // 系统打断（来电、切到别的应用）时如实显示为已暂停
    audio.onstatechange = () => {
      if (ctx !== audio) return;
      if (audio.state === "running" && state.status === "paused") emit({ status: "playing" });
      else if (audio.state !== "running" && state.status === "playing") emit({ status: "paused" });
    };
    emit({ status: "playing", error: null });
  } catch {
    if (mine !== token) return;
    teardown();
    emit({ status: "error", error: "背景声音没能播放，请再试一次。" });
  }
}

export async function pauseAmbient(): Promise<void> {
  if (!ctx || state.status !== "playing") return;
  try {
    await ctx.suspend();
    emit({ status: "paused" });
  } catch {
    emit({ status: "error", error: "暂停失败，可以直接点「停止」。" });
  }
}

export async function resumeAmbient(): Promise<void> {
  if (!ctx || state.status !== "paused") return;
  try {
    await ctx.resume();
    if (ctx.state === "running") emit({ status: "playing", error: null });
    else emit({ status: "error", error: "浏览器没有允许继续播放，请再点一次。" });
  } catch {
    emit({ status: "error", error: "继续播放失败，请再点一次。" });
  }
}

export function stopAmbient(): void {
  token += 1;
  teardown();
  emit({ kind: null, status: "idle", error: null });
}

/** 改背景音量：保存用户设定值；如果正在因朗读降低，会按降低后的比例生效。 */
export function setAmbientVolume(volume: number): void {
  ensureLoaded();
  emit({ volume: clamp01(volume) });
  applyGain(true);
  save();
}

export function setReadingVolume(volume: number): void {
  ensureLoaded();
  emit({ readingVolume: clamp01(volume) });
  save();
}

export function getReadingVolume(): number {
  ensureLoaded();
  return state.readingVolume;
}

/**
 * 朗读开始时 duck(true)，停下 / 暂停 / 失败时 duck(false)。
 * 只记一个开关，不累乘：连续调用多少次都只降到同一个值，恢复时回到用户设定的音量。
 */
export function duckAmbient(ducked: boolean): void {
  if (state.ducked === ducked) return;
  emit({ ducked });
  applyGain();
  getReaderMusicController().duck(ducked);
}
