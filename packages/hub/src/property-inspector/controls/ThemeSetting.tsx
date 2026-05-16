import type { MetricTheme } from "../../settings/resolved-settings";
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
    return (
        <PreviewOptionSetting
            {...props}
            label="Theme"
            optionList={themeOptionList}
            buildPreviewUri={(selectedTheme) => buildMetricThemePreviewUri(selectedTheme, props.preview)}
        />
    );
}
