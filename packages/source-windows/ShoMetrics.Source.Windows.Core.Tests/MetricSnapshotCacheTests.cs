namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class MetricSnapshotCacheTests
{
    private const string CpuPollingGroupId = "lhm:hardware:/cpu/0";
    private const string GpuPollingGroupId = "lhm:hardware:/gpu/0";

    [Fact]
    public void ReadKnownGroupBeforePublicationReturnsPendingRefreshWithoutBorrowingLatestReadings()
    {
        var cache = new MetricSnapshotCache(
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["cpu.temp"] = CpuPollingGroupId,
            },
            new MetricSnapshot
            {
                CapturedAt = DateTimeOffset.UnixEpoch,
                Readings =
                [
                    BuildReading("gpu.temp"),
                ],
                Warnings = ["startup warning"],
            });

        MetricSnapshot snapshot = cache.Read(["cpu.temp"]);

        Assert.Empty(snapshot.Readings);
        MetricUnavailableReport unavailableReport = Assert.Single(snapshot.UnavailableMetrics);
        Assert.Equal("cpu.temp", unavailableReport.MetricId);
        Assert.Equal(MetricUnavailableReason.PendingRefresh, unavailableReport.Reason);
        Assert.Equal(["startup warning"], snapshot.Warnings);
    }

    [Fact]
    public void PublishAggregatePollingGroupSnapshotsFiltersReadingsAndDropsTraversalWarnings()
    {
        DateTimeOffset capturedAt = DateTimeOffset.UnixEpoch.AddSeconds(5);
        var cache = new MetricSnapshotCache(
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["cpu.temp"] = CpuPollingGroupId,
                ["net.down"] = LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId,
                ["net.up"] = LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId,
                [WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId] =
                    WindowsSystemTotalDiskThroughputProvider.PollingGroupId,
            },
            BuildEmptySnapshot());
        Dictionary<string, MetricReading> readingsByMetricId = new(StringComparer.Ordinal)
        {
            ["cpu.temp"] = BuildReading("cpu.temp"),
            ["net.down"] = BuildReading("net.down"),
            ["net.up"] = BuildReading("net.up"),
            [WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId] =
                BuildReading(WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId),
        };

        cache.PublishAggregatePollingGroupSnapshots(readingsByMetricId, capturedAt);

        MetricSnapshot networkSnapshot =
            cache.ReadPollingGroup(LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId);
        MetricSnapshot diskSnapshot =
            cache.ReadPollingGroup(WindowsSystemTotalDiskThroughputProvider.PollingGroupId);

        Assert.Equal(capturedAt, networkSnapshot.CapturedAt);
        Assert.Equal(
            ["net.down", "net.up"],
            networkSnapshot.Readings
                .Select(reading => reading.MetricId)
                .OrderBy(metricId => metricId, StringComparer.Ordinal));
        Assert.Empty(networkSnapshot.Warnings);
        MetricReading diskReading = Assert.Single(diskSnapshot.Readings);
        Assert.Equal(WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId, diskReading.MetricId);
        Assert.Empty(diskSnapshot.Warnings);
    }

    [Fact]
    public void ReplaceFilteredPollingGroupSnapshotKeepsOnlyMetricsOwnedByThatGroup()
    {
        var cache = new MetricSnapshotCache(
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["cpu.temp"] = CpuPollingGroupId,
                ["cpu.power"] = CpuPollingGroupId,
                ["gpu.temp"] = GpuPollingGroupId,
            },
            BuildEmptySnapshot());
        Dictionary<string, MetricReading> readingsByMetricId = new(StringComparer.Ordinal)
        {
            ["cpu.temp"] = BuildReading("cpu.temp"),
            ["gpu.temp"] = BuildReading("gpu.temp"),
        };
        MetricUnavailableReport[] unavailableReports =
        [
            BuildUnavailableReport("cpu.power"),
            BuildUnavailableReport("gpu.power"),
        ];

        cache.ReplaceFilteredPollingGroupSnapshot(
            CpuPollingGroupId,
            readingsByMetricId,
            ["cpu warning"],
            DateTimeOffset.UnixEpoch,
            unavailableReports);

        MetricSnapshot snapshot = cache.ReadPollingGroup(CpuPollingGroupId);

        MetricReading reading = Assert.Single(snapshot.Readings);
        MetricUnavailableReport unavailableReport = Assert.Single(snapshot.UnavailableMetrics);
        Assert.Equal("cpu.temp", reading.MetricId);
        Assert.Equal("cpu.power", unavailableReport.MetricId);
        Assert.Equal(["cpu warning"], snapshot.Warnings);
    }

    private static MetricSnapshot BuildEmptySnapshot()
    {
        return new MetricSnapshot
        {
            CapturedAt = DateTimeOffset.UnixEpoch,
            Readings = [],
            Warnings = [],
        };
    }

    private static MetricReading BuildReading(string metricId)
    {
        return new MetricReading
        {
            MetricId = metricId,
            HardwareId = "hardware",
            HardwareName = "Hardware",
            HardwareType = "Fake",
            SensorId = $"sensor:{metricId}",
            SensorName = metricId,
            SourceSensorType = "Temperature",
            Value = 42,
            Unit = MetricUnit.Celsius,
        };
    }

    private static MetricUnavailableReport BuildUnavailableReport(string metricId)
    {
        return new MetricUnavailableReport
        {
            MetricId = metricId,
            Reason = MetricUnavailableReason.NoSensor,
        };
    }
}
