import {
    requireResolvedHardwareSummaryWidget,
    type ResolvedHardwareSummaryWidget,
    type ResolvedWidgetSettings,
} from "../../settings/resolved-settings";

/** Narrows resolved settings to the hardware summary widget owned by one CPU/GPU action. */
export function readHardwareSummaryWidget(
    settings: ResolvedWidgetSettings,
    domain: ResolvedHardwareSummaryWidget["target"]["domain"],
): ResolvedHardwareSummaryWidget {
    const widget = requireResolvedHardwareSummaryWidget(settings);
    if (widget.target.domain !== domain) {
        throw new Error(`Cannot render ${widget.target.domain} hardware summary widget from ${domain} action.`);
    }

    return widget;
}
