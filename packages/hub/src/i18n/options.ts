import type { SelectOption, SelectOptionValue } from "../property-inspector/inspector/types";
import { optionMessages } from "./message-groups/options";
import type { LocalizedMessage, PlaceholderValues } from "./types";

type OptionLabelFormatter = (message: LocalizedMessage, values?: PlaceholderValues) => string;

/**
 * Replaces stable option labels with localized display labels.
 */
export function localizeOptionList<TValue extends SelectOptionValue>(
    t: OptionLabelFormatter,
    optionList: readonly SelectOption<TValue>[],
    messageByValue: Readonly<Partial<Record<TValue, LocalizedMessage>>>,
): readonly SelectOption<TValue>[] {
    return optionList.map((option) => {
        const message = messageByValue[option.value];
        const localizedLabel = message ? t(message) : option.label;

        return {
            ...option,
            label: isUnsupportedOption(option)
                ? t(optionMessages.unsupportedOptionLabel, { label: localizedLabel })
                : localizedLabel,
        };
    });
}

function isUnsupportedOption(option: SelectOption<SelectOptionValue>): boolean {
    return option.disabled === true && option.label.endsWith(" (not supported)");
}
