using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service.Tests;

public sealed class MetricRefreshDemandChangeGateTests
{
    [Fact]
    public void RunIfAcceptedRejectsChangedDemandWithinMinimumInterval()
    {
        var timeProvider = new ManualTimeProvider();
        var gate = new MetricRefreshDemandChangeGate(timeProvider, TimeSpan.FromMilliseconds(250));
        int acceptedCount = 0;

        gate.RunIfAccepted(BuildDemand("metric.one"), () => ++acceptedCount);

        SourceRequestException exception = Assert.Throws<SourceRequestException>(() =>
            gate.RunIfAccepted(BuildDemand("metric.two"), () => ++acceptedCount));

        Assert.Equal(SourceRequestFailureKind.ResourceExhausted, exception.FailureKind);
        Assert.Equal(1, acceptedCount);
    }

    [Fact]
    public void RunIfAcceptedAllowsSameDemandWithinMinimumInterval()
    {
        var timeProvider = new ManualTimeProvider();
        var gate = new MetricRefreshDemandChangeGate(timeProvider, TimeSpan.FromMilliseconds(250));
        int acceptedCount = 0;

        gate.RunIfAccepted(BuildDemand("metric.one"), () => ++acceptedCount);
        gate.RunIfAccepted(BuildDemand("metric.one"), () => ++acceptedCount);

        Assert.Equal(2, acceptedCount);
    }

    [Fact]
    public void RunIfAcceptedAllowsChangedDemandAfterMinimumInterval()
    {
        var timeProvider = new ManualTimeProvider();
        var gate = new MetricRefreshDemandChangeGate(timeProvider, TimeSpan.FromMilliseconds(250));
        int acceptedCount = 0;

        gate.RunIfAccepted(BuildDemand("metric.one"), () => ++acceptedCount);
        timeProvider.Advance(TimeSpan.FromMilliseconds(250));
        gate.RunIfAccepted(BuildDemand("metric.two"), () => ++acceptedCount);

        Assert.Equal(2, acceptedCount);
    }

    [Fact]
    public void RunIfAcceptedDoesNotRecordFailedActions()
    {
        var timeProvider = new ManualTimeProvider();
        var gate = new MetricRefreshDemandChangeGate(timeProvider, TimeSpan.FromMilliseconds(250));

        Assert.Throws<InvalidOperationException>(() =>
            gate.RunIfAccepted<int>(
                BuildDemand("metric.one"),
                static () => throw new InvalidOperationException()));

        gate.RunIfAccepted(BuildDemand("metric.two"), static () => true);
    }

    private static IReadOnlyList<MetricRefreshDemand> BuildDemand(string metricId)
    {
        return
        [
            new MetricRefreshDemand
            {
                PollingGroupId = "windows-native:aggregate:disk",
                MetricIds = [metricId],
                RequestedInterval = TimeSpan.FromSeconds(1),
            },
        ];
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private long _timestamp;

        public override DateTimeOffset GetUtcNow()
        {
            return new DateTimeOffset(2026, 5, 27, 0, 0, 0, TimeSpan.Zero).AddTicks(_timestamp);
        }

        public override long GetTimestamp()
        {
            return _timestamp;
        }

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public void Advance(TimeSpan duration)
        {
            _timestamp += duration.Ticks;
        }
    }
}
