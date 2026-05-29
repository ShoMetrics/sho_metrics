using System.Text;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class MetricRefreshDemandChangeGate
{
    private readonly TimeProvider _timeProvider;
    private readonly TimeSpan _minimumChangeInterval;
    private readonly Lock _gate = new();
    private string? _lastAcceptedDemandFingerprint;
    private long _lastDemandChangeTimestamp;

    public MetricRefreshDemandChangeGate(TimeProvider timeProvider, TimeSpan minimumChangeInterval)
    {
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(minimumChangeInterval, TimeSpan.Zero);

        _timeProvider = timeProvider;
        _minimumChangeInterval = minimumChangeInterval;
    }

    public T RunIfAccepted<T>(
        IReadOnlyList<MetricRefreshDemand> demands,
        Func<MetricRefreshDemandChangeStatus, T> action)
    {
        string demandFingerprint = BuildDemandFingerprint(demands);

        lock (_gate)
        {
            bool demandChanged = !string.Equals(
                _lastAcceptedDemandFingerprint,
                demandFingerprint,
                StringComparison.Ordinal);

            if (
                demandChanged
                && _lastAcceptedDemandFingerprint is not null
                && _timeProvider.GetElapsedTime(_lastDemandChangeTimestamp) < _minimumChangeInterval)
            {
                // This can be normal while the Hub is shutting down or clearing demand.
                throw new SourceRequestException(
                    SourceRequestFailureKind.ResourceExhausted,
                    "Refresh demand changed too quickly; this can be normal while shutting down.");
            }

            T result = action(demandChanged
                ? MetricRefreshDemandChangeStatus.Changed
                : MetricRefreshDemandChangeStatus.Unchanged);

            if (demandChanged)
            {
                _lastAcceptedDemandFingerprint = demandFingerprint;
                _lastDemandChangeTimestamp = _timeProvider.GetTimestamp();
            }

            return result;
        }
    }

    private static string BuildDemandFingerprint(IReadOnlyList<MetricRefreshDemand> demands)
    {
        StringBuilder builder = new();

        foreach (MetricRefreshDemand demand in demands.OrderBy(demand => demand.PollingGroupId, StringComparer.Ordinal))
        {
            AppendLengthPrefixed(builder, demand.PollingGroupId);
            builder.Append(':');
            builder.Append((long)demand.RequestedInterval.TotalMilliseconds);
            builder.Append(':');
            builder.Append(demand.MetricIds.Count);

            foreach (string metricId in demand.MetricIds.OrderBy(metricId => metricId, StringComparer.Ordinal))
            {
                builder.Append(':');
                AppendLengthPrefixed(builder, metricId);
            }

            builder.Append(';');
        }

        return builder.ToString();
    }

    private static void AppendLengthPrefixed(StringBuilder builder, string value)
    {
        builder.Append(value.Length);
        builder.Append('#');
        builder.Append(value);
    }
}

internal enum MetricRefreshDemandChangeStatus
{
    Unchanged,
    Changed,
}
