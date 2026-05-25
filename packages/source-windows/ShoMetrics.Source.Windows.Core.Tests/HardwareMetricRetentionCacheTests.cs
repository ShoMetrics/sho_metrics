namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class HardwareMetricRetentionCacheTests
{
    [Fact]
    public void StableAliasSamplesCanBeRetainedForThreeSourceTicks()
    {
        var cache = new HardwareMetricRetentionCache(retainedTickLimit: 3);
        DateTimeOffset capturedAt = DateTimeOffset.Parse("2026-05-24T12:00:00Z");
        MetricReading fresh = BuildReading(metricId: "cpu.temp", sensorId: "/cpu/0/temperature/0", value: 51);

        cache.RecordFreshStableAlias(fresh, sourceTick: 10, capturedAt);

        bool found = cache.TryReadStableAlias(
            "cpu.temp",
            sourceTick: 13,
            capturedAt: capturedAt.AddSeconds(3),
            out MetricReading retained,
            out bool isExpired);

        Assert.True(found);
        Assert.False(isExpired);
        Assert.Equal(MetricValueFreshness.Retained, retained.ValueFreshness);
        Assert.Equal(TimeSpan.FromSeconds(3), retained.RetainedAge);
        Assert.Equal(51, retained.Value);
    }

    [Fact]
    public void StableAliasSamplesExpireAfterThreeSourceTicks()
    {
        var cache = new HardwareMetricRetentionCache(retainedTickLimit: 3);
        DateTimeOffset capturedAt = DateTimeOffset.Parse("2026-05-24T12:00:00Z");
        MetricReading fresh = BuildReading(metricId: "cpu.temp", sensorId: "/cpu/0/temperature/0", value: 51);

        cache.RecordFreshStableAlias(fresh, sourceTick: 10, capturedAt);

        bool found = cache.TryReadStableAlias(
            "cpu.temp",
            sourceTick: 14,
            capturedAt: capturedAt.AddSeconds(4),
            out MetricReading expired,
            out bool isExpired);

        Assert.False(found);
        Assert.True(isExpired);
        Assert.Equal("/cpu/0/temperature/0", expired.SensorId);
        Assert.Equal(MetricValueFreshness.Retained, expired.ValueFreshness);
    }

    [Fact]
    public void SourceSensorRetentionUsesRawSensorIdentity()
    {
        var cache = new HardwareMetricRetentionCache(retainedTickLimit: 3);
        DateTimeOffset capturedAt = DateTimeOffset.Parse("2026-05-24T12:00:00Z");
        MetricReading sensorA = BuildReading(
            metricId: "lhm.sensor:/cpu/0/temperature/0",
            sensorId: "/cpu/0/temperature/0",
            value: 51);

        cache.RecordFreshSourceSensor(sensorA, sourceTick: 10, capturedAt);

        bool found = cache.TryReadSourceSensor(
            "/cpu/0/temperature/1",
            sourceTick: 11,
            capturedAt: capturedAt.AddSeconds(1),
            out _,
            out bool isExpired);

        Assert.False(found);
        Assert.False(isExpired);
    }

    [Fact]
    public void StableAliasAndSourceSensorKeysAreIsolated()
    {
        var cache = new HardwareMetricRetentionCache(retainedTickLimit: 3);
        DateTimeOffset capturedAt = DateTimeOffset.Parse("2026-05-24T12:00:00Z");
        MetricReading stable = BuildReading(metricId: "cpu.temp", sensorId: "/cpu/0/temperature/0", value: 51);
        MetricReading raw = BuildReading(metricId: "lhm.sensor:cpu.temp", sensorId: "cpu.temp", value: 49);

        cache.RecordFreshStableAlias(stable, sourceTick: 10, capturedAt);
        cache.RecordFreshSourceSensor(raw, sourceTick: 10, capturedAt);

        Assert.True(cache.TryReadStableAlias(
            "cpu.temp",
            sourceTick: 11,
            capturedAt: capturedAt.AddSeconds(1),
            out MetricReading retainedStable,
            out _));
        Assert.True(cache.TryReadSourceSensor(
            "cpu.temp",
            sourceTick: 11,
            capturedAt: capturedAt.AddSeconds(1),
            out MetricReading retainedRaw,
            out _));

        Assert.Equal(51, retainedStable.Value);
        Assert.Equal(49, retainedRaw.Value);
    }

    private static MetricReading BuildReading(string metricId, string sensorId, double value)
    {
        return new MetricReading
        {
            MetricId = metricId,
            HardwareId = "/cpu/0",
            HardwareName = "CPU",
            HardwareType = "Cpu",
            SensorId = sensorId,
            SensorName = "CPU Package",
            SourceSensorType = "Temperature",
            Value = value,
            Unit = MetricUnit.Celsius,
        };
    }
}
