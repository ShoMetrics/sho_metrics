import type { TerminalThemeVariant } from "../../settings/resolved-settings";
import { terminalVariantOptionList } from "../panels/setting-options";
import { buildTerminalVariantPreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { SelectSetting } from "./SelectSetting";
import type { SettingControlProps } from "./setting-control";

const VARIANT_PREVIEW_SIZE_PIXELS = 32;

interface TerminalVariantSettingProps extends SettingControlProps {
    readonly value: TerminalThemeVariant;
    readonly preview?: MetricPreviewInput | undefined;
    readonly onValueChange: (value: TerminalThemeVariant) => void;
}

export function TerminalVariantSetting(props: TerminalVariantSettingProps): React.JSX.Element {
    return (
        <SelectSetting
            {...props}
            label="Theme Variant"
            optionList={terminalVariantOptionList}
            buildOptionPreviewUri={(variant) => buildTerminalVariantPreviewUri(variant, props.preview)}
            optionPreviewSizePixels={VARIANT_PREVIEW_SIZE_PIXELS}
        />
    );
}
