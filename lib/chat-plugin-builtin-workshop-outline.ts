// lib/chat-plugin-builtin-workshop-outline.ts
// 内置插件（默认开启）：工坊对话大纲与原生吸附胶囊 · 补充能力版。
// 原始插件作者：阿念 / 小坊（V2.0-by阿念），署名按要求保留。
// 说明：工坊原生已实现大纲胶囊、大纲弹窗与"结转新会话"（components/phone-qa-app.tsx），
// 本插件不再重复挂载同一套 DOM（避免出现两个胶囊），只保留两件原生没有的补充能力：
//   1) 结转进行中时抽屉三点菜单立即收起，杜绝孤立悬浮菜单残留；
//   2) 点击大纲弹窗外部时自动收起弹窗（借原生开关按钮完成，不直接操作 React 管理的节点）。
// 首次进入工坊时自动装进插件系统；用户在插件管理页卸载后不再自动重装。

import { getInstalledChatPlugin } from "./chat-plugin-storage";
import { installChatPluginFromCode } from "./chat-plugin-loader";

export const WORKSHOP_OUTLINE_BUILTIN_ID = "workshop-outline-memory-capsule";

export const WORKSHOP_OUTLINE_PLUGIN_CODE = `
// 工坊对话大纲与原生吸附胶囊 · 补充能力版
// 原始插件作者：小坊 / 阿念（V2.0-by阿念），保留署名。
// 胶囊、大纲与结转由工坊原生提供；这里只补：结转防菜单残留 + 大纲点外收起。
export default {
  manifest: {
    id: "workshop-outline-memory-capsule",
    name: "工坊对话大纲与原生吸附胶囊",
    apiVersion: 1,
    version: "7.4.1",
    author: "小坊 / 阿念",
    description: "工坊专属补充：结转进行中防三点菜单残留；点大纲弹窗外部自动收起。胶囊与大纲由工坊原生提供。",
  },

  setup(ctx) {
    var removeCss = ctx.ui.injectCSS(
      ".qa-drawer-item.is-carrying .qa-drawer-item-menu { display: none !important; opacity: 0 !important; pointer-events: none !important; }"
    );

    // 点大纲弹窗外部时收起：模拟点击原生胶囊开关按钮，由 React 自己安全地关掉弹窗
    var handleGlobalClick = function (e) {
      var target = e.target;
      if (!target || typeof target.closest !== "function") return;
      var modal = document.querySelector(".qa-outline-modal");
      if (!modal || !modal.isConnected) return;
      if (modal.contains(target)) return;
      var toggle = document.querySelector(".qa-outline-toggle");
      if (!toggle || !toggle.isConnected || toggle.contains(target)) return;
      toggle.click();
    };
    document.addEventListener("click", handleGlobalClick, true);

    return function () {
      document.removeEventListener("click", handleGlobalClick, true);
      removeCss();
    };
  },
};
`;

const INSTALLED_FLAG = "ai_phone_builtin_plugin_workshop_outline_v1";

/** 首次进入工坊时把内置插件装进插件系统（新装默认开启）。装过一次（或被用户卸载）后不再重复安装。 */
export async function ensureBuiltinWorkshopOutlinePlugin(): Promise<void> {
    try {
        if (typeof window === "undefined") return;
        if (localStorage.getItem(INSTALLED_FLAG)) return;
        if (getInstalledChatPlugin(WORKSHOP_OUTLINE_BUILTIN_ID)) {
            localStorage.setItem(INSTALLED_FLAG, "1");
            return;
        }
        const result = await installChatPluginFromCode(WORKSHOP_OUTLINE_PLUGIN_CODE, {
            expectedId: WORKSHOP_OUTLINE_BUILTIN_ID,
        });
        if (result.ok) localStorage.setItem(INSTALLED_FLAG, "1");
    } catch {
        // 内置插件装不上不阻塞工坊，胶囊与大纲仍由原生提供
    }
}
