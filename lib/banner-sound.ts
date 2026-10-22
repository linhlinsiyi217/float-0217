// lib/banner-sound.ts — 站内横幅提示音（任务 4）。
// 行为学曲曲 banner-core.js：Web Audio 播放；平时 suspend 省电、要响时现开；
// iOS Safari 需要一次用户手势解锁（第一次点击页面后放一帧空 buffer）；
// 链接导入的提示音只记地址，取不到/解不开自动退回内置默认音。
"use client";

import { loadNotificationPrefs, saveNotificationPrefs, loadSoundList, type ImportedSound } from "./notification-prefs";

const UNLOCK_EVENTS: Array<keyof DocumentEventMap> = ["pointerdown", "touchend", "click"];

let ctx: AudioContext | null = null;
let unlocked = false;
let armed = false;
let decodedCache: { id: string; buf: AudioBuffer } | null = null;
let failedId = ""; // 这一轮已经失败过的自定义音：直接用默认，不反复重试

function getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (ctx) return ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
        ctx = new Ctor();
    } catch {
        ctx = null;
    }
    return ctx;
}

// ── 手势解锁（iOS）：挂一次性监听，第一次点击后 resume + 放一帧空声 ──
function onGesture() {
    disarmGesture();
    if (!loadNotificationPrefs().soundEnabled) return;
    unlockAudio();
}

export function armAudioUnlock(): void {
    if (armed || typeof document === "undefined") return;
    armed = true;
    for (const type of UNLOCK_EVENTS) {
        document.addEventListener(type, onGesture, { capture: true, once: false });
    }
}

export function disarmGesture(): void {
    if (!armed || typeof document === "undefined") return;
    armed = false;
    for (const type of UNLOCK_EVENTS) {
        document.removeEventListener(type, onGesture, { capture: true });
    }
}

/** 在用户手势里调用：解锁音频上下文（iOS 必须真放一个声音才算解开）。设置页试听也走这里。 */
export function unlockAudio(): boolean {
    const audioCtx = getCtx();
    if (!audioCtx) return false;
    let ok = false;
    try {
        if (audioCtx.state !== "running") {
            const resumed = audioCtx.resume();
            if (resumed && typeof resumed.then === "function") {
                resumed.then(() => { /* 稍后可响 */ }, () => { /* 解不开就等下次手势 */ });
            }
        }
        // 空帧必须同步放在这次手势里
        const frame = audioCtx.createBuffer(1, 1, 22050);
        const src = audioCtx.createBufferSource();
        src.buffer = frame;
        src.connect(audioCtx.destination);
        src.start(0);
        ok = true;
        unlocked = true;
    } catch {
        ok = false;
    }
    return ok;
}

// ── 内置默认音：合成一记轻快的三音上行（无二进制资源） ──
function playDefaultChime(audioCtx: AudioContext): void {
    const now = audioCtx.currentTime;
    const notes = [
        { freq: 830.6, at: 0, gain: 0.16 },     // G#5
        { freq: 1108.7, at: 0.09, gain: 0.14 }, // C#6
        { freq: 1661.2, at: 0.18, gain: 0.1 },  // G#6
    ];
    for (const note of notes) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = note.freq;
        const start = now + note.at;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(note.gain, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.55);
    }
}

// ── 自定义音：dataURL / URL → ArrayBuffer → decodeAudioData ──
async function fetchArrayBuffer(url: string, timeoutMs = 12000): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.arrayBuffer();
    } finally {
        window.clearTimeout(timer);
    }
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function decode(audioCtx: AudioContext, buf: ArrayBuffer): Promise<AudioBuffer> {
    // decodeAudioData 会 detach 传入的 buffer，先复制一份
    return audioCtx.decodeAudioData(buf.slice(0));
}

function findSound(id: string): ImportedSound | null {
    return loadSoundList().find(item => item.id === id) ?? null;
}

async function loadActiveBuffer(audioCtx: AudioContext): Promise<AudioBuffer | null> {
    const prefs = loadNotificationPrefs();
    const want = prefs.activeSoundId;
    if (!want || want === failedId) return null;
    if (decodedCache && decodedCache.id === want) return decodedCache.buf;

    const item = findSound(want);
    if (!item) return null;
    try {
        const raw = item.kind === "file" && item.data
            ? dataUrlToArrayBuffer(item.data)
            : item.kind === "url" && item.url
                ? await fetchArrayBuffer(item.url)
                : null;
        if (!raw) return null;
        const buf = await decode(audioCtx, raw);
        decodedCache = { id: want, buf };
        return buf;
    } catch {
        failedId = want; // 链接失效/文件坏了：这轮退回默认，列表里由设置页标出来
        return null;
    }
}

/** 播放当前选中的提示音；自定义音取不到就退回内置默认音。声音没解锁时静默放弃（等下一次手势）。 */
export function playBannerSound(): void {
    const audioCtx = getCtx();
    if (!audioCtx) return;
    const play = () => {
        void loadActiveBuffer(audioCtx).then((buf) => {
            if (buf) {
                try {
                    const src = audioCtx.createBufferSource();
                    src.buffer = buf;
                    src.connect(audioCtx.destination);
                    src.start(0);
                    return;
                } catch { /* 落到默认音 */ }
            }
            try {
                playDefaultChime(audioCtx);
            } catch { /* 无声就算了 */ }
        });
    };
    if (audioCtx.state === "running") {
        play();
        return;
    }
    // 没解锁过：试着现开；开不成挂手势闩等下一次点击
    try {
        const resumed = audioCtx.resume();
        if (resumed && typeof resumed.then === "function") {
            resumed.then(() => { if ((audioCtx.state as string) === "running") play(); else armAudioUnlock(); }, () => armAudioUnlock());
        } else if ((audioCtx.state as string) === "running") {
            play();
        } else {
            armAudioUnlock();
        }
        if (!unlocked && (audioCtx.state as string) !== "running") armAudioUnlock();
    } catch {
        armAudioUnlock();
    }
}

/** 设置页试听：本身就是点击手势，先解锁再播。 */
export function auditionSound(id: string): void {
    const prefs = loadNotificationPrefs();
    saveNotificationPrefs({ ...prefs, activeSoundId: id });
    unlockAudio();
    playBannerSound();
}

/** 切换选中项后清掉解码缓存与失败标记。 */
export function resetBannerSoundCache(): void {
    decodedCache = null;
    failedId = "";
}
