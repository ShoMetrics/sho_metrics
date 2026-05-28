namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class WindowsSystemTotalDiskThroughputProviderTests
{
    [Fact]
    public void ReadReturnsReadAndWriteMetrics()
    {
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(100, 40)));

        Dictionary<string, MetricReading> readings = provider
            .Read()
            .ToDictionary(reading => reading.MetricId, StringComparer.Ordinal);

        Assert.Equal(100, readings[WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId].Value);
        Assert.Equal(40, readings[WindowsSystemTotalDiskThroughputProvider.WriteThroughputMetricId].Value);
        Assert.All(readings.Values, reading => Assert.Equal(MetricUnit.BytesPerSecond, reading.Unit));
    }

    [Fact]
    public void ReadDoesNotEmitFakeSampleWhenCounterIsWarmingUp()
    {
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeDiskCounterReader(sample: null));

        Assert.Empty(provider.Read());
    }

    [Fact]
    public void CreateDescriptorsReturnsStableAggregateDiskDescriptors()
    {
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(100, 40)));

        Dictionary<string, HardwareMetricDescriptor> descriptors = provider
            .CreateDescriptors()
            .ToDictionary(descriptor => descriptor.MetricId, StringComparer.Ordinal);

        Assert.Equal(
            WindowsSystemTotalDiskThroughputProvider.PollingGroupId,
            descriptors[WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId].PollingGroupId);
        Assert.Equal(
            MetricIdKind.StableAlias,
            descriptors[WindowsSystemTotalDiskThroughputProvider.WriteThroughputMetricId].MetricIdKind);
        Assert.Equal(
            MetricUnit.BytesPerSecond,
            descriptors[WindowsSystemTotalDiskThroughputProvider.WriteThroughputMetricId].Unit);
    }

    [Fact]
    public void CreateDescriptorsReturnsEmptyWhenCounterIsUnavailable()
    {
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeDiskCounterReader(sample: null, isAvailable: false));

        Assert.Empty(provider.CreateDescriptors());
    }

    private sealed class FakeDiskCounterReader : IWindowsSystemTotalDiskThroughputCounterReader
    {
        private readonly WindowsSystemTotalDiskThroughputCounterSample? _sample;

        public FakeDiskCounterReader(
            WindowsSystemTotalDiskThroughputCounterSample? sample,
            bool isAvailable = true)
        {
            _sample = sample;
            HasCounterBinding = isAvailable;
        }

        public bool HasCounterBinding { get; }

        public bool TryRead(out WindowsSystemTotalDiskThroughputCounterSample sample)
        {
            sample = _sample.GetValueOrDefault();
            return _sample is not null;
        }

        public void Dispose()
        {
        }
    }
}
