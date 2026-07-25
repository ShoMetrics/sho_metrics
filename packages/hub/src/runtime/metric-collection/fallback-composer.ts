import type { MetricStore, MetricStoreReader, MetricWidgetDataReadResult } from "../metric-store";
import type { WidgetData } from "../../view-rendering/widget-data";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
    selectMetricReadRouteSourceCandidates,
} from "../source-routing/metric-read-plan";
import { wallClockNowMilliseconds } from "../../shared/clock";
import { isBatteryMetricKey } from "../metric-keys";

/**
 * How long a battery percent reading stays renderable past the standard
 * per-action freshness budget.
 *
 * Battery sources are intentionally slow and can miss for long stretches: the
 * peripherals sleep with the machine, and the first reads after wake fail
 * while Bluetooth reconnects. A battery percentage barely moves over these
 * gaps, so showing the last reading beats showing N/A. Six hours covers the
 * within-a-day gaps this exists for (lunch, meetings, an afternoon lid close)
 * and deliberately does not span a full night's sleep: after 8+ hours the
 * number is stale enough that N/A until the next successful read is more
 * honest. The drift estimate behind "barely moves" is judgment, not measured
 * data.
 */
export const BATTERY_RETAINED_SAMPLE_MAX_AGE_MILLISECONDS = 6 * 60 * 60 * 1000;

/**
 * Battery readings at or below this percent are never retained past the
 * standard budget. Low battery is when the percentage moves fastest and when
 * a wrong number costs the user most, so a missing reading must show as N/A
 * rather than as yesterday's value.
 */
export const BATTERY_RETAINED_MINIMUM_PERCENT_EXCLUSIVE = 10;

export interface FallbackMetricStoreReaderOptions {
    /** Returns the current timestamp used to decide whether a candidate value is still fresh. */
    readonly now?: () => number;

    /**
     * Maximum scalar value age accepted from a source candidate.
     *
     * Callers must set this from the visible action's collection interval plus
     * a small grace window. A fixed global value would make low-frequency
     * widgets render false N/A states.
     */
    readonly maximumSampleAgeMilliseconds: number;
}

/**
 * Creates a synchronous reader that applies a read plan's source fallback order.
 *
 * Background collectors write source/profile-scoped values. Rendering still
 * reads synchronously, so fallback here only chooses among values already in
 * MetricStore; it never starts source I/O.
 */
export function createFallbackMetricStoreReader(
    metricStore: MetricStore,
    readPlan: MetricReadPlan,
    options: FallbackMetricStoreReaderOptions,
): MetricStoreReader {
    const normalizedReadPlan = normalizeMetricReadPlan(readPlan);
    const sourceReadersByMetricKey = new Map(normalizedReadPlan.metrics.map(metric => [
        metric.metricKey,
        selectMetricReadRouteSourceCandidates(metric)
            .map(candidate => metricStore.forScope(candidate.sourceId)),
    ]));
    const now = options.now ?? wallClockNowMilliseconds;

    return {
        getWidgetData: (metricKey, label, unit, maxValue) =>
            readWidgetDataResult(metricKey, label, unit, maxValue).widgetData,
        getWidgetDataReadResult: readWidgetDataResult,
        getTextValue: metricKey => {
            // Text values currently represent static descriptors such as CPU/GPU
            // model names. Add timestamped text reads only when real-time text
            // metrics need freshness semantics.
            const sourceReaders = sourceReadersByMetricKey.get(metricKey) ?? [];

            for (const sourceReader of sourceReaders) {
                const textValue = sourceReader.getTextValue(metricKey);

                if (textValue !== undefined) {
                    return textValue;
                }
            }

            return undefined;
        },
    };

    function readWidgetDataResult(
        metricKey: string,
        label: string,
        unit: string,
        maxValue?: number,
    ): MetricWidgetDataReadResult {
        const currentTimestampMilliseconds = now();
        const sourceReaders = sourceReadersByMetricKey.get(metricKey) ?? [];
        let firstUnavailableMetric: MetricWidgetDataReadResult["unavailableMetric"];

        for (const sourceReader of sourceReaders) {
            const readResult = sourceReader.getWidgetDataReadResult(metricKey, label, unit, maxValue);

            // Prefer the earliest source-reported unavailable reason. With normal
            // source order this keeps the preferred source's reason ahead of
            // fallback-source reasons.
            if (firstUnavailableMetric === undefined && readResult.unavailableMetric !== undefined) {
                firstUnavailableMetric = readResult.unavailableMetric;
            }

            if (isFreshWidgetData(
                metricKey,
                readResult.widgetData,
                currentTimestampMilliseconds,
                options.maximumSampleAgeMilliseconds,
            )) {
                return readResult;
            }
        }

        return {
            widgetData: buildNoDataWidgetData({ label, unit }),
            selectedSourceId: undefined,
            ...(firstUnavailableMetric === undefined ? {} : { unavailableMetric: firstUnavailableMetric }),
        };
    }
}

function isFreshWidgetData(
    metricKey: string,
    widgetData: WidgetData,
    currentTimestampMilliseconds: number,
    maximumSampleAgeMilliseconds: number,
): boolean {
    const valueTimestampMilliseconds = widgetData.sampleTimestampMilliseconds;

    if (valueTimestampMilliseconds === undefined) {
        return false;
    }

    const sampleAgeMilliseconds = currentTimestampMilliseconds - valueTimestampMilliseconds;

    if (sampleAgeMilliseconds <= maximumSampleAgeMilliseconds) {
        return true;
    }

    // Battery percentages get a longer retention window than the per-action
    // budget. Making freshness look at the value is a deliberate layering
    // trade: the low-battery cutoff needs the percent, and this is the one
    // place that has both the value and the age.
    return isBatteryMetricKey(metricKey)
        && widgetData.current > BATTERY_RETAINED_MINIMUM_PERCENT_EXCLUSIVE
        && sampleAgeMilliseconds <= BATTERY_RETAINED_SAMPLE_MAX_AGE_MILLISECONDS;
}

function buildNoDataWidgetData(options: {
    readonly label: string;
    readonly unit: string;
}): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        unit: options.unit,
        label: options.label,
        sampleTimestampMilliseconds: undefined,
    };
}
