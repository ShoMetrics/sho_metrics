namespace ShoMetrics.Source.Windows.Core;

internal sealed record RankedHardwareMetricDescriptor
{
    public required HardwareMetricDescriptor Descriptor { get; init; }

    public required int Rank { get; init; }
}
