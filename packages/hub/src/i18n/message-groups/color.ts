import type { LocalizedMessages } from "../types";

export const colorMessages = {
    colorSettingsHeading: {
        en: "Color Settings",
        zh_CN: "颜色设置",
        ja: "色設定",
    },
    rangeColorsHeading: {
        en: "Range Colors",
        zh_CN: "范围颜色",
        ja: "範囲色",
    },
    rangeColorsNote: {
        en: "Set the percentage ranges that choose low, medium, or high color.",
        zh_CN: "设置用于低、中、高颜色切换的百分比范围。",
        ja: "低・中・高の色を選ぶパーセント範囲を設定します。",
    },
    colorUploadHeading: {
        en: "Color - Upload",
        zh_CN: "颜色 - 上传",
        ja: "色 - アップロード",
    },
    colorDownloadHeading: {
        en: "Color - Download",
        zh_CN: "颜色 - 下载",
        ja: "色 - ダウンロード",
    },
    visualGuidesHeading: {
        en: "Visual Guides",
        zh_CN: "视觉辅助",
        ja: "視覚ガイド",
    },
    colorModeLabel: {
        en: "Color Mode",
        zh_CN: "颜色模式",
        ja: "カラーモード",
    },
    solidColorLabel: {
        en: "Solid Color",
        zh_CN: "纯色",
        ja: "単色",
    },
    backgroundColorLabel: {
        en: "Background Color",
        zh_CN: "背景颜色",
        ja: "背景色",
    },
    lowColorLabel: {
        en: "Low Color",
        zh_CN: "低值颜色",
        ja: "低レベルの色",
    },
    mediumColorLabel: {
        en: "Medium Color",
        zh_CN: "中值颜色",
        ja: "中間の色",
    },
    highColorLabel: {
        en: "High Color",
        zh_CN: "高值颜色",
        ja: "高レベルの色",
    },
    leftColorLabel: {
        en: "Left Color",
        zh_CN: "左侧颜色",
        ja: "左の色",
    },
    rightColorLabel: {
        en: "Right Color",
        zh_CN: "右侧颜色",
        ja: "右の色",
    },
    bottomColorLabel: {
        en: "Bottom Color",
        zh_CN: "底部颜色",
        ja: "下の色",
    },
    leftLabel: {
        en: "Left",
        zh_CN: "左侧",
        ja: "左",
    },
    rightLabel: {
        en: "Right",
        zh_CN: "右侧",
        ja: "右",
    },
    bottomLabel: {
        en: "Bottom",
        zh_CN: "底部",
        ja: "下",
    },
    gradientLabel: {
        en: "Gradient",
        zh_CN: "渐变",
        ja: "グラデーション",
    },
    smoothGradientLabel: {
        en: "Smooth gradient",
        zh_CN: "平滑渐变",
        ja: "滑らかなグラデーション",
    },
    lowEndsAtLabel: {
        en: "Low Ends At",
        zh_CN: "低值结束于",
        ja: "低範囲の終了",
    },
    highStartsAtLabel: {
        en: "High Starts At",
        zh_CN: "高值开始于",
        ja: "高範囲の開始",
    },
    phosphorLabel: {
        en: "Phosphor",
        zh_CN: "荧光色",
        ja: "蛍光色",
    },
    transparencyLabel: {
        en: "Transparency",
        zh_CN: "透明度",
        ja: "透明度",
    },
    transparentBackgroundLabel: {
        en: "Transparent background",
        zh_CN: "透明背景",
        ja: "透明背景",
    },
    transparencyNote: {
        en: "Affects theme background and chrome only. Metrics stay opaque.",
        zh_CN: "仅影响主题背景和边框。指标保持不透明。",
        ja: "テーマ背景と装飾のみに影響します。メトリクスは不透明のままです。",
    },
    transparencyPerThemeNote: {
        en: "Transparent surface settings are saved per theme.",
        zh_CN: "透明表面设置会按主题分别保存。",
        ja: "透明サーフェス設定はテーマごとに保存されます。",
    },
    backgroundOpacityLabel: {
        en: "Background Opacity",
        zh_CN: "背景不透明度",
        ja: "背景の不透明度",
    },
    textOutlineLabel: {
        en: "Text Outline",
        zh_CN: "文本描边",
        ja: "テキスト輪郭",
    },
    shapeOutlineLabel: {
        en: "Shape Outline",
        zh_CN: "形状描边",
        ja: "図形輪郭",
    },
} as const satisfies LocalizedMessages;
