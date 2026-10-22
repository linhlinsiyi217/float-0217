// 低端设备动效降级：整页转场这类偏重的动效在低端机上直接关掉，优先保证流畅。
// 判定：CPU 逻辑核 ≤ 4 或设备内存 ≤ 3GB；取不到硬件信息时按正常设备处理。

export function prefersLiteMotion(): boolean {
    if (typeof navigator === "undefined") return false;
    const cores = navigator.hardwareConcurrency;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof cores === "number" && cores > 0 && cores <= 4) return true;
    if (typeof memory === "number" && memory > 0 && memory <= 3) return true;
    return false;
}

export function applyMotionPreference(): void {
    if (typeof document === "undefined") return;
    if (prefersLiteMotion()) document.documentElement.dataset.motion = "lite";
}
