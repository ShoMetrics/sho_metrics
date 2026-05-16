import type { TerminalThemeVariant } from "../../settings/resolved-settings";
import { terminalVariantOptionList } from "../panels/setting-options";
import { buildTerminalVariantPreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

interface TerminalVariantSettingProps extends SettingControlProps {
    readonly value: TerminalThemeVariant;
    readonly preview?: MetricPreviewInput | undefined;
    readonly onValueChange: (value: TerminalThemeVariant) => void;
}

export function TerminalVariantSetting(props: TerminalVariantSettingProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            label="Theme Variant"
            optionList={terminalVariantOptionList}
            buildPreviewUri={(variant) => buildTerminalVariantPreviewUri(variant, props.preview)}
        />
    );
}
