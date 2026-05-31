import type { WidgetData } from "../../src/view-rendering/widget-data";

export function buildWidgetDataFixture(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "B",
        label: options.label ?? "Metric",
        displayValue: options.displayValue,
        unavailableDisplayValue: options.unavailableDisplayValue,
        secondaryDisplayValue: options.secondaryDisplayValue,
        barLabel: options.barLabel,
        barDisplayValue: options.barDisplayValue,
        barUnit: options.barUnit,
        barValueIconFragment: options.barValueIconFragment,
        barValueIconColor: options.barValueIconColor,
        barChannels: options.barChannels,
        sparklineScale: options.sparklineScale,
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}
