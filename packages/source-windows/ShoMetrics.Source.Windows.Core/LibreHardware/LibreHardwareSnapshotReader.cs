using System.Diagnostics;
using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Traverses LHM hardware targets and converts current sensors into source readings.
/// </summary>
/// <remarks>
/// This reader owns the short-lived sensor retention cache used while reading
/// LHM data. It deliberately does not publish snapshots, choose polling groups,
/// enforce demand, or own synchronization. <see cref="LibreHardwareMonitorSession" />
/// holds the refresh gate and decides when the returned data is published. The
/// caller must serialize calls to <see cref="Read" /> because retention cache
/// state keeps per-polling-group source ticks and intentionally is not thread-safe.
/// </remarks>
internal sealed class LibreHardwareSnapshotReader
{
    private readonly TimeProvider _timeProvider;
    private readonly HardwareMetricRetentionCache _retentionCache;

    public LibreHardwareSnapshotReader(TimeProvider? timeProvider = null)
    {
        _timeProvider = timeProvider ?? TimeProvider.System;
        _retentionCache = new HardwareMetricRetentionCache(_timeProvider);
    }

    public LibreHardwareSnapshotReadResult Read(
        IReadOnlyList<IHardware> hardwareTargets,
        CancellationToken cancellationToken)
    {
        long currentTimestamp = _timeProvider.GetTimestamp();
        Dictionary<string, MetricReading> readingsByMetricId = new(StringComparer.Ordinal);
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId = new(StringComparer.Ordinal);
        Dictionary<string, List<RankedMetricReading>> rankedCandidatesByMetricId = new(StringComparer.Ordinal);
        List<string> cpuPollingGroupIds = [];
        List<string> gpuPollingGroupIds = [];
        List<HardwareRefreshDiagnostic> hardwareUpdates = [];
        List<TouchedPollingGroup> touchedPollingGroups = [];
        List<string> warnings = [];
        HardwareMetricRetentionCache.ReadScope retentionRead =
            _retentionCache.BeginRead(currentTimestamp);

        foreach (IHardware hardware in hardwareTargets)
        {
            ReadHardware(
                hardware,
                readingsByMetricId,
                unavailableReportsByMetricId,
                rankedCandidatesByMetricId,
                cpuPollingGroupIds,
                gpuPollingGroupIds,
                retentionRead,
                hardwareUpdates,
                touchedPollingGroups,
                warnings,
                cancellationToken);
        }

        // Ranked CPU aliases are group-level derived metrics. Non-CPU passes
        // have no CPU polling-group publication, so querying CPU alias retention
        // would only age or synthesize data that the session cannot publish.
        if (cpuPollingGroupIds.Count > 0)
        {
            AddRankedStableAliasReading(
                LibreHardwareMetricCatalog.CpuTemperatureMetricId,
                GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.CpuTemperatureMetricId),
                cpuPollingGroupIds[0],
                retentionRead,
                readingsByMetricId,
                unavailableReportsByMetricId);
            AddRankedStableAliasReading(
                LibreHardwareMetricCatalog.CpuPowerMetricId,
                GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.CpuPowerMetricId),
                cpuPollingGroupIds[0],
                retentionRead,
                readingsByMetricId,
                unavailableReportsByMetricId);
        }
        if (gpuPollingGroupIds.Count > 0)
        {
            AddRankedFallbackStableAliasReading(
                LibreHardwareMetricCatalog.GpuUsageMetricId,
                GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.GpuUsageMetricId),
                gpuPollingGroupIds[0],
                retentionRead,
                readingsByMetricId,
                unavailableReportsByMetricId);
            AddRankedFallbackStableAliasReading(
                LibreHardwareMetricCatalog.GpuVramUsedMetricId,
                GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.GpuVramUsedMetricId),
                gpuPollingGroupIds[0],
                retentionRead,
                readingsByMetricId,
                unavailableReportsByMetricId);
            AddRankedFallbackStableAliasReading(
                LibreHardwareMetricCatalog.GpuVramTotalMetricId,
                GetCandidates(rankedCandidatesByMetricId, LibreHardwareMetricCatalog.GpuVramTotalMetricId),
                gpuPollingGroupIds[0],
                retentionRead,
                readingsByMetricId,
                unavailableReportsByMetricId);
        }
        AddMemoryDerivedReadings(readingsByMetricId);
        DateTimeOffset capturedAt = _timeProvider.GetUtcNow();

        return new LibreHardwareSnapshotReadResult
        {
            CapturedAt = capturedAt,
            ReadingsByMetricId = readingsByMetricId,
            UnavailableReportsByMetricId = unavailableReportsByMetricId,
            HardwareUpdates = hardwareUpdates,
            PollingGroupSnapshotPublications = BuildPollingGroupSnapshotPublications(
                touchedPollingGroups,
                readingsByMetricId,
                unavailableReportsByMetricId),
            Warnings = warnings,
        };
    }

    private void ReadHardware(
        IHardware hardware,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId,
        Dictionary<string, List<RankedMetricReading>> rankedCandidatesByMetricId,
        List<string> cpuPollingGroupIds,
        List<string> gpuPollingGroupIds,
        HardwareMetricRetentionCache.ReadScope retentionRead,
        List<HardwareRefreshDiagnostic> hardwareUpdates,
        List<TouchedPollingGroup> touchedPollingGroups,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        string pollingGroupId = LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(hardware);
        retentionRead.TouchPollingGroup(pollingGroupId);

        if (hardware.HardwareType is HardwareType.Cpu
            && !cpuPollingGroupIds.Contains(pollingGroupId, StringComparer.Ordinal))
        {
            cpuPollingGroupIds.Add(pollingGroupId);
        }
        if (hardware.HardwareType is HardwareType.GpuAmd or HardwareType.GpuIntel or HardwareType.GpuNvidia
            && !gpuPollingGroupIds.Contains(pollingGroupId, StringComparer.Ordinal))
        {
            gpuPollingGroupIds.Add(pollingGroupId);
        }

        string? updateError = null;
        long updateStartedTimestamp = Stopwatch.GetTimestamp();

        try
        {
            hardware.Update();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            updateError = $"{exception.GetType().Name}: {exception.Message}";
            warnings.Add($"Hardware update failed for {hardware.Name}: {updateError}");
        }

        TimeSpan updateDuration = Stopwatch.GetElapsedTime(updateStartedTimestamp);
        hardwareUpdates.Add(new HardwareRefreshDiagnostic
        {
            HardwareId = hardware.Identifier.ToString(),
            HardwareName = hardware.Name,
            HardwareType = hardware.HardwareType.ToString(),
            UpdateDuration = updateDuration,
            UpdateSucceeded = updateError is null,
            UpdateError = updateError,
            SensorCount = hardware.Sensors.Length,
            SubHardwareCount = hardware.SubHardware.Length,
        });

        List<string> hardwareWarnings = [];

        if (updateError is not null)
        {
            hardwareWarnings.Add($"Hardware update failed for {hardware.Name}: {updateError}");
        }

        if (updateError is null && LibreHardwareMetricCatalog.IsSupportedHardwareType(hardware.HardwareType))
        {
            // Some LHM sensors can appear after a hardware update. Disable
            // their local history before copying current values into the
            // helper cache.
            LibreHardwareMonitorSensorPolicy.DisableSensorHistoryForHardware(hardware);

            foreach (ISensor sensor in hardware.Sensors)
            {
                LibreHardwareMonitorSensorPolicy.AddUnsupportedSensorTypeWarning(sensor, warnings);
                LibreHardwareMonitorSensorPolicy.AddUnsupportedSensorTypeWarning(sensor, hardwareWarnings);

                AddSensorReadings(
                    hardware,
                    sensor,
                    readingsByMetricId,
                    unavailableReportsByMetricId,
                    rankedCandidatesByMetricId,
                    pollingGroupId,
                    retentionRead);
            }
        }

        touchedPollingGroups.Add(new TouchedPollingGroup
        {
            PollingGroupId = pollingGroupId,
            Warnings = hardwareWarnings,
            CapturedAt = _timeProvider.GetUtcNow(),
        });

        if (updateError is not null)
        {
            return;
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardware(
                childHardware,
                readingsByMetricId,
                unavailableReportsByMetricId,
                rankedCandidatesByMetricId,
                cpuPollingGroupIds,
                gpuPollingGroupIds,
                retentionRead,
                hardwareUpdates,
                touchedPollingGroups,
                warnings,
                cancellationToken);
        }
    }

    private void AddSensorReadings(
        IHardware hardware,
        ISensor sensor,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId,
        Dictionary<string, List<RankedMetricReading>> rankedCandidatesByMetricId,
        string hardwarePollingGroupId,
        HardwareMetricRetentionCache.ReadScope retentionRead)
    {
        bool hadFreshReading = false;

        foreach (MetricReading reading in LibreHardwareMetricCatalog.CreateReadings(hardware, sensor))
        {
            hadFreshReading = true;
            string ownerPollingGroupId = LibreHardwareMetricCatalog.BuildPollingGroupId(hardware, reading.MetricId);
            RecordFreshReading(retentionRead, reading, ownerPollingGroupId);
            AddReading(readingsByMetricId, reading);
        }

        if (LibreHardwareMetricCatalog.TryCreateCpuStableAliasReadingCandidate(
            hardware,
            sensor,
            out RankedMetricReading? cpuStableAliasCandidate))
        {
            hadFreshReading = true;
            AddCandidate(rankedCandidatesByMetricId, cpuStableAliasCandidate);
        }

        if (LibreHardwareMetricCatalog.TryCreateGpuFallbackStableAliasReadingCandidate(
            hardware,
            sensor,
            out RankedMetricReading? gpuFallbackStableAliasCandidate))
        {
            AddCandidate(rankedCandidatesByMetricId, gpuFallbackStableAliasCandidate);
        }

        if (hadFreshReading)
        {
            return;
        }

        string sourceSensorMetricId = LibreHardwareMetricCatalog.BuildDynamicMetricId(sensor);
        if (retentionRead.TryReadSourceSensor(
            sensor.Identifier.ToString(),
            hardwarePollingGroupId,
            out MetricReading retainedCatalogReading,
            out bool sourceSensorExpired))
        {
            AddReading(readingsByMetricId, retainedCatalogReading);
        }
        else if (LibreHardwareMetricCatalog.HasCanonicalMetricUnit(sensor.SensorType))
        {
            MetricUnavailableReport unavailableReport = BuildUnavailableReport(
                sourceSensorMetricId,
                sourceSensorExpired ? MetricUnavailableReason.Expired : MetricUnavailableReason.InvalidValue,
                sourceSensorExpired
                    ? BuildRawSensorIdentity(retainedCatalogReading)
                    : BuildRawSensorIdentity(hardware, sensor));
            unavailableReportsByMetricId[sourceSensorMetricId] = unavailableReport;
        }

        if (LibreHardwareMetricCatalog.TryGetStableMetricId(hardware, sensor, out string? stableMetricId))
        {
            string ownerPollingGroupId = LibreHardwareMetricCatalog.BuildPollingGroupId(hardware, stableMetricId);
            if (retentionRead.TryReadStableAlias(
                stableMetricId,
                ownerPollingGroupId,
                out MetricReading retainedStableReading,
                out bool stableAliasExpired))
            {
                AddReading(readingsByMetricId, retainedStableReading);
                unavailableReportsByMetricId.Remove(stableMetricId);
                return;
            }

            MetricUnavailableReport unavailableReport = BuildUnavailableReport(
                stableMetricId,
                stableAliasExpired ? MetricUnavailableReason.Expired : MetricUnavailableReason.InvalidValue,
                stableAliasExpired
                    ? BuildRawSensorIdentity(retainedStableReading)
                    : BuildRawSensorIdentity(hardware, sensor));
            unavailableReportsByMetricId[stableMetricId] = unavailableReport;
        }
    }

    private void RecordFreshReading(
        HardwareMetricRetentionCache.ReadScope retentionRead,
        MetricReading reading,
        string ownerPollingGroupId)
    {
        if (LibreHardwareMetricCatalog.IsSourceSensorMetricId(reading.MetricId))
        {
            retentionRead.RecordFreshSourceSensor(reading, ownerPollingGroupId);
            return;
        }

        retentionRead.RecordFreshStableAlias(reading, ownerPollingGroupId);
    }

    private void AddRankedStableAliasReading(
        string metricId,
        List<RankedMetricReading> candidates,
        string fallbackPollingGroupId,
        HardwareMetricRetentionCache.ReadScope retentionRead,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId)
    {
        RankedMetricReading? selectedCandidate = candidates
            .OrderBy(candidate => candidate.Rank)
            .ThenBy(candidate => candidate.Reading.HardwareId, StringComparer.Ordinal)
            .ThenBy(candidate => candidate.Reading.SensorId, StringComparer.Ordinal)
            .FirstOrDefault();

        if (selectedCandidate is not null)
        {
            RecordFreshReading(retentionRead, selectedCandidate.Reading, selectedCandidate.PollingGroupId);
            AddReading(readingsByMetricId, selectedCandidate.Reading);
            unavailableReportsByMetricId.Remove(metricId);
            return;
        }

        if (retentionRead.TryReadStableAlias(
            metricId,
            fallbackPollingGroupId,
            out MetricReading retainedReading,
            out bool isExpired))
        {
            AddReading(readingsByMetricId, retainedReading);
            unavailableReportsByMetricId.Remove(metricId);
            return;
        }

        unavailableReportsByMetricId[metricId] = BuildUnavailableReport(
            metricId,
            isExpired ? MetricUnavailableReason.Expired : MetricUnavailableReason.NoSensor,
            isExpired ? BuildRawSensorIdentity(retainedReading) : null);
    }

    private void AddRankedFallbackStableAliasReading(
        string metricId,
        List<RankedMetricReading> candidates,
        string fallbackPollingGroupId,
        HardwareMetricRetentionCache.ReadScope retentionRead,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId)
    {
        if (readingsByMetricId.ContainsKey(metricId) || unavailableReportsByMetricId.ContainsKey(metricId))
        {
            return;
        }

        AddRankedStableAliasReading(
            metricId,
            candidates,
            fallbackPollingGroupId,
            retentionRead,
            readingsByMetricId,
            unavailableReportsByMetricId);
    }

    private static List<RankedMetricReading> GetCandidates(
        Dictionary<string, List<RankedMetricReading>> candidatesByMetricId,
        string metricId)
    {
        return candidatesByMetricId.TryGetValue(metricId, out List<RankedMetricReading>? candidates)
            ? candidates
            : [];
    }

    private static void AddCandidate(
        Dictionary<string, List<RankedMetricReading>> candidatesByMetricId,
        RankedMetricReading candidate)
    {
        if (!candidatesByMetricId.TryGetValue(candidate.Reading.MetricId, out List<RankedMetricReading>? candidates))
        {
            candidates = [];
            candidatesByMetricId.Add(candidate.Reading.MetricId, candidates);
        }

        candidates.Add(candidate);
    }

    private static void AddReading(Dictionary<string, MetricReading> readingsByMetricId, MetricReading reading)
    {
        if (!readingsByMetricId.TryGetValue(reading.MetricId, out MetricReading? existingReading))
        {
            readingsByMetricId.Add(reading.MetricId, reading);
            return;
        }

        if (LibreHardwareMetricCatalog.ShouldAggregateMetric(reading.MetricId))
        {
            readingsByMetricId[reading.MetricId] = existingReading with
            {
                Value = existingReading.Value + reading.Value,
            };
        }
    }

    private static void AddMemoryDerivedReadings(Dictionary<string, MetricReading> readingsByMetricId)
    {
        if (readingsByMetricId.TryGetValue("ram.used", out MetricReading? memoryUsed)
            && readingsByMetricId.TryGetValue(LibreHardwareMetricCatalog.RamAvailableMetricId, out MetricReading? memoryAvailable))
        {
            double memoryTotalBytes = memoryUsed.Value + memoryAvailable.Value;

            if (memoryTotalBytes > 0)
            {
                readingsByMetricId[LibreHardwareMetricCatalog.RamTotalMetricId] = memoryUsed with
                {
                    MetricId = LibreHardwareMetricCatalog.RamTotalMetricId,
                    SensorId = JoinSourceSensorIds(memoryUsed.SensorId, memoryAvailable.SensorId),
                    SensorName = "Memory Total",
                    Value = memoryTotalBytes,
                    Unit = MetricUnit.Bytes,
                };
            }
        }
    }

    private static MetricUnavailableReport BuildUnavailableReport(
        string metricId,
        MetricUnavailableReason reason,
        RawSensorIdentity? rawSensorIdentity = null)
    {
        return new MetricUnavailableReport
        {
            MetricId = metricId,
            Reason = reason,
            RawSensorIdentity = rawSensorIdentity,
        };
    }

    private static RawSensorIdentity BuildRawSensorIdentity(IHardware hardware, ISensor sensor)
    {
        return new RawSensorIdentity
        {
            SourceSensorId = sensor.Identifier.ToString(),
            HardwareId = hardware.Identifier.ToString(),
            HardwareName = hardware.Name,
            HardwareType = hardware.HardwareType.ToString(),
            SensorName = sensor.Name,
            SourceSensorType = sensor.SensorType.ToString(),
        };
    }

    private static RawSensorIdentity BuildRawSensorIdentity(MetricReading reading)
    {
        return new RawSensorIdentity
        {
            SourceSensorId = reading.SensorId,
            HardwareId = reading.HardwareId,
            HardwareName = reading.HardwareName,
            HardwareType = reading.HardwareType,
            SensorName = reading.SensorName,
            SourceSensorType = reading.SourceSensorType,
        };
    }

    private static string JoinSourceSensorIds(string? firstSourceSensorId, string? secondSourceSensorId)
    {
        return string.Join(
            ';',
            new[] { firstSourceSensorId, secondSourceSensorId }.Where(id => !string.IsNullOrWhiteSpace(id)));
    }

    private static IReadOnlyList<MetricPollingGroupSnapshotPublication> BuildPollingGroupSnapshotPublications(
        IReadOnlyList<TouchedPollingGroup> touchedPollingGroups,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId)
    {
        List<MetricPollingGroupSnapshotPublication> publications = [];
        List<MetricUnavailableReport> unavailableReports = unavailableReportsByMetricId.Values.ToList();

        foreach (TouchedPollingGroup touchedPollingGroup in touchedPollingGroups)
        {
            publications.Add(new MetricPollingGroupSnapshotPublication
            {
                PollingGroupId = touchedPollingGroup.PollingGroupId,
                TraversalReadingsByMetricId = readingsByMetricId,
                Warnings = touchedPollingGroup.Warnings,
                CapturedAt = touchedPollingGroup.CapturedAt,
                TraversalUnavailableReports = unavailableReports,
            });
        }

        return publications;
    }
}

