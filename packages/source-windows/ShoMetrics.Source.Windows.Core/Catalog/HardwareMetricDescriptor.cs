namespace ShoMetrics.Source.Windows.Core;

public sealed record HardwareMetricDescriptor
{
    public required string MetricId { get; init; }

    public required string SourceSensorId { get; init; }

    /// <summary>
    /// Helper-owned collector cost group for this metric.
    /// </summary>
    /// <remarks>
    /// The Hub treats this value as opaque. It is the boundary that lets helper
    /// metrics from one refreshed hardware group share an IPC request without
    /// making fast groups wait for unrelated slow hardware.
    /// </remarks>
    public required string PollingGroupId { get; init; }

    public required string HardwareId { get; init; }

    public required string HardwareName { get; init; }

    public required string HardwareType { get; init; }

    public required string SensorName { get; init; }

    public required string SourceSensorType { get; init; }

    public required MetricValueKind ValueKind { get; init; }

    public required MetricUnit Unit { get; init; }

    public required MetricIdKind MetricIdKind { get; init; }
}
