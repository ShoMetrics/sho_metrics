namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class LibreHardwareMonitorSessionTests
{
    [Fact]
    public async Task NativeOnlySessionPublishesSystemTotalDiskThroughputReadings()
    {
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession(provider);

        MetricSnapshot snapshot = await session.RefreshSnapshotAsync(CancellationToken.None);

        Dictionary<string, MetricReading> readings = snapshot.Readings.ToDictionary(
            reading => reading.MetricId,
            StringComparer.Ordinal);
        Assert.Equal(120, readings[WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId].Value);
        Assert.Equal(30, readings[WindowsSystemTotalDiskThroughputProvider.WriteThroughputMetricId].Value);
        Assert.Equal(150, readings[WindowsSystemTotalDiskThroughputProvider.TotalThroughputMetricId].Value);
    }

    [Fact]
    public async Task NativeOnlySessionPublishesRefreshDiagnostics()
    {
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession(provider);

        MetricSnapshotRefreshResult result = await session.RefreshSnapshotWithDiagnosticsAsync(CancellationToken.None);

        Assert.False(result.Diagnostics.UsesLibreHardwareMonitor);
        Assert.Empty(result.Diagnostics.HardwareUpdates);
        Assert.Equal(result.Snapshot.Readings.Count, result.Diagnostics.ReadingCount);
        Assert.Equal(result.Snapshot.UnavailableMetrics.Count, result.Diagnostics.UnavailableMetricCount);
        Assert.Equal(result.Snapshot.Warnings.Count, result.Diagnostics.WarningCount);
    }

    [Fact]
    public async Task NativeOnlySessionListsSystemTotalDiskThroughputDescriptors()
    {
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession(provider);

        HardwareMetricDescriptorSnapshot snapshot = await session.ListMetricDescriptorsAsync([], CancellationToken.None);

        Dictionary<string, HardwareMetricDescriptor> descriptors = snapshot.Descriptors.ToDictionary(
            descriptor => descriptor.MetricId,
            StringComparer.Ordinal);
        Assert.Equal(
            WindowsSystemTotalDiskThroughputProvider.PollingGroupId,
            descriptors[WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId].PollingGroupId);
        Assert.Equal(
            "WindowsNativeSystemTotalDisk",
            descriptors[WindowsSystemTotalDiskThroughputProvider.TotalThroughputMetricId].HardwareType);
    }

    private sealed class FakeSystemTotalDiskCounterReader : IWindowsSystemTotalDiskThroughputCounterReader
    {
        private readonly WindowsSystemTotalDiskThroughputCounterSample _sample;

        public FakeSystemTotalDiskCounterReader(WindowsSystemTotalDiskThroughputCounterSample sample)
        {
            _sample = sample;
        }

        public bool HasCounterBinding => true;

        public bool TryRead(out WindowsSystemTotalDiskThroughputCounterSample sample)
        {
            sample = _sample;
            return true;
        }

        public void Dispose()
        {
        }
    }
}
