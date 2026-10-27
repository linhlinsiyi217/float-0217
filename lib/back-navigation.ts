// lib/back-navigation.ts — FLOT 全局返回键（浏览器返回、安卓系统返回、页面 Esc 走同一套）。
//
// 顺序：
//   1. 灵动岛展开 → 收起；
//   2. 有弹窗 / 面板 / 遮罩 → 先关掉最上面那一层（发 Esc，大部分弹窗已经监听；没关掉就点它的关闭按钮）；
//   3. 在应用的子页面 → 点该应用自己顶栏里的返回按钮（应用内返回上一级）；
//   4. 在应用首页（找不到应用内返回按钮）→ 回到 FLOT 主屏；
//   5. 已经在主屏 → 提示「再按一次返回退出」，两秒内再按才真正离开。
// 实现：页面加载时压一条历史记录，用户每按一次返回就会触发 popstate，
// 我们处理完再压回去；只在主屏连按两次时才放行。

"use client";

const SENTINEL = "__flot_back__";
const OVERLAY_SELECTOR = [
    "[role='dialog']",
    "[role='alertdialog']",
    "[aria-modal='true']",
    ".modal-overlay",
    "[class*='-backdrop']",
    "[class*='-mask']",
    "[class*='sheet-backdrop']",
    "[class*='-overlay']",
].join(",");
const BACK_BUTTON_SELECTOR = [
    "[aria-label='返回']",
    "[aria-label^='返回']",
    "[aria-label='关闭']",
    "[aria-label='后退']",
    "[data-back]",
    "[class*='back-btn']",
    "[class*='-back']",
    "[class*='btn-back']",
    // 只有左箭头图标、没写文字标签的返回按钮（lucide 图标类名）
    "button > svg.lucide-chevron-left:only-child",
    "button > svg.lucide-arrow-left:only-child",
].join(",");
/** 应用顶栏的大致范围：只在这块里找返回按钮，避免点到正文里的「返回书架」之类链接 */
const HEADER_ZONE_PX = 150;
const EXIT_WINDOW_MS = 2000;

export type BackNavigationOptions = {
    /** 手机屏幕根节点（desktop-shell 的 .phone-shell） */
    getRoot: () => HTMLElement | null;
    /** 当前打开的应用；null = 主屏 */
    getActiveApp: () => string | null;
    closeApp: () => void;
    /** 主屏上按返回时的提示 */
    notify: (text: string) => void;
};

type BackHandler = () => boolean;
const handlers: BackHandler[] = [];

/** 组件自己的返回处理（返回 true = 已处理）；后注册的先执行 */
export function registerBackHandler(handler: BackHandler): () => void {
    handlers.push(handler);
    return () => {
        const index = handlers.lastIndexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
    };
}

function isVisible(el: Element): boolean {
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05 && style.pointerEvents !== "none";
}

/** 盖住大半个屏幕的弹窗 / 遮罩才算「一层」；悬浮小窗、迷你播放器这类常驻元素不算 */
function visibleOverlays(root: HTMLElement): Element[] {
    const box = root.getBoundingClientRect();
    return Array.from(root.querySelectorAll(OVERLAY_SELECTOR)).filter((el) => {
        if (el.closest(".phone-status-bar")) return false;
        const rect = (el as HTMLElement).getBoundingClientRect();
        const modal = el.matches("[role='dialog'], [role='alertdialog'], [aria-modal='true']");
        const big = rect.width >= box.width * 0.7 && rect.height >= box.height * 0.5;
        return isVisible(el) && (big || (modal && rect.width > 160 && rect.height > 100));
    });
}

function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function clickable(el: Element): boolean {
    if (!isVisible(el)) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    const rect = (el as HTMLElement).getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return !hit || el === hit || el.contains(hit) || hit.contains(el);
}

/** 应用顶栏里的返回 / 关闭按钮（按从左到右、从上到下取第一个） */
function findHeaderBack(scope: Element, rootTop: number): HTMLElement | null {
    const candidates = Array.from(scope.querySelectorAll<HTMLElement>(BACK_BUTTON_SELECTOR))
        .map((el) => (el.matches("button, a, [role='button']") ? el : el.closest<HTMLElement>("button, a, [role='button']") ?? el))
        .filter((el, index, list) => list.indexOf(el) === index)
        .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.top - rootTop < HEADER_ZONE_PX && isVisible(el);
        })
        .sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left;
        });
    return candidates[0] ?? null;
}

function closeButtonIn(overlay: Element): HTMLElement | null {
    return (
        overlay.querySelector<HTMLElement>("[aria-label='关闭'], [aria-label='取消'], [aria-label^='关闭'], [class*='close']") ??
        null
    );
}

let busy = false;
let exitArmedAt = 0;

/** 执行一次「返回」。返回 false 表示已在主屏且确认要离开 */
export async function performBack(options: BackNavigationOptions): Promise<boolean> {
    if (busy) return true;
    busy = true;
    try {
        for (let i = handlers.length - 1; i >= 0; i -= 1) {
            if (handlers[i]()) return true;
        }
        const root = options.getRoot();
        if (!root) return true;
        const rootTop = root.getBoundingClientRect().top;

        // 1. 灵动岛展开 / 2. 弹窗：先发 Esc，看最上层有没有关掉
        const island = root.querySelector(".flot-island[data-expanded='true']");
        const before = visibleOverlays(root);
        if (island || before.length > 0) {
            const target = (document.activeElement as HTMLElement | null) ?? document.body;
            target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
            await nextFrame();
            if (island) return true;
            const after = visibleOverlays(root);
            if (after.length < before.length) return true;
            const top = after[after.length - 1];
            const close = top ? closeButtonIn(top) : null;
            if (close && clickable(close)) {
                close.click();
                return true;
            }
        }

        const active = options.getActiveApp();
        if (!active) {
            const now = Date.now();
            if (now - exitArmedAt < EXIT_WINDOW_MS) return false;
            exitArmedAt = now;
            options.notify("再按一次返回退出");
            return true;
        }

        // 3. 应用内返回上一级（应用首页的返回按钮会自己回到主屏）
        const pane = root.querySelector(".phone-app-pane:not([style*='display: none'])") ?? root;
        const back = findHeaderBack(pane, rootTop);
        if (back) {
            back.click();
            return true;
        }
        // 4. 找不到应用内返回 → 回主屏
        options.closeApp();
        return true;
    } finally {
        busy = false;
    }
}

/** 安装全局返回：返回卸载函数 */
export function installBackNavigation(options: BackNavigationOptions): () => void {
    if (typeof window === "undefined") return () => {};
    const push = () => {
        if (history.state?.[SENTINEL]) return;
        history.pushState({ ...(history.state ?? {}), [SENTINEL]: true }, "");
    };
    push();
    // 主屏连按两次后不再压回记录：下一次返回交给浏览器 / 系统真正离开。
    // 用户之后再点屏幕，就重新接管返回键。
    let released = false;
    const onPop = () => {
        void performBack(options).then((stay) => {
            if (stay) push();
            else released = true;
        });
    };
    const onPointer = () => {
        if (!released) return;
        released = false;
        push();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
        window.removeEventListener("popstate", onPop);
        window.removeEventListener("pointerdown", onPointer, true);
    };
}
