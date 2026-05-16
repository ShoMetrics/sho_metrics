namespace ShoMetrics.Source.Windows.Core;

public sealed record MetricSnapshot
{
    public required DateTimeOffset CapturedAt { get; init; }

    public required IReadOnlyList<MetricReading> Readings { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }
}
