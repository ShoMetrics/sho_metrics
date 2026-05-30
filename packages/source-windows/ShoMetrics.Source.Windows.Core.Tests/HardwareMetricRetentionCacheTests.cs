namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class HardwareMetricRetentionCacheTests
{
    private const string CpuPollingGroupId = "lhm:hardware:/cpu/0";

    [Fact]
    public void StableAliasSamplesCanBeRetainedForThreeSourceTicks()
    {
        var timeProvider = new ManualTimeProvider();
        var cache = new HardwareMetricRetentionCache(retainedTickLimit: 3, timeProvider);
        MetricReading fresh = BuildReading(metricId: "cpu.temp", sensorId: "/cpu/0/temperature/0", value: 51);

        HardwareMetricRetentionCache.ReadScope retentionRead =
            BeginRead(cache, timeProvider);
        retentionRead.TouchPollingGroup(CpuPollingGroupId);
        retentionRead.RecordFreshStableAlias(fresh, CpuPollingGroupId);

        retentionRead = AdvanceAndTouch(cache, timeProvider, tickCount: 3);

        bool found = retentionRead.TryReadStableAlias(
            "cpu.temp",
            CpuPollingGroupId,
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
        var timeProvider = new ManualTimeProvider();
        var cache = new HardwareMetricRetentionCache(retainedTickLimit: 3, timeProvider);
        MetricReading fresh = BuildReading(metricId: "cpu.temp", sensorId: "/cpu/0/temperature/0", value: 51);

        HardwareMetricRetentionCache.ReadScope retentionRead =
            BeginRead(cache, timeProvider);
        retentionRead.TouchPollingGroup(CpuPollingGroupId);
        retentionRead.RecordFreshStableAlias(fresh, CpuPollingGroupId);

        retentionRead = AdvanceAndTouch(cache, timeProvider, tickCount: 4);

        bool found = retentionRead.TryReadStableAlias(
            "cpu.temp",
            CpuPollingGroupId,
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
        var timeProvider = new ManualTimeProvider();
        var cache = new HardwareMetricRetentionCache(retainedTickLimit: 3, timeProvider);
        MetricReading sensorA = BuildReading(
            metricId: "lhm.sensor:/cpu/0/temperature/0",
            sensorId: "/cpu/0/temperature/0",
            value: 51);

        HardwareMetricRetentionCache.ReadScope retentionRead =
            BeginRead(cache, timeProvider);
        retentionRead.TouchPollingGroup(CpuPollingGroupId);
        retentionRead.RecordFreshSourceSensor(sensorA, CpuPollingGroupId);
        timeProvider.Advance(TimeSpan.FromSeconds(1));

        retentionRead = BeginRead(cache, timeProvider);
        retentionRead.TouchPollingGroup(CpuPollingGroupId);

        bool found = retentionRead.TryReadSourceSensor(
            "/cpu/0/temperature/1",
            CpuPollingGroupId,
            out _,
            out bool isExpired);

        Assert.False(found);
        Assert.False(isExpired);
    }

    [Fact]
    public void StableAliasAndSourceSensorKeysAreIsolated()
    {
        var timeProvider = new ManualTimeProvider();
        var cache = new HardwareMetricRetentionCache(retainedTickLimit: 3, timeProvider);
        MetricReading stable = BuildReading(metricId: "cpu.temp", sensorId: "/cpu/0/temperature/0", value: 51);
        MetricReading raw = BuildReading(metricId: "lhm.sensor:cpu.temp", sensorId: "cpu.temp", value: 49);

        HardwareMetricRetentionCache.ReadScope retentionRead =
            BeginRead(cache, timeProvider);
        retentionRead.TouchPollingGroup(CpuPollingGroupId);
        retentionRead.RecordFreshStableAlias(stable, CpuPollingGroupId);
        retentionRead.RecordFreshSourceSensor(raw, CpuPollingGroupId);
        timeProvider.Advance(TimeSpan.FromSeconds(1));

        retentionRead = BeginRead(cache, timeProvider);
        retentionRead.TouchPollingGroup(CpuPollingGroupId);

        Assert.True(retentionRead.TryReadStableAlias(
            "cpu.temp",
            CpuPollingGroupId,
            out MetricReading retainedStable,
            out _));
        Assert.True(retentionRead.TryReadSourceSensor(
            "cpu.temp",
            CpuPollingGroupId,
            out MetricReading retainedRaw,
            out _));

        Assert.Equal(51, retainedStable.Value);
        Assert.Equal(49, retainedRaw.Value);
    }

    [Fact]
    public void StableAliasSamplesExpireAfterRetainedAgeLimit()
    {
        var timeProvider = new ManualTimeProvider();
        var cache = new HardwareMetricRetentionCache(
            retainedTickLimit: 3,
            retainedAgeLimit: TimeSpan.FromSeconds(5),
            timeProvider);
        MetricReading fresh = BuildReading(metricId: "cpu.temp", sensorId: "/cpu/0/temperature/0", value: 51);

        HardwareMetricRetentionCache.ReadScope retentionRead =
            BeginRead(cache, timeProvider);
        retentionRead.TouchPollingGroup(CpuPollingGroupId);
        retentionRead.RecordFreshStableAlias(fresh, CpuPollingGroupId);
        timeProvider.Advance(TimeSpan.FromSeconds(6));

        retentionRead = BeginRead(cache, timeProvider);
        retentionRead.TouchPollingGroup(CpuPollingGroupId);

        bool found = retentionRead.TryReadStableAlias(
            "cpu.temp",
            CpuPollingGroupId,
            out MetricReading expired,
            out bool isExpired);

        Assert.False(found);
        Assert.True(isExpired);
        Assert.Equal(MetricValueFreshness.Retained, expired.ValueFreshness);
        Assert.Equal(TimeSpan.FromSeconds(6), expired.RetainedAge);
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

    private static HardwareMetricRetentionCache.ReadScope BeginRead(
        HardwareMetricRetentionCache cache,
        ManualTimeProvider timeProvider)
    {
        return cache.BeginRead(timeProvider.GetTimestamp());
    }

    private static HardwareMetricRetentionCache.ReadScope AdvanceAndTouch(
        HardwareMetricRetentionCache cache,
        ManualTimeProvider timeProvider,
        int tickCount)
    {
        HardwareMetricRetentionCache.ReadScope retentionRead =
            BeginRead(cache, timeProvider);

        for (int index = 0; index < tickCount; index++)
        {
            timeProvider.Advance(TimeSpan.FromSeconds(1));
            retentionRead = BeginRead(cache, timeProvider);
            retentionRead.TouchPollingGroup(CpuPollingGroupId);
        }

        return retentionRead;
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private long _timestamp;

        public override long GetTimestamp()
        {
            return _timestamp;
        }

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public void Advance(TimeSpan duration)
        {
            _timestamp += duration.Ticks;
        }
    }
}
