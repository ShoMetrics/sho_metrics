import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import type { MetricStoreReader } from "../runtime/metric-store";
import type { MetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import { setMetricView } from "../view-updates/runner";
import { formatCompactHardwareModelLabel } from "../metrics/hardware-model-format";
import { buildPowerWidgetData } from "../metrics/power-widget-data";
import { buildPercentageWidgetData } from "../metrics/percentage-widget-data";
import { buildTemperatureWidgetData } from "../metrics/temperature-widget-data";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { PROGRESS_CIRCLE_LABELS } from "../widgets/primitives/progress-circle-label";
import type { WidgetData } from "../view-rendering/widget-data";
import {
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
} from "../runtime/metric-keys";
import type { SourceClientStatus } from "../runtime/sources/source-client";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedCpuMetricTarget,
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import {
    readHelperBackedWidgetData,
    resolveBuiltInHelperInstallNoticeText,
} from "./shared/helper-backed-widget-data";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import type { SingleMetricViewOptions } from "../view-updates/runner";
import { readHardwareSummaryWidget } from "./hardware-summary/action-widget";
import {
    buildHardwareSummaryReadPlan,
    readPrimaryHardwareSummaryMetricKey,
    resolveHardwareSummaryMetricKeys,
} from "./hardware-summary/read-plan";
import { buildHardwareSummaryViewOptions } from "./hardware-summary/view-options";

/** CPU action with full theming support. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.cpu })
export class Cpu extends MetricAction {
    protected readonly actionKind = "cpu";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        if (settings.widget.widgetKind === "hardwareSummary") {
            return resolveHardwareSummaryMetricKeys(readHardwareSummaryWidget(settings, "cpu"));
        }

        const cpuTarget = readResolvedMetricTarget(settings, "cpu");
        return resolveCpuMetricSubscriptionKeys(cpuTarget);
    }

    protected override getSourceDiagnosticMetricKey(event: WillAppearEvent): string | undefined {
        const settings = this.resolveSettings(event);
        if (settings.widget.widgetKind === "hardwareSummary") {
            return readPrimaryHardwareSummaryMetricKey(readHardwareSummaryWidget(settings, "cpu"));
        }

        return super.getSourceDiagnosticMetricKey(event);
    }

    protected override buildMetricCollectionReadPlan(
        event: WillAppearEvent,
        metricKeys: readonly string[],
    ): MetricReadPlan {
        const settings = this.resolveSettings(event);
        if (settings.widget.widgetKind === "hardwareSummary") {
            return buildHardwareSummaryReadPlan({
                widget: readHardwareSummaryWidget(settings, "cpu"),
                defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
                platform: this.currentPlatform(),
            });
        }

        return super.buildMetricCollectionReadPlan(event, metricKeys);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const metrics = this.getMetricReader(event);

        if (settings.widget.widgetKind === "hardwareSummary") {
            setMetricView(this.withManualRefreshIndicator(event, buildHardwareSummaryViewOptions({
                event,
                widget: readHardwareSummaryWidget(settings, "cpu"),
                metrics,
                helperStatus: this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
            })));
            return;
        }

        const cpuTarget = readResolvedMetricTarget(settings, "cpu");

        setMetricView(this.withManualRefreshIndicator(
            event,
            buildCpuViewOptions({
                event,
                settings,
                target: cpuTarget,
                metrics,
                helperStatus: this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
            }),
        ));
    }
}

export function resolveCpuMetricSubscriptionKeys(target: ResolvedCpuMetricTarget): readonly string[] {
    switch (target.reading.kind) {
        case "usage":
            return [CPU_USAGE_METRIC_KEY, CPU_MODEL_METRIC_KEY];
        case "temperature":
            return [CPU_TEMP_METRIC_KEY];
        case "power":
            return [CPU_POWER_METRIC_KEY];
    }
}

/**
 * Builds CPU render options and applies helper-install onboarding for
 * helper-only CPU readings.
 */
export function buildCpuViewOptions(options: {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    target: ResolvedCpuMetricTarget;
    metrics: MetricStoreReader;
    helperStatus: SourceClientStatus | undefined;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const baseOptions = {
        event: options.event,
        metricRenderKind: "singleMetric" as const,
        resolvedSettings: widget.slot.appearance,
    };

    switch (options.target.reading.kind) {
        case "temperature": {
            const celsiusWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: CPU_TEMP_METRIC_KEY,
                label: PROGRESS_CIRCLE_LABELS.cpu,
                unit: "C",
                maxValue: options.target.reading.maximumCelsius,
                helperStatus: options.helperStatus,
            });
            const widgetData = buildTemperatureWidgetData({
                celsiusWidgetData,
                maximumCelsius: options.target.reading.maximumCelsius,
                unit: options.target.reading.unit,
            });
            const noticeText = resolveBuiltInHelperInstallNoticeText({
                metricKey: CPU_TEMP_METRIC_KEY,
                helperStatus: options.helperStatus,
                widgetData,
            });

            return {
                ...baseOptions,
                metricKey: CPU_TEMP_METRIC_KEY,
                widgetData,
                ...(noticeText === undefined ? {} : { noticeText }),
                ...buildMetricViewIcons({ hardware: "cpu", status: "temperature" }),
            };
        }
        case "power": {
            const powerWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: CPU_POWER_METRIC_KEY,
                label: PROGRESS_CIRCLE_LABELS.cpu,
                unit: "W",
                maxValue: options.target.reading.maximumWatts,
                helperStatus: options.helperStatus,
            });
            const widgetData = buildPowerWidgetData({
                powerWidgetData,
                maximumPowerWatts: options.target.reading.maximumWatts,
            });
            const noticeText = resolveBuiltInHelperInstallNoticeText({
                metricKey: CPU_POWER_METRIC_KEY,
                helperStatus: options.helperStatus,
                widgetData,
            });

            return {
                ...baseOptions,
                metricKey: CPU_POWER_METRIC_KEY,
                widgetData,
                ...(noticeText === undefined ? {} : { noticeText }),
                ...buildMetricViewIcons({ hardware: "cpu", status: "power" }),
            };
        }
        case "usage": {
            const widgetData = options.metrics.getWidgetData(
                CPU_USAGE_METRIC_KEY,
                PROGRESS_CIRCLE_LABELS.cpu,
                "%",
                100,
            );

            return {
                ...baseOptions,
                metricKey: CPU_USAGE_METRIC_KEY,
                widgetData: {
                    ...buildCpuUsageWidgetData(widgetData),
                    secondaryDisplayValue: formatCompactHardwareModelLabel(
                        options.metrics.getTextValue(CPU_MODEL_METRIC_KEY),
                        "cpu",
                    ),
                },
                ...buildMetricViewIcons({ hardware: "cpu", status: "percentage" }),
            };
        }
    }
}

export function buildCpuUsageWidgetData(widgetData: WidgetData): WidgetData {
    return buildPercentageWidgetData(widgetData);
}
