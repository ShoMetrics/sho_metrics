namespace ShoMetrics.Source.Windows.Core;

public sealed record HardwareMetricDescriptorSnapshot
{
    /// <summary>
    /// Stable SHA-256 identity for the complete descriptor catalog.
    /// </summary>
    /// <remarks>
    /// The service returns this value with descriptor responses so the Hub can
    /// decide whether active subscriptions need source-metadata re-planning.
    /// It covers the full catalog even when <see cref="Descriptors" /> is
    /// filtered to requested metric ids, and it does not describe source health
    /// or sample freshness.
    /// </remarks>
    public required string DescriptorFingerprint { get; init; }

    public required IReadOnlyList<HardwareMetricDescriptor> Descriptors { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }
}
