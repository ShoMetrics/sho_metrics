import type { LocalizedMessages } from "../types";

export const shellMessages = {
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

export const commonMessages = {
    metricSection: {
        en: "Metric",
        zh_CN: "指标",
        ja: "メトリクス",
    },
    appearanceViewSection: {
        en: "View",
        zh_CN: "视图",
        ja: "表示",
    },
    appearanceThemeSection: {
        en: "Theme",
        zh_CN: "主题",
        ja: "テーマ",
    },
    updateSection: {
        en: "Update",
        zh_CN: "更新",
        ja: "更新",
    },
    trendSection: {
        en: "Trend",
        zh_CN: "趋势",
        ja: "トレンド",
    },
    scaleUnitsSection: {
        en: "Scale & Units",
        zh_CN: "范围与单位",
        ja: "スケールと単位",
    },
    colorsSection: {
        en: "Colors",
        zh_CN: "颜色",
        ja: "色",
    },
    advancedSection: {
        en: "Advanced",
        zh_CN: "高级",
        ja: "詳細",
    },
    labelsSection: {
        en: "Labels",
        zh_CN: "标签",
        ja: "ラベル",
    },
    resetLabel: {
        en: "Reset",
        zh_CN: "重置",
        ja: "リセット",
    },
    viewLabel: {
        en: "View",
        zh_CN: "视图",
        ja: "表示",
    },
    themeLabel: {
        en: "Theme",
        zh_CN: "主题",
        ja: "テーマ",
    },
    viewVariantLabel: {
        en: "View Variant",
        zh_CN: "视图样式",
        ja: "表示バリアント",
    },
    themeVariantLabel: {
        en: "Theme Variant",
        zh_CN: "主题样式",
        ja: "テーマバリアント",
    },
    pollingFrequencyLabel: {
        en: "Polling Frequency",
        zh_CN: "轮询频率",
        ja: "ポーリング頻度",
    },
    unitLabel: {
        en: "Unit",
        zh_CN: "单位",
        ja: "単位",
    },
    scaleLabel: {
        en: "Scale",
        zh_CN: "范围",
        ja: "スケール",
    },
    directionLabel: {
        en: "Direction",
        zh_CN: "方向",
        ja: "方向",
    },
    volumeLabel: {
        en: "Volume",
        zh_CN: "磁盘卷",
        ja: "ボリューム",
    },
    sourceLabel: {
        en: "Source",
        zh_CN: "来源",
        ja: "ソース",
    },
    maxTempCLabel: {
        en: "Max Temp (C)",
        zh_CN: "最高温度 (C)",
        ja: "最高温度 (C)",
    },
    maxPowerWLabel: {
        en: "Max Power (W)",
        zh_CN: "最大功耗 (W)",
        ja: "最大電力 (W)",
    },
    enabledLabel: {
        en: "Enabled",
        zh_CN: "启用",
        ja: "有効",
    },
} as const satisfies LocalizedMessages;
