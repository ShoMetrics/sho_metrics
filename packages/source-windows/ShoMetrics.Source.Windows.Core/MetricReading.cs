namespace ShoMetrics.Source.Windows.Core;

public sealed record MetricReading
{
    public required string MetricId { get; init; }

    public required string HardwareId { get; init; }

    public required string HardwareName { get; init; }

    public required string HardwareType { get; init; }

    public required string SensorId { get; init; }

    public required string SensorName { get; init; }

    public required string SourceSensorType { get; init; }

    public required double Value { get; init; }

    public required MetricUnit Unit { get; init; }
}
