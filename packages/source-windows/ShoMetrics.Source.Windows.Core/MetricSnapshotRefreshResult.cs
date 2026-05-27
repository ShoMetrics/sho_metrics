namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Result of one helper cache refresh plus non-transport diagnostic facts.
/// </summary>
public sealed record MetricSnapshotRefreshResult
{
    public required MetricSnapshot Snapshot { get; init; }

    public required MetricSnapshotRefreshDiagnostics Diagnostics { get; init; }
}
