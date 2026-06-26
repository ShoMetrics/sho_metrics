import type { CircleViewVariant, MetricView, TextViewVariant } from "./resolved-settings";
import {
    limitMetricCustomLabelCharacters,
    normalizeMetricCustomLabelInput,
} from "./metric-custom-label-policy";

export const SYSTEM_BATTERY_COMPACT_LABEL = "BATT";
export const SYSTEM_BATTERY_TITLE_LABEL = "Battery";

/** Normalizes the user-owned label stored for a selected battery metric. */
export function normalizeSystemBatteryCustomLabel(
    label: string,
): string | undefined {
    return normalizeMetricCustomLabelInput(label);
}

/** Resolves the primary battery label shown by the active metric view. */
export function resolveSystemBatteryLabel(options: {
    readonly customLabel: string | undefined;
    readonly selectedPeripheralDisplayName: string | undefined;
    readonly selectedView: MetricView;
    readonly circleVariant: CircleViewVariant;
    readonly textVariant: TextViewVariant;
    readonly maximumCharacters: number;
}): string {
    const label = options.customLabel
        ?? options.selectedPeripheralDisplayName
        ?? resolveSystemBatteryDefaultLabel(options);

    return limitMetricCustomLabelCharacters(label, options.maximumCharacters)
        ?? resolveSystemBatteryDefaultLabel(options);
}

/** Resolves the optional secondary label used by views that keep a fixed title. */
export function resolveSystemBatterySecondaryLabel(options: {
    readonly customLabel: string | undefined;
    readonly selectedPeripheralDisplayName: string | undefined;
    readonly maximumCharacters: number;
}): string | undefined {
    const label = options.customLabel ?? options.selectedPeripheralDisplayName;

    return label === undefined
        ? undefined
        : limitMetricCustomLabelCharacters(label, options.maximumCharacters);
}

function resolveSystemBatteryDefaultLabel(options: {
    readonly selectedView: MetricView;
    readonly circleVariant: CircleViewVariant;
    readonly textVariant: TextViewVariant;
}): string {
    switch (options.selectedView) {
        case "circle":
            return options.circleVariant === "minimal"
                ? SYSTEM_BATTERY_TITLE_LABEL
                : SYSTEM_BATTERY_COMPACT_LABEL;
        case "text":
            return options.textVariant === "title-card"
                ? SYSTEM_BATTERY_TITLE_LABEL
                : SYSTEM_BATTERY_COMPACT_LABEL;
        case "bar":
        case "line":
            return SYSTEM_BATTERY_TITLE_LABEL;
    }
}
