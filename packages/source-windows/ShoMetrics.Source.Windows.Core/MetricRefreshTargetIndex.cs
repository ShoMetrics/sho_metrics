using System.Diagnostics.CodeAnalysis;
using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

internal sealed class MetricRefreshTargetIndex
{
    private readonly IReadOnlyDictionary<string, MetricRefreshTarget> _targetsByPollingGroupId;

    private MetricRefreshTargetIndex(IReadOnlyDictionary<string, MetricRefreshTarget> targetsByPollingGroupId)
    {
        _targetsByPollingGroupId = targetsByPollingGroupId;
    }

    public static MetricRefreshTargetIndex Build(
        IReadOnlyList<IHardware> rootHardware,
        HardwareMetricDescriptorSnapshot descriptorSnapshot)
    {
        HashSet<string> knownPollingGroupIds = new(
            ReadKnownPollingGroupIds(descriptorSnapshot),
            StringComparer.Ordinal);
        Dictionary<string, MetricRefreshTarget> targetsByPollingGroupId = new(StringComparer.Ordinal);
        List<IHardware> networkHardware = [];

        foreach (IHardware hardware in EnumerateHardwareTree(rootHardware))
        {
            string hardwarePollingGroupId = LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(hardware);
            if (knownPollingGroupIds.Contains(hardwarePollingGroupId))
            {
                targetsByPollingGroupId[hardwarePollingGroupId] = MetricRefreshTarget.ForLibreHardwareMonitor([hardware]);
            }

            if (hardware.HardwareType == HardwareType.Network)
            {
                networkHardware.Add(hardware);
            }
        }

        if (knownPollingGroupIds.Contains(LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId)
            && networkHardware.Count > 0)
        {
            targetsByPollingGroupId[LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId] =
                MetricRefreshTarget.ForLibreHardwareMonitor(networkHardware);
        }

        if (knownPollingGroupIds.Contains(WindowsSystemTotalDiskThroughputProvider.PollingGroupId))
        {
            targetsByPollingGroupId[WindowsSystemTotalDiskThroughputProvider.PollingGroupId] =
                MetricRefreshTarget.ForNativeDisk();
        }

        return new MetricRefreshTargetIndex(targetsByPollingGroupId);
    }

    public bool TryRead(string pollingGroupId, [NotNullWhen(true)] out MetricRefreshTarget? refreshTarget)
    {
        return _targetsByPollingGroupId.TryGetValue(pollingGroupId, out refreshTarget);
    }

    private static IReadOnlyList<string> ReadKnownPollingGroupIds(HardwareMetricDescriptorSnapshot descriptorSnapshot)
    {
        return descriptorSnapshot.Descriptors
            .Select(descriptor => descriptor.PollingGroupId)
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static IEnumerable<IHardware> EnumerateHardwareTree(IReadOnlyList<IHardware> rootHardware)
    {
        foreach (IHardware hardware in rootHardware)
        {
            yield return hardware;

            foreach (IHardware childHardware in EnumerateHardwareTree(hardware.SubHardware))
            {
                yield return childHardware;
            }
        }
    }
}

internal enum MetricRefreshTargetKind
{
    LibreHardwareMonitor,
    NativeDisk,
}

internal sealed record MetricRefreshTarget
{
    private MetricRefreshTarget()
    {
    }

    public required MetricRefreshTargetKind Kind { get; init; }

    public required IReadOnlyList<IHardware> Hardware { get; init; }

    public static MetricRefreshTarget ForLibreHardwareMonitor(IReadOnlyList<IHardware> hardware)
    {
        return new MetricRefreshTarget
        {
            Kind = MetricRefreshTargetKind.LibreHardwareMonitor,
            Hardware = hardware,
        };
    }

    public static MetricRefreshTarget ForNativeDisk()
    {
        return new MetricRefreshTarget
        {
            Kind = MetricRefreshTargetKind.NativeDisk,
            Hardware = [],
        };
    }
}
