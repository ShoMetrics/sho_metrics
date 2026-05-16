import type { TerminalThemeVariant } from "../../settings/resolved-settings";
import { SelectSetting } from "./SelectSetting";
import { terminalVariantOptionList } from "../panels/setting-options";

export function TerminalVariantSetting({
    value,
    disabled = false,
    onValueChange,
}: {
    readonly value: TerminalThemeVariant;
    readonly disabled?: boolean | undefined;
    readonly onValueChange: (value: TerminalThemeVariant) => void;
}): React.JSX.Element {
    return (
        <SelectSetting
            label="Terminal Style"
            value={value}
            optionList={terminalVariantOptionList}
            onValueChange={onValueChange}
            disabled={disabled}
        />
    );
}
