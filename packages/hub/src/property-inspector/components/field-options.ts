import { resolveFieldOptions } from "../options";
import type { FieldSchema, SelectOption, VisibilityContext } from "../schema";

export function resolveSelectOptions(field: FieldSchema, context: VisibilityContext): readonly SelectOption[] {
    if (!field.options) {
        return [];
    }

    if (field.options.kind === "static") {
        return field.options.values;
    }

    return resolveFieldOptions(field.options.providerId, context);
}

export function resolveSelectedOptionValue(options: {
    context: VisibilityContext;
    options: readonly SelectOption[];
    value: string;
    fallbackValue?: string;
}): string {
    if (options.options.some((option) => option.value === options.value && isSelectableOption(option, options.context))) {
        return options.value;
    }

    if (
        options.fallbackValue
        && options.options.some((option) => option.value === options.fallbackValue && isSelectableOption(option, options.context))
    ) {
        return options.fallbackValue;
    }

    return options.options.find((option) => isSelectableOption(option, options.context))?.value ?? "";
}

export function isOptionDisabled(option: SelectOption, context: VisibilityContext): boolean {
    return option.disabled === true || (option.hiddenOnWindows === true && context.isWindows);
}

export function isOptionHidden(option: SelectOption, context: VisibilityContext): boolean {
    return option.hidden === true || (option.hiddenOnWindows === true && context.isWindows);
}

function isSelectableOption(option: SelectOption, context: VisibilityContext): boolean {
    return !isOptionDisabled(option, context) && !isOptionHidden(option, context);
}
