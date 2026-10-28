export const LISTENING_GLOW_MS = 2400;
export const LISTENING_APPROACH_MS = 1200;

/** 加入动效从真实加入时间续播：离开页面再回来不会从头再演一遍。 */
export function listeningEntryTiming(joined: boolean, glowAt?: number, now = Date.now()) {
    if (!joined || !glowAt) return { ready: false, animate: false, delayMs: 0 };
    const elapsed = Math.max(0, now - glowAt);
    return {
        ready: true,
        animate: elapsed < LISTENING_GLOW_MS + LISTENING_APPROACH_MS,
        delayMs: LISTENING_GLOW_MS - elapsed,
    };
}
