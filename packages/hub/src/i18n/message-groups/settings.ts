import type { LocalizedMessages } from "../types";

export const settingsNoticeMessages = {
    widgetSettingsSaveFailed: {
        en: "Failed to save widget settings: {errorMessage}",
        zh_CN: "保存组件设置失败：{errorMessage}",
        ja: "ウィジェット設定の保存に失敗しました: {errorMessage}",
    },
    globalSettingsSaveFailed: {
        en: "Failed to save global settings: {errorMessage}",
        zh_CN: "保存全局设置失败：{errorMessage}",
        ja: "グローバル設定の保存に失敗しました: {errorMessage}",
    },
    widgetSettingsLoadDefaults: {
        en: "We couldn't load this widget's saved settings, so defaults are shown.",
        zh_CN: "无法加载此组件保存的设置，因此显示默认值。",
        ja: "このウィジェットの保存済み設定を読み込めなかったため、既定値を表示しています。",
    },
    globalSettingsLoadDefaults: {
        en: "We couldn't load global settings, so defaults are shown.",
        zh_CN: "无法加载全局设置，因此显示默认值。",
        ja: "グローバル設定を読み込めなかったため、既定値を表示しています。",
    },
    settingsLoadFailedWithError: {
        en: "Failed to load settings: {errorMessage}",
        zh_CN: "加载设置失败：{errorMessage}",
        ja: "設定の読み込みに失敗しました: {errorMessage}",
    },
    widgetSettingsUnknownFields: {
        en: "Widget settings contain fields this version does not understand. They will be removed the next time widget settings are saved.",
        zh_CN: "组件设置包含此版本无法识别的字段。下次保存组件设置时，这些字段会被移除。",
        ja: "ウィジェット設定に、このバージョンでは認識できないフィールドが含まれています。次にウィジェット設定を保存すると削除されます。",
    },
    globalSettingsUnknownFields: {
        en: "Global settings contain fields this version does not understand. They will be removed the next time global settings are saved.",
        zh_CN: "全局设置包含此版本无法识别的字段。下次保存全局设置时，这些字段会被移除。",
        ja: "グローバル設定に、このバージョンでは認識できないフィールドが含まれています。次にグローバル設定を保存すると削除されます。",
    },
    widgetSettingsUnreadable: {
        en: "Widget settings could not be read. Defaults are shown; saving widget settings will replace the unreadable settings.",
        zh_CN: "无法读取组件设置。当前显示默认值；保存组件设置会替换无法读取的设置。",
        ja: "ウィジェット設定を読み取れませんでした。既定値を表示しています。保存すると読み取れない設定は置き換えられます。",
    },
    globalSettingsUnreadable: {
        en: "Global settings could not be read. Defaults are shown; saving global settings will replace the unreadable settings.",
        zh_CN: "无法读取全局设置。当前显示默认值；保存全局设置会替换无法读取的设置。",
        ja: "グローバル設定を読み取れませんでした。既定値を表示しています。保存すると読み取れない設定は置き換えられます。",
    },
} as const satisfies LocalizedMessages;

export const globalSettingsMessages = {
    overrideSection: {
        en: "Override",
        zh_CN: "覆盖",
        ja: "上書き",
    },
    widgetsLabel: {
        en: "Widgets",
        zh_CN: "组件",
        ja: "ウィジェット",
    },
    globalOverrideLabel: {
        en: "Global override",
        zh_CN: "全局覆盖",
        ja: "グローバル上書き",
    },
    globalOverrideNote: {
        en: "Temporarily override every widget without changing individual settings.",
        zh_CN: "临时覆盖所有组件，而不修改每个组件的单独设置。",
        ja: "個別設定を変更せずに、すべてのウィジェットを一時的に上書きします。",
    },
    viewOverrideSection: {
        en: "View Override",
        zh_CN: "视图覆盖",
        ja: "表示の上書き",
    },
    overrideViewLabel: {
        en: "Override view",
        zh_CN: "覆盖视图",
        ja: "表示を上書き",
    },
    themeOverrideSection: {
        en: "Theme Override",
        zh_CN: "主题覆盖",
        ja: "テーマの上書き",
    },
    overrideThemeLabel: {
        en: "Override theme",
        zh_CN: "覆盖主题",
        ja: "テーマを上書き",
    },
    colorOverrideSection: {
        en: "Color Override",
        zh_CN: "颜色覆盖",
        ja: "色の上書き",
    },
    overrideColorLabel: {
        en: "Override color",
        zh_CN: "覆盖颜色",
        ja: "色を上書き",
    },
    transparentSurfaceOverrideSection: {
        en: "Transparent Surface Override",
        zh_CN: "透明表面覆盖",
        ja: "透明サーフェスの上書き",
    },
    overrideTransparentSurfaceLabel: {
        en: "Override transparent surface",
        zh_CN: "覆盖透明表面",
        ja: "透明サーフェスを上書き",
    },
} as const satisfies LocalizedMessages;
