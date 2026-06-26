import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import {
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "../../runtime/sources/custom-http/custom-http-metric-key";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedCustomMetricTarget,
    type ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import type { SingleMetricViewOptions } from "../../view-updates/runner";
import {
    type WidgetData,
} from "../../view-rendering/widget-data";
import {
    getMetricIconFragment,
    getDefaultMetricIconFragment,
} from "../../widgets/icons/metric-icons";
import {
    resolveMetricCustomLabelDisplayMaximumCharacters,
    resolveMetricCustomLabelKeyShape,
} from "../../settings/metric-custom-label-policy";
import { buildMetricViewIcons } from "../../widgets/icons/metric-view-icons";
import { resolveCustomHttpRuntimeIdentity } from "./runtime-source-definition";
import {
    CUSTOM_METRIC_DEFAULT_LABEL,
    readCustomHttpWidgetData,
} from "./custom-http-widget-data";

const CUSTOM_METRIC_CONFIGURE_RENDER_KEY = "custom-http.configure";
const CUSTOM_METRIC_ERROR_RENDER_KEY = "custom-http.error";
const CUSTOM_METRIC_CONFIGURE_NOTICE_TEXT = "Configure";
const CUSTOM_METRIC_ERROR_NOTICE_TEXT = "Error";

/**
 * Builds single-metric render options for a Custom Metric target.
 */
export function buildCustomMetricViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedCustomMetricTarget;
    readonly metrics?: MetricStoreReader;
    readonly consumerSlug?: string | undefined;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    // Unconfigured and invalid states cannot read source output, so they can
    // only use the stored icon. Configured state overrides the center icon
    // after reading the source's suggested icon from widget data.
    const baseIcons = buildCustomMetricViewIcons({
        storedIconId: options.target.iconId,
        suggestedIconId: undefined,
    });
    const baseOptions = {
        event: options.event,
        metricRenderKind: "singleMetric" as const,
        resolvedSettings: widget.slot.appearance,
        ...baseIcons,
    };

    switch (options.target.configuration.state) {
        case "unconfigured":
            return {
                ...baseOptions,
                metricKey: CUSTOM_METRIC_CONFIGURE_RENDER_KEY,
                widgetData: buildEmptyCustomMetricWidgetData(),
                noticeText: CUSTOM_METRIC_CONFIGURE_NOTICE_TEXT,
            };
        case "invalid":
            return {
                ...baseOptions,
                metricKey: CUSTOM_METRIC_ERROR_RENDER_KEY,
                widgetData: buildEmptyCustomMetricWidgetData(),
                noticeText: CUSTOM_METRIC_ERROR_NOTICE_TEXT,
            };
        case "configured": {
            if (options.metrics === undefined) {
                throw new Error("Configured Custom Metric rendering requires a metric reader.");
            }
            const identity = resolveCustomHttpRuntimeIdentity(
                options.event,
                options.target,
                options.consumerSlug ?? CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
            );
            if (identity === undefined) {
                throw new Error("Configured Custom Metric rendering could not resolve a Custom HTTP identity.");
            }

            const viewSettings = widget.slot.appearance.view;
            const widgetDataResult = readCustomHttpWidgetData({
                metrics: options.metrics,
                metricKey: identity.metricKey,
                labelMaximumCharacters: resolveMetricCustomLabelDisplayMaximumCharacters({
                    viewSettings,
                    selectedTheme: widget.slot.appearance.theme.selectedTheme,
                    keyShape: resolveMetricCustomLabelKeyShape({
                        selectedView: viewSettings.selectedView,
                        isTouchStrip: options.event.action.isDial(),
                    }),
                }),
            });

            return {
                ...baseOptions,
                // Source suggestions are available only after reading the
                // current metric sample, so the configured state replaces the
                // base center icon instead of reusing `baseIcons`.
                centerIconFragment: buildCustomMetricViewIcons({
                    storedIconId: options.target.iconId,
                    suggestedIconId: widgetDataResult.suggestedLucideIconId,
                }).centerIconFragment,
                metricKey: identity.metricKey,
                widgetData: widgetDataResult.widgetData,
            };
        }
    }
}

function buildCustomMetricViewIcons(options: {
    readonly storedIconId: string | undefined;
    readonly suggestedIconId: string | undefined;
}): ReturnType<typeof buildMetricViewIcons> {
    // Reuse the normal metric icon contract for view options, but Custom Metric
    // owns the actual center icon. The hardware/status arguments only satisfy
    // the shared builder shape and are not rendered when we replace the center.
    const fallbackIcons = buildMetricViewIcons({ hardware: "unknown", status: "percentage" });
    return {
        ...fallbackIcons,
        centerIconFragment: getMetricIconFragment(options.storedIconId)
            ?? getMetricIconFragment(options.suggestedIconId)
            ?? getDefaultMetricIconFragment(),
    };
}

function buildEmptyCustomMetricWidgetData(): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        label: CUSTOM_METRIC_DEFAULT_LABEL,
        unit: "",
    };
}
