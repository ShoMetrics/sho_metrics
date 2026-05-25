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
}
