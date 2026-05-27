using System.Text;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service;

internal static class MetricRefreshDemandRequestValidator
{
    public const int MaximumDemandGroupsPerRequest = 64;
    public const int MaximumMetricIdsPerDemandGroup = 64;
    public const int MaximumMetricIdsPerDemandRequest = 512;
    public const int MaximumPollingGroupIdLength = 512;
    public const int MaximumMetricIdLength = 512;
    public const int MaximumDemandIdentifierByteCount = 65536;

    public static IReadOnlyList<MetricRefreshDemand> ValidateAndMap(SetMetricRefreshDemandRequest request)
    {
        if (request.Groups.Count > MaximumDemandGroupsPerRequest)
        {
            throw new SourceRequestException(
                SourceRequestFailureKind.InvalidArgument,
                "Refresh demand request contains too many groups.");
        }

        List<MetricRefreshDemand> demands = new(request.Groups.Count);
        HashSet<string> pollingGroupIds = new(StringComparer.Ordinal);
        int totalMetricIdCount = 0;
        int totalIdentifierByteCount = 0;

        foreach (MetricRefreshDemandGroup group in request.Groups)
        {
            ValidateWireIdentifier(
                group.PollingGroupId,
                MaximumPollingGroupIdLength,
                "polling_group_id");
            totalIdentifierByteCount += Encoding.UTF8.GetByteCount(group.PollingGroupId);

            if (!pollingGroupIds.Add(group.PollingGroupId))
            {
                throw new SourceRequestException(
                    SourceRequestFailureKind.InvalidArgument,
                    "Refresh demand request contains duplicate polling groups.");
            }

            if (group.MetricIds.Count > MaximumMetricIdsPerDemandGroup)
            {
                throw new SourceRequestException(
                    SourceRequestFailureKind.InvalidArgument,
                    "Refresh demand group contains too many metric ids.");
            }

            totalMetricIdCount += group.MetricIds.Count;
            if (totalMetricIdCount > MaximumMetricIdsPerDemandRequest)
            {
                throw new SourceRequestException(
                    SourceRequestFailureKind.InvalidArgument,
                    "Refresh demand request contains too many metric ids.");
            }

            foreach (string metricId in group.MetricIds)
            {
                ValidateWireIdentifier(metricId, MaximumMetricIdLength, "metric_id");
                totalIdentifierByteCount += Encoding.UTF8.GetByteCount(metricId);
            }

            if (totalIdentifierByteCount > MaximumDemandIdentifierByteCount)
            {
                throw new SourceRequestException(
                    SourceRequestFailureKind.InvalidArgument,
                    "Refresh demand request is too large.");
            }

            demands.Add(new MetricRefreshDemand
            {
                PollingGroupId = group.PollingGroupId,
                MetricIds = group.MetricIds.ToList(),
                RequestedInterval = TimeSpan.FromMilliseconds(group.RequestedIntervalMilliseconds),
            });
        }

        return demands;
    }

    private static void ValidateWireIdentifier(
        string value,
        int maximumLength,
        string fieldName)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > maximumLength)
        {
            throw new SourceRequestException(
                SourceRequestFailureKind.InvalidArgument,
                $"Invalid {fieldName}.");
        }

        foreach (char character in value)
        {
            if (char.IsControl(character))
            {
                throw new SourceRequestException(
                    SourceRequestFailureKind.InvalidArgument,
                    $"Invalid {fieldName}.");
            }
        }
    }
}
