namespace ShoMetrics.Source.Windows.Core;

public sealed record HardwareMetricDescriptor
{
    public required string MetricId { get; init; }

    public required string SourceSensorId { get; init; }

    public required string HardwareId { get; init; }

    public required string HardwareName { get; init; }

    public required string SensorName { get; init; }

    public required string SensorType { get; init; }

    public required string Unit { get; init; }

    public required bool IsDynamic { get; init; }
}
