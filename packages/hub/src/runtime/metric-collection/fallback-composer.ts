import type { MetricStore, MetricStoreReader, MetricWidgetDataReadResult } from "../metric-store";
import type { WidgetData } from "../../view-rendering/widget-data";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
    selectMetricReadRouteSourceCandidates,
} from "../source-routing/metric-read-plan";
import { wallClockNowMilliseconds } from "../../shared/clock";

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
    widgetData: WidgetData,
    currentTimestampMilliseconds: number,
    maximumSampleAgeMilliseconds: number,
): boolean {
    const valueTimestampMilliseconds = widgetData.sampleTimestampMilliseconds;

    if (valueTimestampMilliseconds === undefined) {
        return false;
    }

    return currentTimestampMilliseconds - valueTimestampMilliseconds
        <= maximumSampleAgeMilliseconds;
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
