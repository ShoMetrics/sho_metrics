using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service.Tests;

public sealed class WindowsMetricSnapshotWorkerLogTests
{
    [Fact]
    public void HardwareTypeSummaryDoesNotExposeRawHardwareIdentity()
    {
        MetricSnapshotRefreshDiagnostics diagnostics = BuildDiagnostics();

        string summary = WindowsMetricSnapshotWorker.BuildHardwareTypeSummary(diagnostics);

        Assert.Contains("Gpu", summary, StringComparison.Ordinal);
        Assert.DoesNotContain("Secret GPU 4090", summary, StringComparison.Ordinal);
        Assert.DoesNotContain("/gpu/secret/0", summary, StringComparison.Ordinal);
    }

    [Fact]
    public void DetailedHardwareSummaryIncludesRawHardwareIdentityForDebugLogs()
    {
        MetricSnapshotRefreshDiagnostics diagnostics = BuildDiagnostics();

        string summary = WindowsMetricSnapshotWorker.BuildDetailedHardwareSummary(diagnostics);

        Assert.Contains("Secret GPU 4090", summary, StringComparison.Ordinal);
        Assert.Contains("/gpu/secret/0", summary, StringComparison.Ordinal);
    }

    [Fact]
    public void DescriptorHardwareTypeSummaryCountsByHardwareTypeWithoutRawIdentity()
    {
        HardwareMetricDescriptorSnapshot descriptorSnapshot = new()
        {
            DescriptorFingerprint = "test",
            Warnings = [],
            Descriptors =
            [
                BuildDescriptor("SuperIO", "lhm.sensor:/superio/0/voltage/0"),
                BuildDescriptor("SuperIO", "lhm.sensor:/superio/0/fan/0"),
                BuildDescriptor("Cpu", "cpu.temp"),
                BuildDescriptor(string.Empty, "disk.system.throughput.read"),
            ],
        };

        string summary = WindowsMetricSnapshotWorker.BuildDescriptorHardwareTypeSummary(descriptorSnapshot);

        Assert.Equal("(native):1,Cpu:1,SuperIO:2", summary);
    }

    [Fact]
    public void DescriptorHardwareTypeSummaryReportsNoneForEmptyCatalog()
    {
        HardwareMetricDescriptorSnapshot descriptorSnapshot = new()
        {
            DescriptorFingerprint = "",
            Warnings = [],
            Descriptors = [],
        };

        Assert.Equal("none", WindowsMetricSnapshotWorker.BuildDescriptorHardwareTypeSummary(descriptorSnapshot));
    }

    private static HardwareMetricDescriptor BuildDescriptor(string hardwareType, string metricId)
    {
        return new HardwareMetricDescriptor
        {
            MetricId = metricId,
            SourceSensorId = metricId,
            PollingGroupId = "lhm:hardware:test",
            HardwareId = "/test/0",
            HardwareName = "Test Hardware",
            HardwareType = hardwareType,
            SensorName = "Test Sensor",
            SourceSensorType = "Voltage",
            ValueKind = MetricValueKind.Scalar,
            Unit = MetricUnit.Volts,
            MetricIdKind = MetricIdKind.SourceSensor,
        };
    }

    private static MetricSnapshotRefreshDiagnostics BuildDiagnostics()
    {
        return new MetricSnapshotRefreshDiagnostics
        {
            UsesLibreHardwareMonitor = true,
            HardwareUpdates =
            [
                new HardwareRefreshDiagnostic
                {
                    HardwareId = "/gpu/secret/0",
                    HardwareName = "Secret GPU 4090",
                    HardwareType = "Gpu",
                    UpdateDuration = TimeSpan.FromMilliseconds(123),
                    UpdateSucceeded = true,
                    SensorCount = 42,
                    SubHardwareCount = 0,
                },
            ],
            ReadingCount = 3,
            UnavailableMetricCount = 1,
            WarningCount = 0,
        };
    }
}
