import type { WidgetData } from "../view-rendering/widget-data";

/** Applies the shared fixed 0-100 percentage display contract. */
export function buildPercentageWidgetData(widgetData: WidgetData): WidgetData {
    return {
        ...widgetData,
        displayValue: widgetData.current.toFixed(0),
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: 100,
        },
    };
}
