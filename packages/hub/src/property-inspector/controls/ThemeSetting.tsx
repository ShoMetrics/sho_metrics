import type { MetricTheme } from "../../settings/resolved-settings";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
import { themeOptionList } from "../panels/setting-options";
import { buildMetricThemePreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

interface ThemeSettingProps extends SettingControlProps {
    readonly value: MetricTheme;
    readonly preview?: MetricPreviewInput | undefined;
    readonly onValueChange: (value: MetricTheme) => void;
}

export function ThemeSetting(props: ThemeSettingProps): React.JSX.Element {
    const { t } = useI18n();

    return (
        <PreviewOptionSetting
            {...props}
            label={t(commonMessages.themeLabel)}
            optionList={localizeOptionList(t, themeOptionList, themeMessageByValue)}
            buildPreviewUri={(selectedTheme) => buildMetricThemePreviewUri(selectedTheme, props.preview)}
        />
    );
}

const themeMessageByValue = {
    flat: optionMessages.defaultOption,
    "cupertino-glass": optionMessages.cupertinoGlassStyleOption,
    "color-filled": optionMessages.colorFilledOption,
    terminal: optionMessages.terminalOption,
    "pixel-window": optionMessages.pixelWindowOption,
} as const;
