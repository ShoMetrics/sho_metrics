namespace ShoMetrics.Source.Windows.Core;

public sealed record HardwareMetricDescriptorSnapshot
{
    public required IReadOnlyList<HardwareMetricDescriptor> Descriptors { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }
}
