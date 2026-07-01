using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class LibreHardwareMetricCatalogTests
{
    public static TheoryData<string, int> CpuTemperatureRanks =>
        new()
        {
            { "Core (Tctl/Tdie)", 0 },
            { "Core (Tdie)", 1 },
            { "CPU Package", 2 },
            { "Package Temperature", 3 },
            { "Core (Tctl)", 4 },
            { "CCDs Max (Tdie)", 5 },
            { "Core Max", 6 },
            { "CCDs Average (Tdie)", 7 },
            { "Core Average", 7 },
            { "CPU Cores", 8 },
            { "Core #0", 9 },
        };

    public static TheoryData<string> RejectedCpuTemperatureNames =>
        new()
        {
            "CPU VRM",
            "CPU Fan",
            "Pump",
            "Liquid",
            "Distance to TjMax",
            "Motherboard",
            "Controller",
        };

    public static TheoryData<string, int> CpuPowerRanks =>
        new()
        {
            { "CPU Package", 0 },
            { "Package", 0 },
            { "CPU Package Power", 0 },
            { "CPU Socket", 1 },
            { "CPU PPT", 2 },
            { "CPU Cores", 3 },
        };

    public static TheoryData<string> RejectedCpuPowerNames =>
        new()
        {
            "GPU Package",
            "Graphics",
            "DRAM",
            "Memory",
            "Socket VRM",
            "PSU",
            "SoC",
        };

    public static TheoryData<string, Func<IHardware>, Func<ISensor>, MetricUnit, double> BuiltInStableAliasReadings =>
        new()
        {
            {
                "cpu.usage_percent",
                FakeHardware.Cpu,
                () => FakeSensor.Load("CPU Total", value: 37),
                MetricUnit.Percent,
                37
            },
            {
                "gpu.usage_percent",
                FakeHardware.Gpu,
                () => FakeSensor.Load("GPU Core", value: 42),
                MetricUnit.Percent,
                42
            },
            {
                "gpu.temp",
                FakeHardware.Gpu,
                () => FakeSensor.Temperature("GPU Core", value: 55),
                MetricUnit.Celsius,
                55
            },
            {
                "gpu.power",
                FakeHardware.Gpu,
                () => FakeSensor.Power("GPU Package", value: 75),
                MetricUnit.Watts,
                75
            },
            {
                "gpu.vram_used",
                FakeHardware.Gpu,
                () => FakeSensor.SmallData("GPU Memory Used", value: 512),
                MetricUnit.Bytes,
                512d * 1024d * 1024d
            },
            {
                "gpu.vram_total",
                FakeHardware.Gpu,
                () => FakeSensor.SmallData("GPU Memory Total", value: 8192),
                MetricUnit.Bytes,
                8192d * 1024d * 1024d
            },
            {
                "ram.used",
                FakeHardware.Memory,
                () => FakeSensor.Data("Memory Used", value: 8),
                MetricUnit.Bytes,
                8d * 1024d * 1024d * 1024d
            },
            {
                LibreHardwareMetricCatalog.RamAvailableMetricId,
                FakeHardware.Memory,
                () => FakeSensor.Data("Memory Available", value: 24),
                MetricUnit.Bytes,
                24d * 1024d * 1024d * 1024d
            },
            {
                "net.down",
                FakeHardware.Network,
                () => FakeSensor.Throughput("Download Speed", value: 1024),
                MetricUnit.BytesPerSecond,
                1024
            },
            {
                "net.up",
                FakeHardware.Network,
                () => FakeSensor.Throughput("Upload Speed", value: 256),
                MetricUnit.BytesPerSecond,
                256
            },
        };

    [Theory]
    [MemberData(nameof(CpuTemperatureRanks))]
    public void CpuTemperatureStableAliasRanksKnownCpuSensorNames(string sensorName, int expectedRank)
    {
        bool classified = LibreHardwareMetricCatalog.TryClassifyCpuStableAliasSensor(
            FakeHardware.Cpu(),
            FakeSensor.Temperature(sensorName, value: 51),
            out string? metricId,
            out int rank);

        Assert.True(classified);
        Assert.Equal(LibreHardwareMetricCatalog.CpuTemperatureMetricId, metricId);
        Assert.Equal(expectedRank, rank);
    }

    [Theory]
    [MemberData(nameof(RejectedCpuTemperatureNames))]
    public void CpuTemperatureStableAliasRejectsNonCpuTemperatureNames(string sensorName)
    {
        bool classified = LibreHardwareMetricCatalog.TryClassifyCpuStableAliasSensor(
            FakeHardware.Cpu(),
            FakeSensor.Temperature(sensorName, value: 51),
            out string? metricId,
            out int rank);

        Assert.False(classified);
        Assert.Null(metricId);
        Assert.Equal(0, rank);
    }

    [Theory]
    [MemberData(nameof(CpuPowerRanks))]
    public void CpuPowerStableAliasRanksKnownCpuSensorNames(string sensorName, int expectedRank)
    {
        bool classified = LibreHardwareMetricCatalog.TryClassifyCpuStableAliasSensor(
            FakeHardware.Cpu(),
            FakeSensor.Power(sensorName, value: 65),
            out string? metricId,
            out int rank);

        Assert.True(classified);
        Assert.Equal(LibreHardwareMetricCatalog.CpuPowerMetricId, metricId);
        Assert.Equal(expectedRank, rank);
    }

    [Theory]
    [MemberData(nameof(RejectedCpuPowerNames))]
    public void CpuPowerStableAliasRejectsNonCpuPowerNames(string sensorName)
    {
        bool classified = LibreHardwareMetricCatalog.TryClassifyCpuStableAliasSensor(
            FakeHardware.Cpu(),
            FakeSensor.Power(sensorName, value: 65),
            out string? metricId,
            out int rank);

        Assert.False(classified);
        Assert.Null(metricId);
        Assert.Equal(0, rank);
    }

    [Theory]
    [MemberData(nameof(BuiltInStableAliasReadings))]
    public void CreateReadingsEmitsStableAliasForBuiltInMetricFamily(
        string expectedMetricId,
        Func<IHardware> createHardware,
        Func<ISensor> createSensor,
        MetricUnit expectedUnit,
        double expectedValue)
    {
        AssertStableAliasReading(
            createHardware(),
            createSensor(),
            expectedMetricId,
            expectedUnit,
            expectedValue);
    }

    [Fact]
    public void CpuStableAliasOnlyAppliesToCpuHardware()
    {
        bool classified = LibreHardwareMetricCatalog.TryClassifyCpuStableAliasSensor(
            FakeHardware.Gpu(),
            FakeSensor.Temperature("CPU Package", value: 51),
            out string? metricId,
            out _);

        Assert.False(classified);
        Assert.Null(metricId);
    }

    [Fact]
    public void CpuTemperatureDescriptorAllowsZeroValueSensors()
    {
        bool classified = LibreHardwareMetricCatalog.TryCreateCpuStableAliasDescriptorCandidate(
            FakeHardware.Cpu(),
            FakeSensor.Temperature("CPU Package", value: null),
            out RankedHardwareMetricDescriptor? candidate);

        Assert.True(classified);
        Assert.NotNull(candidate);
        Assert.Equal(LibreHardwareMetricCatalog.CpuTemperatureMetricId, candidate.Descriptor.MetricId);
    }

    [Fact]
    public void CpuTemperatureReadingAllowsFiniteZeroValueSensors()
    {
        bool classified = LibreHardwareMetricCatalog.TryCreateCpuStableAliasReadingCandidate(
            FakeHardware.Cpu(),
            FakeSensor.Temperature("CPU Package", value: 0),
            out RankedMetricReading? candidate);

        Assert.True(classified);
        Assert.NotNull(candidate);
        Assert.Equal(0, candidate.Reading.Value);
    }

    [Fact]
    public void CpuPowerReadingRejectsNegativeValues()
    {
        bool classified = LibreHardwareMetricCatalog.TryCreateCpuStableAliasReadingCandidate(
            FakeHardware.Cpu(),
            FakeSensor.Power("CPU Package", value: -1),
            out RankedMetricReading? candidate);

        Assert.False(classified);
        Assert.Null(candidate);
    }

    [Fact]
    public void GpuFallbackStableAliasAcceptsIntelIntegratedD3dUsage()
    {
        bool classified = LibreHardwareMetricCatalog.TryCreateGpuFallbackStableAliasReadingCandidate(
            FakeHardware.GpuIntelIntegrated(),
            FakeSensor.Load("D3D 3D", value: 42),
            out RankedMetricReading? candidate);

        Assert.True(classified);
        Assert.NotNull(candidate);
        Assert.Equal(LibreHardwareMetricCatalog.GpuUsageMetricId, candidate.Reading.MetricId);
        Assert.Equal(42, candidate.Reading.Value);
    }

    [Fact]
    public void GpuFallbackStableAliasAcceptsIntelIntegratedSharedMemory()
    {
        bool classified = LibreHardwareMetricCatalog.TryCreateGpuFallbackStableAliasReadingCandidate(
            FakeHardware.GpuIntelIntegrated(),
            FakeSensor.SmallData("D3D Shared Memory Used", value: 512),
            out RankedMetricReading? candidate);

        Assert.True(classified);
        Assert.NotNull(candidate);
        Assert.Equal(LibreHardwareMetricCatalog.GpuVramUsedMetricId, candidate.Reading.MetricId);
        Assert.Equal(512d * 1024d * 1024d, candidate.Reading.Value);
    }

    [Fact]
    public void GpuFallbackStableAliasRejectsSharedMemoryOnNvidiaGpu()
    {
        bool classified = LibreHardwareMetricCatalog.TryCreateGpuFallbackStableAliasReadingCandidate(
            FakeHardware.GpuNvidia(),
            FakeSensor.SmallData("D3D Shared Memory Used", value: 512),
            out RankedMetricReading? candidate);

        Assert.False(classified);
        Assert.Null(candidate);
    }

    [Fact]
    public void GpuFallbackStableAliasRejectsSharedMemoryOnDiscreteIntelArc()
    {
        bool classified = LibreHardwareMetricCatalog.TryCreateGpuFallbackStableAliasReadingCandidate(
            FakeHardware.GpuIntelDiscrete(),
            FakeSensor.SmallData("D3D Shared Memory Used", value: 512),
            out RankedMetricReading? candidate);

        Assert.False(classified);
        Assert.Null(candidate);
    }

    [Fact]
    public void GpuFallbackStableAliasAcceptsDedicatedMemoryOnDiscreteGpu()
    {
        bool classified = LibreHardwareMetricCatalog.TryCreateGpuFallbackStableAliasReadingCandidate(
            FakeHardware.GpuNvidia(),
            FakeSensor.SmallData("D3D Dedicated Memory Total", value: 8192),
            out RankedMetricReading? candidate);

        Assert.True(classified);
        Assert.NotNull(candidate);
        Assert.Equal(LibreHardwareMetricCatalog.GpuVramTotalMetricId, candidate.Reading.MetricId);
        Assert.Equal(8192d * 1024d * 1024d, candidate.Reading.Value);
    }

    [Fact]
    public void StorageThroughputDoesNotCreateFirstClassDiskAliases()
    {
        IReadOnlyList<MetricReading> readings = LibreHardwareMetricCatalog.CreateReadings(
            FakeHardware.Storage(),
            FakeSensor.Throughput("Read Rate", value: 1024));
        IReadOnlyList<HardwareMetricDescriptor> descriptors = LibreHardwareMetricCatalog.CreateDescriptors(
            FakeHardware.Storage(),
            FakeSensor.Throughput("Read Rate", value: null));

        Assert.DoesNotContain(
            readings,
            reading => reading.MetricId == WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId);
        Assert.DoesNotContain(
            descriptors,
            descriptor => descriptor.MetricId == WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId);
        Assert.Contains(readings, reading => LibreHardwareMetricCatalog.IsSourceSensorMetricId(reading.MetricId));
        Assert.Contains(descriptors, descriptor => LibreHardwareMetricCatalog.IsSourceSensorMetricId(descriptor.MetricId));
    }

    private static void AssertStableAliasReading(
        IHardware hardware,
        ISensor sensor,
        string expectedMetricId,
        MetricUnit expectedUnit,
        double expectedValue)
    {
        IReadOnlyList<MetricReading> readings = LibreHardwareMetricCatalog.CreateReadings(hardware, sensor);
        MetricReading stableAlias = readings.Single(reading =>
            reading.MetricId.Equals(expectedMetricId, StringComparison.Ordinal));

        Assert.Equal(expectedUnit, stableAlias.Unit);
        Assert.Equal(expectedValue, stableAlias.Value);
    }
}
