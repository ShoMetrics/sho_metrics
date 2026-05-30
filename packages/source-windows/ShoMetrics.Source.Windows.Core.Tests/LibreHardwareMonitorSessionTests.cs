namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class LibreHardwareMonitorSessionTests
{
    [Fact]
    public async Task NativeOnlySessionPublishesAggregateDiskThroughputReadings()
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
    public async Task NativeOnlySessionListsAggregateDiskThroughputDescriptors()
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
            descriptors[WindowsSystemTotalDiskThroughputProvider.WriteThroughputMetricId].HardwareType);
    }

    [Fact]
    public async Task RefreshPollingGroupUpdatesOnlyDemandedHardware()
    {
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Load("CPU Total", value: 42),
            FakeSensor.Temperature("CPU Package", value: 55),
        ];
        FakeHardware gpuHardware = FakeHardware.Gpu();
        gpuHardware.Sensors =
        [
            FakeSensor.Load("GPU Core", value: 75),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware, gpuHardware], provider);
        cpuHardware.ResetUpdateCount();
        gpuHardware.ResetUpdateCount();

        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        Assert.Equal(1, cpuHardware.UpdateCount);
        Assert.Equal(0, gpuHardware.UpdateCount);
        Assert.True(result.Diagnostics.UsesLibreHardwareMonitor);
        Assert.False(result.Diagnostics.SkippedByCoreGateway);
        Assert.Contains(result.Snapshot.Readings, reading => reading.MetricId == "cpu.usage_percent");
        Assert.DoesNotContain(result.Snapshot.Readings, reading => reading.MetricId == "gpu.usage_percent");
    }

    [Fact]
    public async Task RefreshPollingGroupDoesNotReplaceGlobalSnapshot()
    {
        var timeProvider = new ManualTimeProvider();
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Load("CPU Total", value: 42),
        ];
        FakeHardware gpuHardware = FakeHardware.Gpu();
        gpuHardware.Sensors =
        [
            FakeSensor.Load("GPU Core", value: 75),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware, gpuHardware], provider, timeProvider);

        await session.RefreshSnapshotAsync(CancellationToken.None);
        timeProvider.Advance(MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval);
        await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        MetricSnapshot snapshot = await session.ReadSnapshotAsync(
            ["cpu.usage_percent", "gpu.usage_percent"],
            CancellationToken.None);

        Assert.Contains(snapshot.Readings, reading => reading.MetricId == "cpu.usage_percent");
        Assert.Contains(snapshot.Readings, reading => reading.MetricId == "gpu.usage_percent");
    }

    [Fact]
    public async Task RefreshPollingGroupForCpuPublishesRawSensorsAndRankedAliases()
    {
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Temperature("CPU Package", value: 55),
            FakeSensor.Power("CPU Package", value: 88),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider);

        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        Assert.Contains(result.Snapshot.Readings, reading => reading.MetricId == "lhm.sensor:/cpu/0/temperature/0");
        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is { MetricId: LibreHardwareMetricCatalog.CpuTemperatureMetricId, Value: 55 });
        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is { MetricId: LibreHardwareMetricCatalog.CpuPowerMetricId, Value: 88 });
        Assert.DoesNotContain(result.Snapshot.UnavailableMetrics, report =>
            report.MetricId is LibreHardwareMetricCatalog.CpuTemperatureMetricId
                or LibreHardwareMetricCatalog.CpuPowerMetricId);
    }

    [Fact]
    public async Task RefreshPollingGroupForNonCpuHardwareDoesNotReplaceCpuSnapshot()
    {
        var timeProvider = new ManualTimeProvider();
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Temperature("CPU Package", value: 55),
            FakeSensor.Power("CPU Package", value: 88),
        ];
        FakeHardware gpuHardware = FakeHardware.Gpu();
        gpuHardware.Sensors =
        [
            FakeSensor.Load("GPU Core", value: 75),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware, gpuHardware], provider, timeProvider);
        string cpuRawTemperatureMetricId = "lhm.sensor:/cpu/0/temperature/0";

        await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        for (int index = 0; index < 5; index++)
        {
            timeProvider.Advance(MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval);
            await session.RefreshPollingGroupWithDiagnosticsAsync(
                LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(gpuHardware),
                CancellationToken.None);
        }

        MetricSnapshot snapshot = await session.ReadSnapshotAsync(
            [
                cpuRawTemperatureMetricId,
                LibreHardwareMetricCatalog.CpuTemperatureMetricId,
                LibreHardwareMetricCatalog.CpuPowerMetricId,
            ],
            CancellationToken.None);

        Assert.Contains(snapshot.Readings, reading => reading.MetricId == cpuRawTemperatureMetricId);
        Assert.Contains(snapshot.Readings, reading => reading.MetricId == LibreHardwareMetricCatalog.CpuTemperatureMetricId);
        Assert.Contains(snapshot.Readings, reading => reading.MetricId == LibreHardwareMetricCatalog.CpuPowerMetricId);
        Assert.DoesNotContain(snapshot.UnavailableMetrics, report =>
            report.MetricId is LibreHardwareMetricCatalog.CpuTemperatureMetricId
                or LibreHardwareMetricCatalog.CpuPowerMetricId);
    }

    [Fact]
    public async Task RefreshPollingGroupRetainsCpuSensorAcrossUnrelatedGpuRefreshTicks()
    {
        var timeProvider = new ManualTimeProvider();
        FakeSensor cpuTemperature = FakeSensor.Temperature("CPU Package", value: 55);
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors = [cpuTemperature];
        FakeHardware gpuHardware = FakeHardware.Gpu();
        gpuHardware.Sensors =
        [
            FakeSensor.Load("GPU Core", value: 75),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware, gpuHardware], provider, timeProvider);
        string cpuRawTemperatureMetricId = "lhm.sensor:/cpu/0/temperature/0";

        await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        cpuTemperature.Value = null;

        for (int index = 0; index < 5; index++)
        {
            timeProvider.Advance(MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval);
            await session.RefreshPollingGroupWithDiagnosticsAsync(
                LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(gpuHardware),
                CancellationToken.None);
        }

        timeProvider.Advance(MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval);
        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is
            {
                MetricId: "lhm.sensor:/cpu/0/temperature/0",
                Value: 55,
                ValueFreshness: MetricValueFreshness.Retained,
            });
        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is
            {
                MetricId: LibreHardwareMetricCatalog.CpuTemperatureMetricId,
                Value: 55,
                ValueFreshness: MetricValueFreshness.Retained,
            });
        Assert.DoesNotContain(result.Snapshot.UnavailableMetrics, report =>
            report.MetricId == cpuRawTemperatureMetricId
                || report.MetricId == LibreHardwareMetricCatalog.CpuTemperatureMetricId);
    }

    [Fact]
    public async Task RefreshPollingGroupExpiresRetainedCpuSensorAfterAgeLimit()
    {
        var timeProvider = new ManualTimeProvider();
        FakeSensor cpuTemperature = FakeSensor.Temperature("CPU Package", value: 55);
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors = [cpuTemperature];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider, timeProvider);
        string cpuRawTemperatureMetricId = "lhm.sensor:/cpu/0/temperature/0";

        await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        cpuTemperature.Value = null;
        timeProvider.Advance(TimeSpan.FromMinutes(2));
        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        Assert.DoesNotContain(result.Snapshot.Readings, reading =>
            reading.MetricId == cpuRawTemperatureMetricId
                || reading.MetricId == LibreHardwareMetricCatalog.CpuTemperatureMetricId);
        Assert.Contains(result.Snapshot.UnavailableMetrics, report =>
            report.MetricId == cpuRawTemperatureMetricId
                && report.Reason == MetricUnavailableReason.Expired);
        Assert.Contains(result.Snapshot.UnavailableMetrics, report =>
            report.MetricId == LibreHardwareMetricCatalog.CpuTemperatureMetricId
                && report.Reason == MetricUnavailableReason.Expired);
    }

    [Fact]
    public async Task RefreshPollingGroupForNativeDiskDoesNotTraverseLhmStorage()
    {
        FakeHardware storageHardware = FakeHardware.Storage();
        storageHardware.Sensors =
        [
            FakeSensor.Throughput("Read Rate", value: 1024),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([storageHardware], provider);
        storageHardware.ResetUpdateCount();

        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            WindowsSystemTotalDiskThroughputProvider.PollingGroupId,
            CancellationToken.None);

        Assert.Equal(0, storageHardware.UpdateCount);
        Assert.False(result.Diagnostics.UsesLibreHardwareMonitor);
        Assert.Contains(
            result.Snapshot.Readings,
            reading => reading.MetricId == WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId);
    }

    [Fact]
    public async Task RefreshNativePollingGroupDoesNotReplaceGlobalSnapshot()
    {
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Load("CPU Total", value: 42),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider);

        await session.RefreshSnapshotAsync(CancellationToken.None);
        await session.RefreshPollingGroupWithDiagnosticsAsync(
            WindowsSystemTotalDiskThroughputProvider.PollingGroupId,
            CancellationToken.None);

        MetricSnapshot snapshot = await session.ReadSnapshotAsync(
            ["cpu.usage_percent", WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId],
            CancellationToken.None);

        Assert.Contains(snapshot.Readings, reading => reading.MetricId == "cpu.usage_percent");
        Assert.Contains(
            snapshot.Readings,
            reading => reading.MetricId == WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId);
    }

    [Fact]
    public async Task CoreGatewaySkipsRuntimeLhmRefreshesInsideMinimumInterval()
    {
        var timeProvider = new ManualTimeProvider();
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Load("CPU Total", value: 42),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider, timeProvider);
        string pollingGroupId = LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware);
        cpuHardware.ResetUpdateCount();

        MetricSnapshotRefreshResult firstResult = await session.RefreshPollingGroupWithDiagnosticsAsync(
            pollingGroupId,
            CancellationToken.None);
        MetricSnapshotRefreshResult skippedResult = await session.RefreshPollingGroupWithDiagnosticsAsync(
            pollingGroupId,
            CancellationToken.None);
        timeProvider.Advance(MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval);
        MetricSnapshotRefreshResult thirdResult = await session.RefreshPollingGroupWithDiagnosticsAsync(
            pollingGroupId,
            CancellationToken.None);

        Assert.False(firstResult.Diagnostics.SkippedByCoreGateway);
        Assert.True(skippedResult.Diagnostics.SkippedByCoreGateway);
        Assert.False(thirdResult.Diagnostics.SkippedByCoreGateway);
        Assert.Equal(2, cpuHardware.UpdateCount);
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
