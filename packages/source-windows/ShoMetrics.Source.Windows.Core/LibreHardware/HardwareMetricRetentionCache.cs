namespace ShoMetrics.Source.Windows.Core;

internal sealed class HardwareMetricRetentionCache(int retainedTickLimit)
{
    private const string StableAliasKeyPrefix = "stable:";
    private const string SourceSensorKeyPrefix = "sensor:";

    private readonly Dictionary<string, RetainedHardwareMetricSample> _samplesByKey =
        new(StringComparer.Ordinal);

    public void RecordFreshStableAlias(MetricReading reading, long sourceTick, DateTimeOffset capturedAt)
    {
        // Stable aliases such as cpu.temp may move between ranked raw sensors
        // when the preferred sensor temporarily stops reporting. Retain by the
        // public metric id so the user-facing alias can keep the last good value.
        Record(BuildStableAliasKey(reading.MetricId), reading, sourceTick, capturedAt);
    }

    public void RecordFreshSourceSensor(MetricReading reading, long sourceTick, DateTimeOffset capturedAt)
    {
        // Catalog metrics are explicit raw sensors. Retain by source sensor id
        // so a chosen lhm.sensor:/... metric never silently falls back to a
        // different physical sensor.
        Record(BuildSourceSensorKey(reading.SensorId), reading, sourceTick, capturedAt);
    }

    public bool TryReadStableAlias(
        string metricId,
        long sourceTick,
        DateTimeOffset capturedAt,
        out MetricReading reading,
        out bool isExpired)
    {
        return TryRead(BuildStableAliasKey(metricId), sourceTick, capturedAt, out reading, out isExpired);
    }

    public bool TryReadSourceSensor(
        string sourceSensorId,
        long sourceTick,
        DateTimeOffset capturedAt,
        out MetricReading reading,
        out bool isExpired)
    {
        return TryRead(BuildSourceSensorKey(sourceSensorId), sourceTick, capturedAt, out reading, out isExpired);
    }

    private void Record(string key, MetricReading reading, long sourceTick, DateTimeOffset capturedAt)
    {
        _samplesByKey[key] = new RetainedHardwareMetricSample(reading, sourceTick, capturedAt);
    }

    private bool TryRead(
        string key,
        long sourceTick,
        DateTimeOffset capturedAt,
        out MetricReading reading,
        out bool isExpired)
    {
        reading = default!;
        isExpired = false;

        if (!_samplesByKey.TryGetValue(key, out RetainedHardwareMetricSample sample))
        {
            return false;
        }

        reading = BuildRetainedReading(sample, capturedAt);

        long retainedTickAge = sourceTick - sample.SourceTick;
        if (retainedTickAge <= retainedTickLimit)
        {
            // Expiry is source-tick based so a slow LHM update loop still gets
            // the same number of tolerated misses. The exposed age remains
            // wall-clock based for DEBUG/attribution copy.
            return true;
        }

        isExpired = true;
        return false;
    }

    private static string BuildStableAliasKey(string metricId)
    {
        return StableAliasKeyPrefix + metricId;
    }

    private static string BuildSourceSensorKey(string sourceSensorId)
    {
        return SourceSensorKeyPrefix + sourceSensorId;
    }

    private static MetricReading BuildRetainedReading(
        RetainedHardwareMetricSample sample,
        DateTimeOffset capturedAt)
    {
        return sample.Reading with
        {
            ValueFreshness = MetricValueFreshness.Retained,
            RetainedAge = capturedAt >= sample.CapturedAt
                ? capturedAt - sample.CapturedAt
                : TimeSpan.Zero,
        };
    }

    private readonly record struct RetainedHardwareMetricSample(
        MetricReading Reading,
        long SourceTick,
        DateTimeOffset CapturedAt);
}
