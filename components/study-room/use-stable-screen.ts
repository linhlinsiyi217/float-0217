"use client";

import { useEffect } from "react";

const SCREEN_ROOTS = ".sr-app, .sr-reader, .sr-msg-app";

/**
 * 书房整屏不被键盘「推歪」。
 *
 * 浏览器在输入框获得焦点、键盘弹出时，会把输入框所在的祖先容器滚动到可见处——
 * 即使这些容器是 overflow:hidden（它们不能被手指滚，但能被程序滚）。
 * 书房的根节点和外层手机屏都是 overflow:hidden，被这样滚一下后整块画面偏移，
 * 两侧或底部露出桌面壁纸，看起来像容器变窄、背景错位，关掉键盘也不一定复位。
 *
 * 这里只把「书房根节点到手机屏」这一段本不该滚动的容器拉回 0，
 * 书房内部真正的滚动区（.sr-body、评论区等）不受影响。
 */
export function useStableStudyRoomScreen() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const isClipped = (el: Element) => {
      const style = window.getComputedStyle(el);
      return /hidden|clip/.test(style.overflowX + style.overflowY);
    };

    const resetChain = (from: Element | null) => {
      let el: Element | null = from;
      while (el && el !== document.body) {
        if ((el.scrollTop !== 0 || el.scrollLeft !== 0) && isClipped(el)) {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        }
        if (el.classList.contains("phone-shell")) break;
        el = el.parentElement;
      }
    };

    const resetAll = () => {
      document.querySelectorAll(SCREEN_ROOTS).forEach((root) => resetChain(root));
    };

    // 某个容器发生滚动：如果它就是书房根节点或其外层，立刻拉回
    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.matches(SCREEN_ROOTS) || target.querySelector(SCREEN_ROOTS)) {
        resetChain(target);
      }
    };

    let raf = 0;
    const schedule = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        resetAll();
      });
    };

    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.addEventListener("resize", schedule);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
}
