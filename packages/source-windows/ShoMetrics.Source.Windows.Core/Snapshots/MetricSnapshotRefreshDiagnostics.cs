namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Support diagnostics captured while refreshing the helper-owned metric cache.
/// </summary>
public sealed record MetricSnapshotRefreshDiagnostics
{
    public string? PollingGroupId { get; init; }

    public required bool UsesLibreHardwareMonitor { get; init; }

    public bool SkippedByCoreGateway { get; init; }

    public TimeSpan? CoreGatewayAge { get; init; }

    public required IReadOnlyList<HardwareRefreshDiagnostic> HardwareUpdates { get; init; }

    public required int ReadingCount { get; init; }

    public required int UnavailableMetricCount { get; init; }

    public required int WarningCount { get; init; }
}
