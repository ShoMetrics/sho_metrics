namespace ShoMetrics.Source.Windows.Core;

internal sealed class MetricRefreshDemandState
{
    private readonly TimeProvider _timeProvider;
    private readonly Lock _gate = new();
    private readonly HashSet<string> _knownPollingGroupIds;
    private readonly Dictionary<string, ActiveMetricRefreshDemand> _demandsByPollingGroupId =
        new(StringComparer.Ordinal);

    public MetricRefreshDemandState(IEnumerable<string> knownPollingGroupIds, TimeProvider? timeProvider = null)
    {
        _timeProvider = timeProvider ?? TimeProvider.System;
        _knownPollingGroupIds = new HashSet<string>(knownPollingGroupIds, StringComparer.Ordinal);
    }

    public MetricRefreshDemandApplyResult Apply(IReadOnlyList<MetricRefreshDemand> demands)
    {
        Dictionary<string, ActiveMetricRefreshDemand> acceptedDemands = new(StringComparer.Ordinal);
        int ignoredGroupCount = 0;
        long renewedTimestamp = _timeProvider.GetTimestamp();

        foreach (MetricRefreshDemand demand in demands)
        {
            if (!_knownPollingGroupIds.Contains(demand.PollingGroupId))
            {
                ignoredGroupCount++;
                continue;
            }

            acceptedDemands[demand.PollingGroupId] = new ActiveMetricRefreshDemand
            {
                Demand = new EffectiveMetricRefreshDemand
                {
                    PollingGroupId = demand.PollingGroupId,
                    MetricIds = demand.MetricIds,
                    RefreshInterval = ClampRefreshInterval(demand.RequestedInterval),
                },
                RenewedTimestamp = renewedTimestamp,
            };
        }

        lock (_gate)
        {
            _demandsByPollingGroupId.Clear();

            foreach (KeyValuePair<string, ActiveMetricRefreshDemand> item in acceptedDemands)
            {
                _demandsByPollingGroupId[item.Key] = item.Value;
            }
        }

        return new MetricRefreshDemandApplyResult
        {
            AcceptedGroupCount = acceptedDemands.Count,
            IgnoredGroupCount = ignoredGroupCount,
            EffectiveMinimumRefreshInterval = MetricRefreshDemandConstants.MinimumRefreshInterval,
            DemandTtl = MetricRefreshDemandConstants.DemandTtl,
            Warnings = BuildApplyWarnings(ignoredGroupCount),
        };
    }

    public IReadOnlyList<EffectiveMetricRefreshDemand> Snapshot()
    {
        lock (_gate)
        {
            ExpireDemands();
            return _demandsByPollingGroupId.Values
                .Select(demand => demand.Demand)
                .ToList();
        }
    }

    private void ExpireDemands()
    {
        long currentTimestamp = _timeProvider.GetTimestamp();

        // Demand TTL is a safety boundary for privileged hardware refresh.
        // Use monotonic time so user/NTP wall-clock changes cannot keep stale
        // demand alive or expire active demand early.
        foreach (string expiredPollingGroupId in _demandsByPollingGroupId
            .Where(item => _timeProvider.GetElapsedTime(item.Value.RenewedTimestamp, currentTimestamp)
                >= MetricRefreshDemandConstants.DemandTtl)
            .Select(item => item.Key)
            .ToList())
        {
            _demandsByPollingGroupId.Remove(expiredPollingGroupId);
        }
    }

    private static TimeSpan ClampRefreshInterval(TimeSpan requestedInterval)
    {
        if (requestedInterval < MetricRefreshDemandConstants.MinimumRefreshInterval)
        {
            return MetricRefreshDemandConstants.MinimumRefreshInterval;
        }

        if (requestedInterval > MetricRefreshDemandConstants.MaximumRefreshInterval)
        {
            return MetricRefreshDemandConstants.MaximumRefreshInterval;
        }

        return requestedInterval;
    }

    private static IReadOnlyList<HardwareSourceWarning> BuildApplyWarnings(int ignoredGroupCount)
    {
        if (ignoredGroupCount == 0)
        {
            return [];
        }

        return
        [
            new HardwareSourceWarning
            {
                Code = "refresh_demand_unknown_polling_group",
                Message = "One or more requested polling groups are unknown to this helper catalog.",
            },
        ];
    }

    private sealed record ActiveMetricRefreshDemand
    {
        public required EffectiveMetricRefreshDemand Demand { get; init; }

        public required long RenewedTimestamp { get; init; }
    }
}
