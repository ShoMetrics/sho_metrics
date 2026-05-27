namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class MetricRefreshDemandStateTests
{
    [Fact]
    public void ApplyClampsIntervalsAndIgnoresUnknownPollingGroups()
    {
        var timeProvider = new ManualTimeProvider();
        var state = new MetricRefreshDemandState(["known"], timeProvider);

        MetricRefreshDemandApplyResult result = state.Apply(
            [
                new MetricRefreshDemand
                {
                    PollingGroupId = "known",
                    MetricIds = ["metric.one"],
                    RequestedInterval = TimeSpan.FromMilliseconds(1),
                },
                new MetricRefreshDemand
                {
                    PollingGroupId = "unknown",
                    MetricIds = ["metric.two"],
                    RequestedInterval = TimeSpan.FromSeconds(1),
                },
            ]);

        IReadOnlyList<EffectiveMetricRefreshDemand> activeDemands = state.Snapshot();

        Assert.Equal(1, result.AcceptedGroupCount);
        Assert.Equal(1, result.IgnoredGroupCount);
        Assert.Single(result.Warnings);
        EffectiveMetricRefreshDemand demand = Assert.Single(activeDemands);
        Assert.Equal("known", demand.PollingGroupId);
        Assert.Equal(MetricRefreshDemandConstants.MinimumRefreshInterval, demand.RefreshInterval);
    }

    [Fact]
    public void ApplyReplacesExistingDemand()
    {
        var timeProvider = new ManualTimeProvider();
        var state = new MetricRefreshDemandState(["known"], timeProvider);
        state.Apply(
            [
                new MetricRefreshDemand
                {
                    PollingGroupId = "known",
                    MetricIds = ["metric.one"],
                    RequestedInterval = TimeSpan.FromSeconds(1),
                },
            ]);

        timeProvider.Advance(TimeSpan.FromSeconds(1));
        state.Apply([]);

        Assert.Empty(state.Snapshot());
    }

    [Fact]
    public void SnapshotExpiresDemandAfterTtl()
    {
        var timeProvider = new ManualTimeProvider();
        var state = new MetricRefreshDemandState(["known"], timeProvider);
        state.Apply(
            [
                new MetricRefreshDemand
                {
                    PollingGroupId = "known",
                    MetricIds = ["metric.one"],
                    RequestedInterval = TimeSpan.FromSeconds(1),
                },
            ]);

        timeProvider.Advance(MetricRefreshDemandConstants.DemandTtl - TimeSpan.FromMilliseconds(1));
        IReadOnlyList<EffectiveMetricRefreshDemand> activeBeforeExpiry = state.Snapshot();

        timeProvider.Advance(TimeSpan.FromMilliseconds(1));
        IReadOnlyList<EffectiveMetricRefreshDemand> activeAfterExpiry = state.Snapshot();

        Assert.Single(activeBeforeExpiry);
        Assert.Empty(activeAfterExpiry);
    }

    [Fact]
    public void SnapshotDoesNotExpireDemandWhenUtcClockJumpsForward()
    {
        var timeProvider = new ManualTimeProvider();
        var state = new MetricRefreshDemandState(["known"], timeProvider);
        state.Apply(
            [
                new MetricRefreshDemand
                {
                    PollingGroupId = "known",
                    MetricIds = ["metric.one"],
                    RequestedInterval = TimeSpan.FromSeconds(1),
                },
            ]);

        timeProvider.AdvanceUtc(TimeSpan.FromDays(1));

        Assert.Single(state.Snapshot());
    }

    [Fact]
    public void SnapshotExpiresDemandWhenUtcClockMovesBackward()
    {
        var timeProvider = new ManualTimeProvider();
        var state = new MetricRefreshDemandState(["known"], timeProvider);
        state.Apply(
            [
                new MetricRefreshDemand
                {
                    PollingGroupId = "known",
                    MetricIds = ["metric.one"],
                    RequestedInterval = TimeSpan.FromSeconds(1),
                },
            ]);

        timeProvider.RewindUtc(TimeSpan.FromDays(1));
        timeProvider.AdvanceTimestamp(MetricRefreshDemandConstants.DemandTtl);

        Assert.Empty(state.Snapshot());
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private DateTimeOffset _utcNow = new(2026, 5, 27, 0, 0, 0, TimeSpan.Zero);
        private long _timestamp;

        public override DateTimeOffset GetUtcNow()
        {
            return _utcNow;
        }

        public override long GetTimestamp()
        {
            return _timestamp;
        }

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public void Advance(TimeSpan duration)
        {
            AdvanceUtc(duration);
            AdvanceTimestamp(duration);
        }

        public void AdvanceUtc(TimeSpan duration)
        {
            _utcNow = _utcNow.Add(duration);
        }

        public void RewindUtc(TimeSpan duration)
        {
            _utcNow = _utcNow.Subtract(duration);
        }

        public void AdvanceTimestamp(TimeSpan duration)
        {
            _timestamp += duration.Ticks;
        }
    }
}
