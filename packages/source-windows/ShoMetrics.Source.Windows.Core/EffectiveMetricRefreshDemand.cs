namespace ShoMetrics.Source.Windows.Core;

public sealed record EffectiveMetricRefreshDemand
{
    public required string PollingGroupId { get; init; }

    public required IReadOnlyList<string> MetricIds { get; init; }

    public required TimeSpan RefreshInterval { get; init; }
}
