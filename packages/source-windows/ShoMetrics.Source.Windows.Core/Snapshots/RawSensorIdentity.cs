namespace ShoMetrics.Source.Windows.Core;

public sealed record RawSensorIdentity
{
    public required string SourceSensorId { get; init; }

    public required string HardwareId { get; init; }

    public required string HardwareName { get; init; }

    public required string HardwareType { get; init; }

    public required string SensorName { get; init; }

    public required string SourceSensorType { get; init; }
}
