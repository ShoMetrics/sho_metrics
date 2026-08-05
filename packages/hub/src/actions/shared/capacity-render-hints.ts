import type { ResolvedAppearanceSettings } from "../../settings/resolved-settings";
import type { WidgetData } from "../../view-rendering/widget-data";
import {
    FREE_CAPACITY_ICON_OPTICAL_Y_OFFSET_RATIO,
    renderFreeCapacityIconFragment,
} from "../../widgets/icons/free-capacity-icon";
import type { ProgressCircleFooterIcon } from "../../widgets/primitives/progress-circle";

const FREE_CAPACITY_ICON_NOMINAL_SIZE = 30;
const FREE_CAPACITY_ICON_FRAGMENT = renderFreeCapacityIconFragment(FREE_CAPACITY_ICON_NOMINAL_SIZE);
const FREE_CAPACITY_GAUGE_FOOTER_ICON: ProgressCircleFooterIcon = {
    fragment: FREE_CAPACITY_ICON_FRAGMENT,
    nominalSize: FREE_CAPACITY_ICON_NOMINAL_SIZE,
    opticalYOffsetRatio: FREE_CAPACITY_ICON_OPTICAL_Y_OFFSET_RATIO,
};

/** Builds render-only hints for a used/free capacity selection. */
export function buildCapacityRenderHints(options: {
    readonly widgetData: WidgetData;
    readonly displayMode: "usedPercentage" | "usedCapacity" | "freeCapacity";
    readonly view: ResolvedAppearanceSettings["view"];
}): {
    readonly widgetData: WidgetData;
    readonly footerIcon: ProgressCircleFooterIcon | undefined;
} {
    // Progress, history, and range colors already communicate "used". Mark only
    // free values so the icon remains a focused disambiguator, not a second legend.
    if (options.displayMode !== "freeCapacity") {
        return {
            widgetData: options.widgetData,
            footerIcon: undefined,
        };
    }

    const isGauge = options.view.selectedView === "circle"
        && options.view.circleVariant === "gauge";

    return {
        widgetData: {
            ...options.widgetData,
            valueQualifierIconFragment: FREE_CAPACITY_ICON_FRAGMENT,
        },
        footerIcon: isGauge ? FREE_CAPACITY_GAUGE_FOOTER_ICON : undefined,
    };
}
