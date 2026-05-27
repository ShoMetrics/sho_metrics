namespace ShoMetrics.Source.Windows.Core;

public sealed record MetricRefreshDemandApplyResult
{
    public required int AcceptedGroupCount { get; init; }

    public required int IgnoredGroupCount { get; init; }

    public required TimeSpan EffectiveMinimumRefreshInterval { get; init; }

    public required TimeSpan DemandTtl { get; init; }

    public required IReadOnlyList<HardwareSourceWarning> Warnings { get; init; }
}
