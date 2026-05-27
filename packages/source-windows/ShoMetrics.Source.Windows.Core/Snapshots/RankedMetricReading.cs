namespace ShoMetrics.Source.Windows.Core;

internal sealed record RankedMetricReading
{
    public required MetricReading Reading { get; init; }

    public required int Rank { get; init; }
}
