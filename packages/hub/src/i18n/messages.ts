import type { LocalizedMessages } from "./types";

export const appMessages = {
    widgetTab: {
        en: "Widget",
        zh_CN: "组件",
        ja: "ウィジェット",
    },
    globalTab: {
        en: "Global",
        zh_CN: "全局",
        ja: "グローバル",
    },
    settingsTabListLabel: {
        en: "Settings",
        zh_CN: "设置",
        ja: "設定",
    },
} as const satisfies LocalizedMessages;
