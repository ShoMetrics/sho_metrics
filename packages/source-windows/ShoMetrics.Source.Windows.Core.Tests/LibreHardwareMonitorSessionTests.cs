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
    public async Task ReadSnapshotForKnownGroupBeforeFirstRefreshReturnsPendingRefresh()
    {
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Temperature("CPU Package", value: 55),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider);
        string cpuRawTemperatureMetricId = "lhm.sensor:/cpu/0/temperature/0";

        MetricSnapshot snapshot = await session.ReadSnapshotAsync(
            [cpuRawTemperatureMetricId],
            CancellationToken.None);

        Assert.Empty(snapshot.Readings);
        Assert.Contains(snapshot.UnavailableMetrics, report =>
            report.MetricId == cpuRawTemperatureMetricId
                && report.Reason == MetricUnavailableReason.PendingRefresh);
    }

    [Fact]
    public async Task ReadSnapshotForKnownGroupReturnsValuesAfterFirstRefresh()
    {
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Temperature("CPU Package", value: 55),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider);
        string cpuRawTemperatureMetricId = "lhm.sensor:/cpu/0/temperature/0";

        await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);
        MetricSnapshot snapshot = await session.ReadSnapshotAsync(
            [cpuRawTemperatureMetricId],
            CancellationToken.None);

        Assert.Contains(snapshot.Readings, reading => reading.MetricId == cpuRawTemperatureMetricId);
        Assert.DoesNotContain(snapshot.UnavailableMetrics, report =>
            report.MetricId == cpuRawTemperatureMetricId
                && report.Reason == MetricUnavailableReason.PendingRefresh);
    }

    [Fact]
    public async Task ReadSnapshotForUnknownMetricStillReturnsNoSensor()
    {
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Temperature("CPU Package", value: 55),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider);

        MetricSnapshot snapshot = await session.ReadSnapshotAsync(
            ["unknown.metric"],
            CancellationToken.None);

        Assert.Empty(snapshot.Readings);
        Assert.Contains(snapshot.UnavailableMetrics, report =>
            report.MetricId == "unknown.metric"
                && report.Reason == MetricUnavailableReason.NoSensor);
    }

    [Fact]
    public async Task ReadSnapshotDoesNotUseGlobalLatestForKnownPendingPollingGroup()
    {
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
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
        string cpuRawTemperatureMetricId = "lhm.sensor:/cpu/0/temperature/0";

        await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(gpuHardware),
            CancellationToken.None);
        MetricSnapshot snapshot = await session.ReadSnapshotAsync(
            [cpuRawTemperatureMetricId],
            CancellationToken.None);

        Assert.Empty(snapshot.Readings);
        Assert.Contains(snapshot.UnavailableMetrics, report =>
            report.MetricId == cpuRawTemperatureMetricId
                && report.Reason == MetricUnavailableReason.PendingRefresh);
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
    public async Task RefreshPollingGroupForIntelIntegratedGpuPublishesD3dFallbackAliases()
    {
        FakeHardware gpuHardware = FakeHardware.GpuIntelIntegrated();
        gpuHardware.Sensors =
        [
            FakeSensor.Load("D3D 3D", value: 42),
            FakeSensor.SmallData("D3D Shared Memory Used", value: 512),
            FakeSensor.SmallData("D3D Shared Memory Total", value: 8192),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([gpuHardware], provider);

        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(gpuHardware),
            CancellationToken.None);

        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is { MetricId: LibreHardwareMetricCatalog.GpuUsageMetricId, Value: 42 });
        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is { MetricId: LibreHardwareMetricCatalog.GpuVramUsedMetricId, Value: 512d * 1024d * 1024d });
        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is { MetricId: LibreHardwareMetricCatalog.GpuVramTotalMetricId, Value: 8192d * 1024d * 1024d });
    }

    [Fact]
    public async Task ListMetricDescriptorsForIntelIntegratedGpuPublishesD3dFallbackAliases()
    {
        FakeHardware gpuHardware = FakeHardware.GpuIntelIntegrated();
        gpuHardware.Sensors =
        [
            FakeSensor.Load("D3D 3D", value: null),
            FakeSensor.SmallData("D3D Shared Memory Used", value: null),
            FakeSensor.SmallData("D3D Shared Memory Total", value: null),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([gpuHardware], provider);

        HardwareMetricDescriptorSnapshot snapshot = await session.ListMetricDescriptorsAsync([], CancellationToken.None);

        Assert.Contains(snapshot.Descriptors, descriptor =>
            descriptor.MetricId == LibreHardwareMetricCatalog.GpuUsageMetricId);
        Assert.Contains(snapshot.Descriptors, descriptor =>
            descriptor.MetricId == LibreHardwareMetricCatalog.GpuVramUsedMetricId);
        Assert.Contains(snapshot.Descriptors, descriptor =>
            descriptor.MetricId == LibreHardwareMetricCatalog.GpuVramTotalMetricId);
    }

    [Fact]
    public async Task RefreshPollingGroupForNvidiaGpuDoesNotUseSharedMemoryFallback()
    {
        FakeHardware gpuHardware = FakeHardware.GpuNvidia();
        gpuHardware.Sensors =
        [
            FakeSensor.SmallData("GPU Memory Used", value: null),
            FakeSensor.SmallData("D3D Shared Memory Used", value: 512),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([gpuHardware], provider);

        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(gpuHardware),
            CancellationToken.None);

        Assert.DoesNotContain(result.Snapshot.Readings, reading =>
            reading.MetricId == LibreHardwareMetricCatalog.GpuVramUsedMetricId);
        Assert.Contains(result.Snapshot.UnavailableMetrics, report =>
            report.MetricId == LibreHardwareMetricCatalog.GpuVramUsedMetricId
                && report.Reason == MetricUnavailableReason.InvalidValue);
    }

    [Fact]
    public async Task RefreshPollingGroupDoesNotUseD3dFallbackWhenVendorGpuAliasIsInvalid()
    {
        FakeHardware gpuHardware = FakeHardware.GpuNvidia();
        gpuHardware.Sensors =
        [
            FakeSensor.SmallData("GPU Memory Used", value: null),
            FakeSensor.SmallData("D3D Dedicated Memory Used", value: 512),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([gpuHardware], provider);

        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(gpuHardware),
            CancellationToken.None);

        Assert.DoesNotContain(result.Snapshot.Readings, reading =>
            reading.MetricId == LibreHardwareMetricCatalog.GpuVramUsedMetricId);
        Assert.Contains(result.Snapshot.UnavailableMetrics, report =>
            report.MetricId == LibreHardwareMetricCatalog.GpuVramUsedMetricId
                && report.Reason == MetricUnavailableReason.InvalidValue);
    }

    [Fact]
    public async Task ListMetricDescriptorsForNvidiaGpuDoesNotUseSharedMemoryFallback()
    {
        FakeHardware gpuHardware = FakeHardware.GpuNvidia();
        gpuHardware.Sensors =
        [
            FakeSensor.SmallData("D3D Shared Memory Used", value: null),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([gpuHardware], provider);

        HardwareMetricDescriptorSnapshot snapshot = await session.ListMetricDescriptorsAsync([], CancellationToken.None);

        Assert.DoesNotContain(snapshot.Descriptors, descriptor =>
            descriptor.MetricId == LibreHardwareMetricCatalog.GpuVramUsedMetricId);
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
    public async Task RefreshPollingGroupPublishesRetainedReadingWhenHardwareUpdateFails()
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

        await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        cpuHardware.OnUpdate = () => throw new InvalidOperationException("simulated update failure");
        timeProvider.Advance(MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval);
        MetricSnapshotRefreshResult result = await session.RefreshPollingGroupWithDiagnosticsAsync(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(cpuHardware),
            CancellationToken.None);

        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is
            {
                MetricId: "cpu.usage_percent",
                Value: 42,
                ValueFreshness: MetricValueFreshness.Retained,
            });
        Assert.DoesNotContain(result.Snapshot.Readings, reading =>
            reading.MetricId == "cpu.usage_percent"
                && reading.ValueFreshness == MetricValueFreshness.Fresh);
        HardwareRefreshDiagnostic updateDiagnostic = Assert.Single(result.Diagnostics.HardwareUpdates);
        Assert.False(updateDiagnostic.UpdateSucceeded);
        Assert.Contains("InvalidOperationException", updateDiagnostic.UpdateError);
    }

    [Fact]
    public async Task RefreshSnapshotPublishesRetainedSubHardwareReadingsWhenParentUpdateFails()
    {
        var timeProvider = new ManualTimeProvider();
        FakeSensor childCpuLoad = FakeSensor.Load("CPU Total", value: 42);
        FakeHardware childCpuHardware = FakeHardware.Cpu();
        childCpuHardware.Sensors = [childCpuLoad];
        FakeHardware motherboardHardware = FakeHardware.Motherboard();
        motherboardHardware.SubHardware = [childCpuHardware];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([motherboardHardware], provider, timeProvider);

        await session.RefreshSnapshotWithDiagnosticsAsync(CancellationToken.None);

        motherboardHardware.OnUpdate = () => throw new InvalidOperationException("simulated parent update failure");
        childCpuLoad.Value = 99;
        timeProvider.Advance(MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval);
        MetricSnapshotRefreshResult result = await session.RefreshSnapshotWithDiagnosticsAsync(CancellationToken.None);

        Assert.Contains(result.Snapshot.Readings, reading =>
            reading is
            {
                MetricId: "cpu.usage_percent",
                Value: 42,
                ValueFreshness: MetricValueFreshness.Retained,
            });
        Assert.DoesNotContain(result.Snapshot.Readings, reading =>
            reading.MetricId == "cpu.usage_percent"
                && reading.Value == 99);
    }

    [Fact]
    public async Task DescriptorCatalogKeepsSubHardwareWhenParentPreloadUpdateFails()
    {
        // Motherboard voltage/fan sensors live on the SuperIO subhardware. The
        // descriptor catalog is built once at session construction, so a parent
        // update failure during that preload must not drop the child subtree
        // from the Property Inspector picker for the process lifetime.
        FakeHardware superIoHardware = FakeHardware.SuperIo();
        superIoHardware.Sensors = [FakeSensor.Voltage("Vcore", value: 1.25f)];
        FakeHardware motherboardHardware = FakeHardware.Motherboard();
        motherboardHardware.SubHardware = [superIoHardware];
        motherboardHardware.OnUpdate = () => throw new InvalidOperationException("simulated preload update failure");
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([motherboardHardware], provider);

        HardwareMetricDescriptorSnapshot descriptorSnapshot = await session.ListMetricDescriptorsAsync(
            [],
            CancellationToken.None);

        Assert.Contains(descriptorSnapshot.Descriptors, descriptor =>
            descriptor.HardwareType == "SuperIO"
                && descriptor.MetricId == "lhm.sensor:/cpu/0/voltage/0");
        Assert.Contains(descriptorSnapshot.Warnings, warning =>
            warning.Contains("Hardware update failed", StringComparison.Ordinal));
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

    [Fact]
    public async Task PollingGroupSnapshotsUseEachHardwareCaptureTime()
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
        cpuHardware.OnUpdate = () => timeProvider.Advance(TimeSpan.FromSeconds(2));
        gpuHardware.OnUpdate = () => timeProvider.Advance(TimeSpan.FromSeconds(5));

        await session.RefreshSnapshotAsync(CancellationToken.None);

        MetricSnapshot cpuSnapshot = await session.ReadSnapshotAsync(["cpu.usage_percent"], CancellationToken.None);
        MetricSnapshot gpuSnapshot = await session.ReadSnapshotAsync(["gpu.usage_percent"], CancellationToken.None);

        Assert.Equal(DateTimeOffset.UnixEpoch.AddSeconds(2), cpuSnapshot.CapturedAt);
        Assert.Equal(DateTimeOffset.UnixEpoch.AddSeconds(7), gpuSnapshot.CapturedAt);
    }

    [Fact]
    public void DescriptorSnapshotReportsDriverEvidenceForPositiveCpuTemperature()
    {
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Load("CPU Total", value: 42),
            FakeSensor.Temperature("Core (Tctl/Tdie)", value: 55),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider);

        Assert.True(session.DescriptorSnapshot.HasDriverBackedSensorReading);
    }

    [Fact]
    public void DescriptorSnapshotReportsNoDriverEvidenceWhenCpuTemperatureReadsZero()
    {
        // Mirrors a broken/unloaded PawnIO driver: LHM still activates the CPU
        // temperature sensor, but at the 0 C failed-read sentinel. CPU load stays
        // available because it comes from performance counters.
        FakeHardware cpuHardware = FakeHardware.Cpu();
        cpuHardware.Sensors =
        [
            FakeSensor.Load("CPU Total", value: 42),
            FakeSensor.Temperature("Core (Tctl/Tdie)", value: 0),
        ];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([cpuHardware], provider);

        Assert.False(session.DescriptorSnapshot.HasDriverBackedSensorReading);
    }

    [Fact]
    public void DescriptorSnapshotReportsDriverEvidenceForSuperIoSubHardware()
    {
        FakeHardware motherboard = FakeHardware.Motherboard();
        FakeHardware superIo = FakeHardware.SuperIo();
        superIo.Sensors =
        [
            FakeSensor.Voltage("Vcore", value: 1.2f),
        ];
        motherboard.SubHardware = [superIo];
        using var provider = new WindowsSystemTotalDiskThroughputProvider(
            new FakeSystemTotalDiskCounterReader(new WindowsSystemTotalDiskThroughputCounterSample(120, 30)));
        using var session = new LibreHardwareMonitorSession([motherboard], provider);

        Assert.True(session.DescriptorSnapshot.HasDriverBackedSensorReading);
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
        private DateTimeOffset _utcNow = DateTimeOffset.UnixEpoch;

        public override long GetTimestamp()
        {
            return _timestamp;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return _utcNow;
        }

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public void Advance(TimeSpan duration)
        {
            _timestamp += duration.Ticks;
            _utcNow += duration;
        }
    }
}
