import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import type { MetricStoreReader } from "../runtime/metric-store";
import type { MetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import { setMetricView } from "../view-updates/runner";
import type { WidgetData } from "../view-rendering/widget-data";
import { buildGpuPowerWidgetData } from "../metrics/gpu-power-widget-data";
import { buildGpuVramWidgetData } from "../metrics/gpu-vram-widget-data";
import { formatCompactHardwareModelLabel } from "../metrics/hardware-model-format";
import { buildPercentageWidgetData } from "../metrics/percentage-widget-data";
import { buildTemperatureWidgetData } from "../metrics/temperature-widget-data";
import { logger } from "../logging/node-logger";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { PROGRESS_CIRCLE_LABELS } from "../widgets/primitives/progress-circle-label";
import {
    GPU_MODEL_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../runtime/metric-keys";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedGpuMetricTarget,
    type ResolvedHardwareSummaryWidget,
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import type { SourceClientStatus } from "../runtime/sources/source-client";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
import {
    readHelperBackedWidgetData,
    resolveBuiltInHelperInstallNoticeText,
    resolveHelperBackedSampleFreshnessBudgetMilliseconds,
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

const log = logger.for("Action:GPU");

/** GPU action. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.gpu })
export class Gpu extends MetricAction {
    protected readonly actionKind = "gpu";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        if (settings.widget.widgetKind === "hardwareSummary") {
            return resolveHardwareSummaryMetricKeys(readHardwareSummaryWidget(settings, "gpu"));
        }

        const gpuTarget = readResolvedMetricTarget(settings, "gpu");
        return resolveGpuMetricSubscriptionKeys(gpuTarget);
    }

    protected override getSourceDiagnosticMetricKey(event: WillAppearEvent): string | undefined {
        const settings = this.resolveSettings(event);
        if (settings.widget.widgetKind === "hardwareSummary") {
            return readPrimaryHardwareSummaryMetricKey(readHardwareSummaryWidget(settings, "gpu"));
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
                widget: readHardwareSummaryWidget(settings, "gpu"),
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
            const widget = readHardwareSummaryWidget(settings, "gpu");
            this.publishGpuSummaryPowerRuntimeMaximum(event, widget, metrics);

            setMetricView(this.withManualRefreshIndicator(event, buildHardwareSummaryViewOptions({
                event,
                widget,
                metrics,
                helperStatus: this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
                helperSampleFreshnessBudgetMilliseconds: resolveHelperBackedSampleFreshnessBudgetMilliseconds(
                    settings.preferences.pollingFrequencySeconds,
                ),
            })));
            return;
        }

        const gpuTarget = readResolvedMetricTarget(settings, "gpu");

        this.publishGpuPowerRuntimeMaximum(event, gpuTarget, metrics);

        setMetricView(this.withManualRefreshIndicator(
            event,
            buildGpuViewOptions({
                event,
                settings,
                target: gpuTarget,
                metrics,
                helperStatus: this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
            }),
        ));
    }

    private publishGpuSummaryPowerRuntimeMaximum(
        event: WillAppearEvent,
        widget: ResolvedHardwareSummaryWidget,
        metrics: MetricStoreReader,
    ): void {
        if (!widget.target.orderedReadings.some(reading => reading.kind === "power")) {
            return;
        }

        this.publishRuntimeGpuPowerMaximum(event, metrics);
    }

    private publishGpuPowerRuntimeMaximum(
        event: WillAppearEvent,
        target: ResolvedGpuMetricTarget,
        metrics: MetricStoreReader,
    ): void {
        if (target.reading.kind !== "power") {
            return;
        }

        this.publishRuntimeGpuPowerMaximum(event, metrics);
    }

    private publishRuntimeGpuPowerMaximum(
        event: WillAppearEvent,
        metrics: MetricStoreReader,
    ): void {
        const nextMaximum = resolveRuntimeGpuPowerMaximumWatts(metrics);
        if (nextMaximum === undefined) {
            return;
        }

        this.updateRuntimeCache(event, {
            runtimeMaximumGpuPowerWatts: nextMaximum,
        }).catch(error => {
            log.error(() => `Failed to publish runtime GPU power maximum: ${String(error)}`);
        });
    }
}

export function resolveGpuMetricSubscriptionKeys(target: ResolvedGpuMetricTarget): readonly string[] {
    switch (target.reading.kind) {
        case "usage":
            return [GPU_USAGE_METRIC_KEY, GPU_MODEL_METRIC_KEY];
        case "temperature":
            return [GPU_TEMP_METRIC_KEY];
        case "vram":
            return [GPU_VRAM_USED_METRIC_KEY, GPU_VRAM_TOTAL_METRIC_KEY];
        case "power":
            return [GPU_POWER_METRIC_KEY, GPU_POWER_LIMIT_METRIC_KEY];
    }
}

/**
 * Builds GPU render options while keeping fallback-capable readings on the
 * value-or-N/A path instead of install-helper onboarding.
 */
export function buildGpuViewOptions(options: {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    target: ResolvedGpuMetricTarget;
    metrics: MetricStoreReader;
    helperStatus: SourceClientStatus | undefined;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const baseOptions = {
        event: options.event,
        metricRenderKind: "singleMetric" as const,
        resolvedSettings: widget.slot.appearance,
    };
    const helperSampleFreshnessBudgetMilliseconds = resolveHelperBackedSampleFreshnessBudgetMilliseconds(
        options.settings.preferences.pollingFrequencySeconds,
    );

    switch (options.target.reading.kind) {
        case "temperature": {
            const celsiusWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_TEMP_METRIC_KEY,
                label: PROGRESS_CIRCLE_LABELS.gpu,
                unit: "C",
                maxValue: options.target.reading.maximumCelsius,
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: helperSampleFreshnessBudgetMilliseconds,
            });
            const widgetData = buildTemperatureWidgetData({
                celsiusWidgetData,
                maximumCelsius: options.target.reading.maximumCelsius,
                unit: options.target.reading.unit,
            });
            const noticeText = resolveBuiltInHelperInstallNoticeText({
                metricKey: GPU_TEMP_METRIC_KEY,
                helperStatus: options.helperStatus,
                widgetData,
            });

            return {
                ...baseOptions,
                metricKey: GPU_TEMP_METRIC_KEY,
                widgetData,
                ...(noticeText === undefined ? {} : { noticeText }),
                ...buildMetricViewIcons({ hardware: "gpu", status: "temperature" }),
            };
        }
        case "vram": {
            const usedWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_VRAM_USED_METRIC_KEY,
                label: PROGRESS_CIRCLE_LABELS.vram,
                unit: "B",
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: helperSampleFreshnessBudgetMilliseconds,
            });
            const totalWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_VRAM_TOTAL_METRIC_KEY,
                label: PROGRESS_CIRCLE_LABELS.vram,
                unit: "B",
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: helperSampleFreshnessBudgetMilliseconds,
            });
            const widgetData = buildGpuVramWidgetData(
                usedWidgetData,
                totalWidgetData.current,
            );
            const noticeText = resolveBuiltInHelperInstallNoticeText({
                metricKey: GPU_VRAM_USED_METRIC_KEY,
                helperStatus: options.helperStatus,
                widgetData,
            });

            return {
                ...baseOptions,
                metricKey: GPU_VRAM_USED_METRIC_KEY,
                widgetData,
                ...(noticeText === undefined ? {} : { noticeText }),
                ...buildMetricViewIcons({ hardware: "gpu", status: "memory" }),
            };
        }
        case "power": {
            const powerWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_POWER_METRIC_KEY,
                label: PROGRESS_CIRCLE_LABELS.gpu,
                unit: "W",
                maxValue: options.target.reading.maximumWatts,
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: helperSampleFreshnessBudgetMilliseconds,
            });
            const widgetData = buildGpuPowerWidgetData({
                powerWidgetData,
                maximumPowerWatts: options.target.reading.maximumWatts,
            });
            const noticeText = resolveBuiltInHelperInstallNoticeText({
                metricKey: GPU_POWER_METRIC_KEY,
                helperStatus: options.helperStatus,
                widgetData,
            });

            return {
                ...baseOptions,
                metricKey: GPU_POWER_METRIC_KEY,
                widgetData,
                ...(noticeText === undefined ? {} : { noticeText }),
                ...buildMetricViewIcons({ hardware: "gpu", status: "power" }),
            };
        }
        case "usage": {
            const data = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_USAGE_METRIC_KEY,
                label: PROGRESS_CIRCLE_LABELS.gpu,
                unit: "%",
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: helperSampleFreshnessBudgetMilliseconds,
            });

            const widgetData = {
                ...buildGpuUsageWidgetData(data),
                secondaryDisplayValue: data.sampleTimestampMilliseconds != null
                    ? formatCompactHardwareModelLabel(
                        options.metrics.getTextValue(GPU_MODEL_METRIC_KEY),
                        "gpu",
                    )
                    : undefined,
            };
            const noticeText = resolveBuiltInHelperInstallNoticeText({
                metricKey: GPU_USAGE_METRIC_KEY,
                helperStatus: options.helperStatus,
                widgetData,
            });

            return {
                ...baseOptions,
                metricKey: GPU_USAGE_METRIC_KEY,
                widgetData,
                ...(noticeText === undefined ? {} : { noticeText }),
                ...buildMetricViewIcons({ hardware: "gpu", status: "percentage" }),
            };
        }
    }
}

function resolveRuntimeGpuPowerMaximumWatts(metrics: MetricStoreReader): number | undefined {
    const powerLimitWidgetData = metrics.getWidgetData(
        GPU_POWER_LIMIT_METRIC_KEY,
        PROGRESS_CIRCLE_LABELS.gpu,
        "W",
    );

    if (
        powerLimitWidgetData.sampleTimestampMilliseconds != null
        && powerLimitWidgetData.current > 0
    ) {
        return Math.ceil(powerLimitWidgetData.current);
    }

    const powerWidgetData = metrics.getWidgetData(
        GPU_POWER_METRIC_KEY,
        PROGRESS_CIRCLE_LABELS.gpu,
        "W",
    );
    if (
        powerWidgetData.sampleTimestampMilliseconds != null
        && powerWidgetData.current > 0
    ) {
        return Math.ceil(powerWidgetData.current * 1.1);
    }

    return undefined;
}

export function buildGpuUsageWidgetData(widgetData: WidgetData): WidgetData {
    return buildPercentageWidgetData(widgetData);
}
export { buildGpuVramWidgetData } from "../metrics/gpu-vram-widget-data";