/// <summary>
/// Raw result from one LHM traversal before the session publishes cache snapshots.
/// </summary>
internal sealed record LibreHardwareSnapshotReadResult
{
    public required DateTimeOffset CapturedAt { get; init; }

    public required Dictionary<string, MetricReading> ReadingsByMetricId { get; init; }

    public required Dictionary<string, MetricUnavailableReport> UnavailableReportsByMetricId { get; init; }

    public required IReadOnlyList<HardwareRefreshDiagnostic> HardwareUpdates { get; init; }

    public required IReadOnlyList<MetricPollingGroupSnapshotPublication> PollingGroupSnapshotPublications { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }
}

/// <summary>
/// Per-polling-group cache publication produced by the reader and published by the session.
/// </summary>
/// <remarks>
/// Readings and unavailable reports are traversal-wide candidates. The cache
/// owns the final metricId-to-polling-group filter before replacing a group
/// snapshot, which keeps publish ownership in one place. Replacing is destructive:
/// only produce publications for groups touched by this traversal. Consumers must
/// publish these updates immediately instead of retaining them across later
/// mutations to the traversal dictionaries.
/// </remarks>
internal sealed record MetricPollingGroupSnapshotPublication
{
    public required string PollingGroupId { get; init; }

    public required Dictionary<string, MetricReading> TraversalReadingsByMetricId { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }

    public required DateTimeOffset CapturedAt { get; init; }

    public required IReadOnlyList<MetricUnavailableReport> TraversalUnavailableReports { get; init; }
}

/// <summary>
/// A polling group touched by this traversal. Final publication waits until
/// derived metrics are complete.
/// </summary>
internal sealed record TouchedPollingGroup
{
    public required string PollingGroupId { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }

    public required DateTimeOffset CapturedAt { get; init; }
}
