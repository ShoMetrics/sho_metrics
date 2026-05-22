import type { MetricStore, MetricStoreReader } from "../metric-store";
import type { WidgetData } from "../../view-rendering/widget-data";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
    selectMetricReadRouteSourceCandidates,
} from "../sources/metric-read-plan";

export interface FallbackMetricStoreReaderOptions {
    /** Returns the current timestamp used to decide whether a candidate sample is still fresh. */
    readonly now?: () => number;

    /**
     * Maximum scalar sample age accepted from a source candidate.
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
 * Background collectors write source/profile-scoped samples. Rendering still
 * reads synchronously, so fallback here only chooses among samples already in
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
    const now = options.now ?? Date.now;

    return {
        getWidgetData: (metricKey, label, unit, maxValue) => {
            const currentTimestampMilliseconds = now();
            const sourceReaders = sourceReadersByMetricKey.get(metricKey) ?? [];

            for (const sourceReader of sourceReaders) {
                const widgetData = sourceReader.getWidgetData(metricKey, label, unit, maxValue);

                if (isFreshWidgetData(
                    widgetData,
                    currentTimestampMilliseconds,
                    options.maximumSampleAgeMilliseconds,
                )) {
                    return widgetData;
                }
            }

            return buildNoDataWidgetData({ label, unit });
        },
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
}

function isFreshWidgetData(
    widgetData: WidgetData,
    currentTimestampMilliseconds: number,
    maximumSampleAgeMilliseconds: number,
): boolean {
    const sampleTimestampMilliseconds = widgetData.sampleTimestampMilliseconds;

    if (sampleTimestampMilliseconds === undefined) {
        return false;
    }

    return currentTimestampMilliseconds - sampleTimestampMilliseconds
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
