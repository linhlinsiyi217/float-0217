"use client";

import { useRef } from "react";
import type { TouchEvent } from "react";

// 底部弹出面板「下拉关闭」：只从把手（标题栏）拖，不干扰面板正文滚动。
// 向下拖动带阻尼，松手后超过阈值就滑出并关闭，没超过则回弹归位。

const CLOSE_DISTANCE = 96; // 松手时超过这个位移就关闭（px）
const MAX_DRAG = 220; // 阻尼后的最大位移，防止拖出屏幕外
const DAMPING = 0.82; // 手指位移到面板位移的阻尼系数
const SETTLE_MS = 260;

export function useSheetDragClose(onClose: () => void) {
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const startY = useRef<number | null>(null);
    const offset = useRef(0);

    const finish = () => {
        const el = sheetRef.current;
        startY.current = null;
        if (!el) return;
        el.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
        if (offset.current > CLOSE_DISTANCE) {
            el.style.transform = "translate3d(0, 100%, 0)";
            window.setTimeout(onClose, SETTLE_MS - 20);
        } else {
            el.style.transform = "";
        }
        offset.current = 0;
    };

    const dragHandlers = {
        onTouchStart: (event: TouchEvent<HTMLDivElement>) => {
            const el = sheetRef.current;
            const touch = event.touches[0];
            if (!el || !touch) return;
            startY.current = touch.clientY;
            offset.current = 0;
            el.style.transition = "none";
        },
        onTouchMove: (event: TouchEvent<HTMLDivElement>) => {
            const el = sheetRef.current;
            const touch = event.touches[0];
            if (!el || !touch || startY.current === null) return;
            const delta = touch.clientY - startY.current;
            if (delta <= 0) {
                offset.current = 0;
                el.style.transform = "";
                return;
            }
            const damped = Math.min(delta * DAMPING, MAX_DRAG);
            offset.current = damped;
            el.style.transform = `translate3d(0, ${damped}px, 0)`;
        },
        onTouchEnd: finish,
        onTouchCancel: finish,
    };

    return { sheetRef, dragHandlers };
}
