import type { MetricStore, MetricStoreReader } from "../metric-store";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
    selectMetricReadPlanSourceCandidates,
} from "../sources/metric-read-plan";

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
): MetricStoreReader {
    const normalizedReadPlan = normalizeMetricReadPlan(readPlan);
    const sourceCandidates = selectMetricReadPlanSourceCandidates(normalizedReadPlan);
    const sourceReaders = sourceCandidates.map(candidate => metricStore.forScope(candidate.sourceId));
    const defaultReader = sourceReaders[0] ?? metricStore.forScope(normalizedReadPlan.sourceScopeId);

    return {
        getWidgetData: (metricKey, label, unit, maxValue) => {
            for (const sourceReader of sourceReaders) {
                const widgetData = sourceReader.getWidgetData(metricKey, label, unit, maxValue);

                // TODO(Phase 5c fallback freshness): Check the candidate
                // sample against the metric/source freshness budget before
                // accepting it. Presence only means this source has written at
                // least once; it does not prove the sample is still usable.
                if (widgetData.sampleTimestampMilliseconds !== undefined) {
                    return widgetData;
                }
            }

            // Return render-safe no-data defaults from the primary candidate
            // reader. The loop above has already proven no candidate currently
            // has an accepted sample.
            return defaultReader.getWidgetData(metricKey, label, unit, maxValue);
        },
        getTextValue: metricKey => {
            for (const sourceReader of sourceReaders) {
                const textValue = sourceReader.getTextValue(metricKey);

                if (textValue !== undefined) {
                    return textValue;
                }
            }

            // Mirrors getWidgetData(): no accepted candidate text exists, so
            // fall back to the primary reader's empty/default response.
            return defaultReader.getTextValue(metricKey);
        },
    };
}
