namespace ShoMetrics.Source.Windows.Core;

public static class MetricRefreshDemandConstants
{
    public static readonly TimeSpan MinimumRefreshInterval = TimeSpan.FromSeconds(1);

    public static readonly TimeSpan MaximumRefreshInterval = TimeSpan.FromSeconds(60);

    public static readonly TimeSpan DemandTtl = TimeSpan.FromSeconds(15);

    public static readonly TimeSpan MinimumCoreLhmRefreshInterval = TimeSpan.FromMilliseconds(250);
}
