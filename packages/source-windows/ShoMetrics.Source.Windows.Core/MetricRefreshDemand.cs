namespace ShoMetrics.Source.Windows.Core;

public sealed record MetricRefreshDemand
{
    public required string PollingGroupId { get; init; }

    public required IReadOnlyList<string> MetricIds { get; init; }

    public required TimeSpan RequestedInterval { get; init; }
}
