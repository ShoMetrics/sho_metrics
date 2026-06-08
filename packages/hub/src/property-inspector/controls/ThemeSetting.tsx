import type { MetricTheme } from "../../settings/resolved-settings";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
import { themeOptionList } from "../panels/setting-options";
import {
    buildDenseMetricThemePreviewUri,
    buildMetricThemePreviewUri,
    type DenseMetricPreviewInput,
    type MetricPreviewInput,
} from "../previews/metric-option-preview";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

type ThemePreviewInput =
    | {
        readonly kind: "singleMetric";
        readonly input: MetricPreviewInput;
    }
    | {
        readonly kind: "denseMetric";
        readonly input: DenseMetricPreviewInput;
    };

interface ThemeSettingProps extends SettingControlProps {
    readonly value: MetricTheme;
    // Existing single-metric callers pass MetricPreviewInput directly. Keep
    // that untagged path to avoid touching every caller for symmetry; if more
    // preview shapes appear, migrate all callers to the tagged union.
    readonly preview?: ThemePreviewInput | MetricPreviewInput | undefined;
    readonly onValueChange: (value: MetricTheme) => void;
}

export function ThemeSetting(props: ThemeSettingProps): React.JSX.Element {
    const { t } = useI18n();

    return (
        <PreviewOptionSetting
            {...props}
            label={t(commonMessages.themeLabel)}
            optionList={localizeOptionList(t, themeOptionList, themeMessageByValue)}
            buildPreviewUri={(selectedTheme) => buildThemePreviewUri(selectedTheme, props.preview)}
        />
    );
}

function buildThemePreviewUri(
    selectedTheme: MetricTheme,
    preview: ThemeSettingProps["preview"],
): string {
    if (preview !== undefined && "kind" in preview) {
        return preview.kind === "denseMetric"
            ? buildDenseMetricThemePreviewUri(selectedTheme, preview.input)
            : buildMetricThemePreviewUri(selectedTheme, preview.input);
    }

    return buildMetricThemePreviewUri(selectedTheme, preview);
}

const themeMessageByValue = {
    flat: optionMessages.defaultOption,
    "cupertino-glass": optionMessages.cupertinoGlassStyleOption,
    "color-filled": optionMessages.colorFilledOption,
    terminal: optionMessages.terminalOption,
    "pixel-window": optionMessages.pixelWindowOption,
} as const;
