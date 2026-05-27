using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service.Tests;

public sealed class MetricRefreshDemandRequestValidatorTests
{
    [Fact]
    public void ValidateAndMapAcceptsValidDemand()
    {
        SetMetricRefreshDemandRequest request = new();
        request.Groups.Add(new MetricRefreshDemandGroup
        {
            PollingGroupId = "lhm:hardware:cpu",
            RequestedIntervalMilliseconds = 1000,
            MetricIds = { "cpu.temp", "cpu.power" },
        });

        IReadOnlyList<MetricRefreshDemand> demands =
            MetricRefreshDemandRequestValidator.ValidateAndMap(request);

        MetricRefreshDemand demand = Assert.Single(demands);
        Assert.Equal("lhm:hardware:cpu", demand.PollingGroupId);
        Assert.Equal(["cpu.temp", "cpu.power"], demand.MetricIds);
        Assert.Equal(TimeSpan.FromSeconds(1), demand.RequestedInterval);
    }

    [Fact]
    public void ValidateAndMapRejectsTooManyGroups()
    {
        SetMetricRefreshDemandRequest request = new();

        for (int index = 0; index <= MetricRefreshDemandRequestValidator.MaximumDemandGroupsPerRequest; index++)
        {
            request.Groups.Add(new MetricRefreshDemandGroup
            {
                PollingGroupId = $"group.{index}",
                RequestedIntervalMilliseconds = 1000,
            });
        }

        AssertInvalidArgument(request);
    }

    [Fact]
    public void ValidateAndMapRejectsTooManyMetricIdsInOneGroup()
    {
        SetMetricRefreshDemandRequest request = new();
        MetricRefreshDemandGroup group = new()
        {
            PollingGroupId = "lhm:hardware:cpu",
            RequestedIntervalMilliseconds = 1000,
        };

        for (int index = 0; index <= MetricRefreshDemandRequestValidator.MaximumMetricIdsPerDemandGroup; index++)
        {
            group.MetricIds.Add($"metric.{index}");
        }

        request.Groups.Add(group);

        AssertInvalidArgument(request);
    }

    [Fact]
    public void ValidateAndMapRejectsUnsafeIdentifiers()
    {
        SetMetricRefreshDemandRequest request = new();
        request.Groups.Add(new MetricRefreshDemandGroup
        {
            PollingGroupId = "lhm:hardware:cpu",
            RequestedIntervalMilliseconds = 1000,
            MetricIds = { "metric\nid" },
        });

        AssertInvalidArgument(request);
    }

    [Fact]
    public void ValidateAndMapRejectsOversizedPollingGroupId()
    {
        SetMetricRefreshDemandRequest request = new();
        request.Groups.Add(new MetricRefreshDemandGroup
        {
            PollingGroupId = new string('g', MetricRefreshDemandRequestValidator.MaximumPollingGroupIdLength + 1),
            RequestedIntervalMilliseconds = 1000,
            MetricIds = { "metric.id" },
        });

        AssertInvalidArgument(request);
    }

    [Fact]
    public void ValidateAndMapRejectsOversizedMetricId()
    {
        SetMetricRefreshDemandRequest request = new();
        request.Groups.Add(new MetricRefreshDemandGroup
        {
            PollingGroupId = "lhm:hardware:cpu",
            RequestedIntervalMilliseconds = 1000,
            MetricIds = { new string('m', MetricRefreshDemandRequestValidator.MaximumMetricIdLength + 1) },
        });

        AssertInvalidArgument(request);
    }

    [Fact]
    public void ValidateAndMapRejectsDuplicatePollingGroups()
    {
        SetMetricRefreshDemandRequest request = new();
        request.Groups.Add(new MetricRefreshDemandGroup
        {
            PollingGroupId = "lhm:hardware:cpu",
            RequestedIntervalMilliseconds = 1000,
            MetricIds = { "cpu.temp" },
        });
        request.Groups.Add(new MetricRefreshDemandGroup
        {
            PollingGroupId = "lhm:hardware:cpu",
            RequestedIntervalMilliseconds = 1000,
            MetricIds = { "cpu.power" },
        });

        AssertInvalidArgument(request);
    }

    [Fact]
    public void ValidateAndMapRejectsExcessiveIdentifierBytes()
    {
        SetMetricRefreshDemandRequest request = new();
        int groupCount = 8;
        int metricsPerGroup = MetricRefreshDemandRequestValidator.MaximumMetricIdsPerDemandGroup;
        string metricId = new('m', MetricRefreshDemandRequestValidator.MaximumMetricIdLength - 12);

        for (int groupIndex = 0; groupIndex < groupCount; groupIndex++)
        {
            MetricRefreshDemandGroup group = new()
            {
                PollingGroupId = $"group.{groupIndex}",
                RequestedIntervalMilliseconds = 1000,
            };

            for (int metricIndex = 0; metricIndex < metricsPerGroup; metricIndex++)
            {
                group.MetricIds.Add($"{metricId}.{groupIndex}.{metricIndex}");
            }

            request.Groups.Add(group);
        }

        AssertInvalidArgument(request);
    }

    private static void AssertInvalidArgument(SetMetricRefreshDemandRequest request)
    {
        SourceRequestException exception = Assert.Throws<SourceRequestException>(
            () => MetricRefreshDemandRequestValidator.ValidateAndMap(request));

        Assert.Equal(SourceRequestFailureKind.InvalidArgument, exception.FailureKind);
    }
}
