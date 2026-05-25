namespace ShoMetrics.Source.Windows.Core;

public sealed record MetricUnavailableReport
{
    public required string MetricId { get; init; }

    public required MetricUnavailableReason Reason { get; init; }

    public RawSensorIdentity? RawSensorIdentity { get; init; }
}
