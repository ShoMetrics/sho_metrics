import type { TerminalThemeVariant } from "../../settings/resolved-settings";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
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
    const { t } = useI18n();

    return (
        <SelectSetting
            {...props}
            label={t(commonMessages.themeVariantLabel)}
            optionList={localizeOptionList(t, terminalVariantOptionList, terminalVariantMessageByValue)}
            buildOptionPreviewUri={(variant) => buildTerminalVariantPreviewUri(variant, props.preview)}
            optionPreviewSizePixels={VARIANT_PREVIEW_SIZE_PIXELS}
        />
    );
}

const terminalVariantMessageByValue = {
    clean: optionMessages.cleanOption,
    vintage: optionMessages.vintageOption,
} as const;
