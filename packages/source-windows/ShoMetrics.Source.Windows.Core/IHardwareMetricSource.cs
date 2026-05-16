namespace ShoMetrics.Source.Windows.Core;

public interface IHardwareMetricSource
{
    MetricSnapshot ReadSnapshot(CancellationToken cancellationToken);
}
