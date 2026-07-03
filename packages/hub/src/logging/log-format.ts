const DEFAULT_FULL_METRIC_KEY_LOG_LIMIT = 8;

export function formatMetricKeyFieldsForLog(metricKeys: readonly string[]): readonly string[] {
    if (metricKeys.length <= DEFAULT_FULL_METRIC_KEY_LOG_LIMIT) {
        return [
            `metricCount=${metricKeys.length}`,
            `metricKeys=${metricKeys.join(",")}`,
        ];
    }

    const metricKeySample = metricKeys.slice(0, DEFAULT_FULL_METRIC_KEY_LOG_LIMIT);
    return [
        `metricCount=${metricKeys.length}`,
        `metricKeys=${metricKeySample.join(",")}`,
        `omittedMetricCount=${metricKeys.length - metricKeySample.length}`,
    ];
}
