import { wallClockNowMilliseconds } from "../../../shared/clock";
import { buildMetricSnapshot } from "../metric-source";
import type {
    MetricUnavailableReport,
    SourceClient,
    SourceSnapshotReadResult,
} from "../source-client";
import type { SourceMetricPollingGroupResolution } from "../source-polling-groups";

export class NoDataBatterySourceClient implements SourceClient {
    constructor(readonly sourceId: string) {}

    readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        const unavailableMetrics: MetricUnavailableReport[] = metricKeys.map(metricId => ({
            metricId,
            reason: "noSourceReading",
        }));

        return Promise.resolve({
            snapshot: buildMetricSnapshot({
                timestampMilliseconds: wallClockNowMilliseconds(),
                metrics: {},
            }),
            valueMetadata: [],
            unavailableMetrics,
        });
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [
            metricKey,
            {
                state: "owned",
                pollingGroupId: "battery",
            },
        ]));
    }
}
