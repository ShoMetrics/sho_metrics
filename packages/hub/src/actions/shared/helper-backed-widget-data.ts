import type { MetricStoreReader } from "../../runtime/metric-store";
import type { SourceClientStatus } from "../../runtime/sources/source-client";
import type { WidgetData } from "../../view-rendering/widget-data";

// Hub-side stale-sample guard. Source-side fresh/retained attribution in
// docs/development/runtime-source-performance/10-helper-source-reliability-implementation-plan.md
// will make this a fallback check instead of the primary helper freshness signal.
const HELPER_BACKED_SAMPLE_FRESHNESS_MILLISECONDS = 7000;

interface HelperBackedWidgetDataReadOptions {
    readonly metrics: MetricStoreReader;
    readonly metricKey: string;
    readonly label: string;
    readonly unit: string;
    readonly maxValue?: number;
    readonly helperStatus: SourceClientStatus | undefined;
}

/** Reads a helper-backed metric and returns action-owned no-data copy when no fresh sample exists. */
export function readHelperBackedWidgetData(options: HelperBackedWidgetDataReadOptions): WidgetData {
    const widgetData = options.metrics.getWidgetData(
        options.metricKey,
        options.label,
        options.unit,
        options.maxValue ?? 100,
    );

    if (isFreshHelperBackedWidgetData(widgetData)) {
        return widgetData;
    }

    const {
        displayValue: ignoredDisplayValue,
        secondaryDisplayValue: ignoredSecondaryDisplayValue,
        sampleTimestampMilliseconds: ignoredSampleTimestampMilliseconds,
        ...baseWidgetData
    } = widgetData;

    void ignoredDisplayValue;
    void ignoredSecondaryDisplayValue;
    void ignoredSampleTimestampMilliseconds;

    const unavailableDisplayValue = resolveHelperBackedUnavailableDisplayValue(options.helperStatus);

    return {
        ...baseWidgetData,
        current: 0,
        progress: 0,
        history: [],
        ...(unavailableDisplayValue === undefined ? {} : { unavailableDisplayValue }),
    };
}

function isFreshHelperBackedWidgetData(widgetData: WidgetData): boolean {
    if (widgetData.sampleTimestampMilliseconds == null) {
        return false;
    }

    return Date.now() - widgetData.sampleTimestampMilliseconds <= HELPER_BACKED_SAMPLE_FRESHNESS_MILLISECONDS;
}

function resolveHelperBackedUnavailableDisplayValue(helperStatus: SourceClientStatus | undefined): string | undefined {
    if (helperStatus === undefined) {
        return undefined;
    }

    if (helperStatus.state === "unknown") {
        return undefined;
    }

    if (helperStatus.state === "available") {
        return "No sensor data";
    }

    if (helperStatus.state === "unavailable") {
        if (helperStatus.reason === "helperNotInstalled") {
            return "Helper required";
        }

        if (helperStatus.reason === "pipeMissing") {
            return helperStatus.lastSuccessAtTimestampMilliseconds === undefined
                ? "Helper required"
                : "Helper error";
        }

        return "Helper error";
    }

    return "Helper error";
}
