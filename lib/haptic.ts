// 极轻触感反馈：开关、确认、删除这类关键操作点一下给一次很短的振动。
// 不支持的设备（iOS Safari、桌面浏览器）自动静默跳过，调用方不用判断。

export function hapticTap(duration = 8): void {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    try {
        navigator.vibrate(duration);
    } catch {
        // 系统禁用振动时忽略
    }
}
