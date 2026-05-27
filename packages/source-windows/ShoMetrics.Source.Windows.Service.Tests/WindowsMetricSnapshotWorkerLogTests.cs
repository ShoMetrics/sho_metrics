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
