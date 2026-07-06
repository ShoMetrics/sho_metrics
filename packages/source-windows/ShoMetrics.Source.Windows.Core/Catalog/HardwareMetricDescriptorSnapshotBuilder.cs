using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Builds the source-owned metric descriptor catalog from LHM and native disk metadata.
/// </summary>
/// <remarks>
/// This type may touch LHM hardware during descriptor preload because some sensors
/// appear only after an update. It does not own runtime snapshot cache, demand
/// state, refresh scheduling, or the Core LHM rate gate; those stay in
/// <see cref="LibreHardwareMonitorSession" />.
/// </remarks>
internal static class HardwareMetricDescriptorSnapshotBuilder
{
    private const string UnavailableDescriptorFingerprint = "";

    public static HardwareMetricDescriptorSnapshot Build(
        IReadOnlyList<IHardware> rootHardware,
        WindowsSystemTotalDiskThroughputProvider diskThroughputProvider,
        CancellationToken cancellationToken)
    {
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId = new(StringComparer.Ordinal);
        Dictionary<string, List<RankedHardwareMetricDescriptor>> rankedCandidatesByMetricId = new(StringComparer.Ordinal);
        List<string> warnings = [];

        foreach (IHardware hardware in rootHardware)
        {
            ReadHardwareDescriptors(
                hardware,
                descriptorsByMetricId,
                rankedCandidatesByMetricId,
                warnings,
                cancellationToken);
        }

        AddRankedStableAliasDescriptor(
            LibreHardwareMetricCatalog.CpuTemperatureMetricId,
            GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.CpuTemperatureMetricId),
            descriptorsByMetricId);
        AddRankedStableAliasDescriptor(
            LibreHardwareMetricCatalog.CpuPowerMetricId,
            GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.CpuPowerMetricId),
            descriptorsByMetricId);
        AddRankedFallbackStableAliasDescriptor(
            LibreHardwareMetricCatalog.GpuUsageMetricId,
            GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.GpuUsageMetricId),
            descriptorsByMetricId);
        AddRankedFallbackStableAliasDescriptor(
            LibreHardwareMetricCatalog.GpuVramUsedMetricId,
            GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.GpuVramUsedMetricId),
            descriptorsByMetricId);
        AddRankedFallbackStableAliasDescriptor(
            LibreHardwareMetricCatalog.GpuVramTotalMetricId,
            GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.GpuVramTotalMetricId),
            descriptorsByMetricId);
        AddDerivedDescriptors(descriptorsByMetricId);
        AddNativeDiskThroughputDescriptors(descriptorsByMetricId, diskThroughputProvider);

        List<HardwareMetricDescriptor> descriptors = FilterDescriptors(descriptorsByMetricId, requestedMetricIds: null);

        return new HardwareMetricDescriptorSnapshot
        {
            DescriptorFingerprint = BuildDescriptorFingerprint(descriptors),
            Descriptors = descriptors,
            Warnings = warnings,
        };
    }

    public static HardwareMetricDescriptorSnapshot BuildNativeOnly(
        WindowsSystemTotalDiskThroughputProvider diskThroughputProvider,
        IReadOnlyList<string> warnings)
    {
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId = new(StringComparer.Ordinal);

        AddNativeDiskThroughputDescriptors(descriptorsByMetricId, diskThroughputProvider);

        if (descriptorsByMetricId.Count == 0)
        {
            return BuildUnavailable(warnings);
        }

        List<HardwareMetricDescriptor> descriptors = FilterDescriptors(descriptorsByMetricId, requestedMetricIds: null);

        return new HardwareMetricDescriptorSnapshot
        {
            DescriptorFingerprint = BuildDescriptorFingerprint(descriptors),
            Descriptors = descriptors,
            Warnings = warnings,
        };
    }

    public static HardwareMetricDescriptorSnapshot Filter(
        HardwareMetricDescriptorSnapshot descriptorSnapshot,
        IReadOnlyCollection<string> metricIds)
    {
        HashSet<string>? requestedMetricIds = metricIds.Count == 0
            ? null
            : new HashSet<string>(metricIds, StringComparer.Ordinal);

        if (requestedMetricIds is null)
        {
            return descriptorSnapshot;
        }

        return descriptorSnapshot with
        {
            Descriptors = descriptorSnapshot.Descriptors
                .Where(descriptor => requestedMetricIds.Contains(descriptor.MetricId))
                .ToList(),
        };
    }

    public static IReadOnlyList<string> ReadKnownPollingGroupIds(HardwareMetricDescriptorSnapshot descriptorSnapshot)
    {
        return descriptorSnapshot.Descriptors
            .Select(descriptor => descriptor.PollingGroupId)
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static HardwareMetricDescriptorSnapshot BuildUnavailable(IReadOnlyList<string> warnings)
    {
        return new HardwareMetricDescriptorSnapshot
        {
            DescriptorFingerprint = UnavailableDescriptorFingerprint,
            Descriptors = [],
            Warnings = warnings,
        };
    }

    private static void ReadHardwareDescriptors(
        IHardware hardware,
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId,
        Dictionary<string, List<RankedHardwareMetricDescriptor>> rankedCandidatesByMetricId,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        bool updateSucceeded = true;

        try
        {
            hardware.Update();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Do not return here: motherboard voltage/fan sensors live on the
            // SuperIO subhardware, so bailing out on a transient parent update
            // failure would silently drop that whole subtree from the catalog
            // for the process lifetime (the catalog is built once and cached).
            // Children update themselves in the recursion below; only this
            // hardware's own sensors are skipped.
            warnings.Add($"Hardware update failed for {hardware.Name}: {exception.GetType().Name}: {exception.Message}");
            updateSucceeded = false;
        }

        if (updateSucceeded && LibreHardwareMetricCatalog.IsSupportedHardwareType(hardware.HardwareType))
        {
            // Descriptor preload also updates hardware, which can expose new
            // sensors. Keep the descriptor pass under the same no-history
            // policy as normal snapshot refreshes.
            LibreHardwareMonitorSensorPolicy.DisableSensorHistoryForHardware(hardware);

            foreach (ISensor sensor in hardware.Sensors)
            {
                LibreHardwareMonitorSensorPolicy.AddUnsupportedSensorTypeWarning(sensor, warnings);

                foreach (HardwareMetricDescriptor descriptor in LibreHardwareMetricCatalog.CreateDescriptors(hardware, sensor))
                {
                    descriptorsByMetricId.TryAdd(descriptor.MetricId, descriptor);
                }

                if (LibreHardwareMetricCatalog.TryCreateCpuStableAliasDescriptorCandidate(
                    hardware,
                    sensor,
                    out RankedHardwareMetricDescriptor? cpuStableAliasDescriptorCandidate))
                {
                    AddCandidate(rankedCandidatesByMetricId, cpuStableAliasDescriptorCandidate);
                }

                if (LibreHardwareMetricCatalog.TryCreateGpuFallbackStableAliasDescriptorCandidate(
                    hardware,
                    sensor,
                    out RankedHardwareMetricDescriptor? gpuFallbackStableAliasDescriptorCandidate))
                {
                    AddCandidate(rankedCandidatesByMetricId, gpuFallbackStableAliasDescriptorCandidate);
                }
            }
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardwareDescriptors(
                childHardware,
                descriptorsByMetricId,
                rankedCandidatesByMetricId,
                warnings,
                cancellationToken);
        }
    }

    private static void AddDerivedDescriptors(Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId)
    {
        if (descriptorsByMetricId.TryGetValue("ram.used", out HardwareMetricDescriptor? memoryUsed)
            && descriptorsByMetricId.TryGetValue(LibreHardwareMetricCatalog.RamAvailableMetricId, out HardwareMetricDescriptor? memoryAvailable))
        {
            descriptorsByMetricId[LibreHardwareMetricCatalog.RamTotalMetricId] = memoryUsed with
            {
                MetricId = LibreHardwareMetricCatalog.RamTotalMetricId,
                SourceSensorId = JoinSourceSensorIds(memoryUsed.SourceSensorId, memoryAvailable.SourceSensorId),
                SensorName = "Memory Total",
                Unit = MetricUnit.Bytes,
            };
        }
    }

    private static void AddNativeDiskThroughputDescriptors(
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId,
        WindowsSystemTotalDiskThroughputProvider diskThroughputProvider)
    {
        foreach (HardwareMetricDescriptor descriptor in diskThroughputProvider.CreateDescriptors())
        {
            descriptorsByMetricId[descriptor.MetricId] = descriptor;
        }
    }

    private static void AddRankedStableAliasDescriptor(
        string metricId,
        List<RankedHardwareMetricDescriptor> candidates,
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId)
    {
        // Descriptors have no current sensor value. Runtime reads may choose a
        // different ranked sensor when this descriptor's sensor is temporarily
        // invalid and another candidate is fresh.
        RankedHardwareMetricDescriptor? selectedCandidate = candidates
            .OrderBy(candidate => candidate.Rank)
            .ThenBy(candidate => candidate.Descriptor.HardwareId, StringComparer.Ordinal)
            .ThenBy(candidate => candidate.Descriptor.SourceSensorId, StringComparer.Ordinal)
            .FirstOrDefault();

        if (selectedCandidate is not null)
        {
            descriptorsByMetricId[metricId] = selectedCandidate.Descriptor;
        }
    }

    private static void AddRankedFallbackStableAliasDescriptor(
        string metricId,
        List<RankedHardwareMetricDescriptor> candidates,
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId)
    {
        if (descriptorsByMetricId.ContainsKey(metricId))
        {
            return;
        }

        AddRankedStableAliasDescriptor(metricId, candidates, descriptorsByMetricId);
    }

    private static List<RankedHardwareMetricDescriptor> GetCandidates(
        Dictionary<string, List<RankedHardwareMetricDescriptor>> candidatesByMetricId,
        string metricId)
    {
        return candidatesByMetricId.TryGetValue(metricId, out List<RankedHardwareMetricDescriptor>? candidates)
            ? candidates
            : [];
    }

    private static void AddCandidate(
        Dictionary<string, List<RankedHardwareMetricDescriptor>> candidatesByMetricId,
        RankedHardwareMetricDescriptor candidate)
    {
        if (!candidatesByMetricId.TryGetValue(candidate.Descriptor.MetricId, out List<RankedHardwareMetricDescriptor>? candidates))
        {
            candidates = [];
            candidatesByMetricId.Add(candidate.Descriptor.MetricId, candidates);
        }

        candidates.Add(candidate);
    }

    private static List<HardwareMetricDescriptor> FilterDescriptors(
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId,
        HashSet<string>? requestedMetricIds)
    {
        return descriptorsByMetricId.Values
            .Where(descriptor => !LibreHardwareMetricCatalog.IsInternalMetricId(descriptor.MetricId)
                && IsRequestedMetric(requestedMetricIds, descriptor.MetricId))
            .ToList();
    }

    private static string BuildDescriptorFingerprint(IReadOnlyList<HardwareMetricDescriptor> descriptors)
    {
        StringBuilder builder = new();

        // The fingerprint is an equality token for Hub re-planning. Sort by
        // stable ids and length-prefix each field so adjacent field values
        // cannot collide, then hash the canonical text form.
        foreach (HardwareMetricDescriptor descriptor in descriptors
            .OrderBy(descriptor => descriptor.MetricId, StringComparer.Ordinal)
            .ThenBy(descriptor => descriptor.SourceSensorId, StringComparer.Ordinal))
        {
            AppendFingerprintField(builder, descriptor.MetricId);
            AppendFingerprintField(builder, descriptor.SourceSensorId);
            AppendFingerprintField(builder, descriptor.PollingGroupId);
            AppendFingerprintField(builder, descriptor.HardwareId);
            AppendFingerprintField(builder, descriptor.HardwareName);
            AppendFingerprintField(builder, descriptor.HardwareType);
            AppendFingerprintField(builder, descriptor.SensorName);
            AppendFingerprintField(builder, descriptor.SourceSensorType);
            AppendFingerprintField(builder, descriptor.ValueKind.ToString());
            AppendFingerprintField(builder, descriptor.Unit.ToString());
            AppendFingerprintField(builder, descriptor.MetricIdKind.ToString());
        }

        byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString()));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static void AppendFingerprintField(StringBuilder builder, string value)
    {
        builder
            .Append(value.Length.ToString(CultureInfo.InvariantCulture))
            .Append(':')
            .Append(value)
            .Append(';');
    }

    private static bool IsRequestedMetric(HashSet<string>? requestedMetricIds, string metricId)
    {
        return requestedMetricIds is null || requestedMetricIds.Contains(metricId);
    }

    private static string JoinSourceSensorIds(string? firstSourceSensorId, string? secondSourceSensorId)
    {
        return string.Join(
            ';',
            new[] { firstSourceSensorId, secondSourceSensorId }.Where(id => !string.IsNullOrWhiteSpace(id)));
    }
}
