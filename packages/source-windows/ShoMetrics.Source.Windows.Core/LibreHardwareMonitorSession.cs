using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

public sealed class LibreHardwareMonitorSession : IDisposable
{
    // Empty means the helper has no complete descriptor catalog yet. The Hub
    // treats the later non-empty descriptor fingerprint as a real change.
    private const string UnavailableDescriptorFingerprint = "";
    private const int RetainedSampleTickLimit = 3;

    private readonly Computer? _computer;
    private readonly HardwareMetricDescriptorSnapshot _cachedDescriptorSnapshot;
    private readonly IReadOnlyDictionary<string, string> _pollingGroupIdsByMetricId;
    private readonly HardwareMetricRetentionCache _retentionCache = new(RetainedSampleTickLimit);
    private readonly ConcurrentDictionary<string, MetricSnapshot> _latestSnapshotsByPollingGroupId =
        new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _readGate = new(1, 1);
    private MetricSnapshot _latestSnapshot;
    private long _sourceTick;
    private bool _isDisposed;

    public LibreHardwareMonitorSession()
    {
        Computer computer = LibreHardwareComputerFactory.Create();
        List<HardwareSourceWarning> warnings = [];
        HardwareMetricDescriptorSnapshot? cachedDescriptorSnapshot = null;

        try
        {
            computer.Open();
            // LHM enables per-sensor history by default. ShoMetrics stores the
            // user-visible history in MetricStore, so the helper disables the
            // duplicate LHM buffer as soon as the catalog is opened.
            DisableSensorHistoryForComputer(computer);
            _computer = computer;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            warnings.Add(new HardwareSourceWarning
            {
                Code = "lhm_init_failed",
                Message = "LibreHardwareMonitor initialization failed.",
            });
            computer.Close();
        }

        if (_computer is not null)
        {
            try
            {
                cachedDescriptorSnapshot = BuildMetricDescriptorSnapshot(computer, CancellationToken.None);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                warnings.Add(new HardwareSourceWarning
                {
                    Code = "lhm_descriptor_preload_failed",
                    Message = $"LibreHardwareMonitor descriptor preload failed: {exception.Message}",
                });
            }
        }

        cachedDescriptorSnapshot ??= BuildUnavailableDescriptorSnapshot(
            warnings.Select(warning => warning.Message).ToList());
        InitializationWarnings = warnings;
        _cachedDescriptorSnapshot = cachedDescriptorSnapshot;
        _pollingGroupIdsByMetricId = cachedDescriptorSnapshot.Descriptors.ToDictionary(
            descriptor => descriptor.MetricId,
            descriptor => descriptor.PollingGroupId,
            StringComparer.Ordinal);
        _latestSnapshot = BuildUnavailableSnapshot();
    }

    public bool IsAvailable => _computer is not null;

    public IReadOnlyList<HardwareSourceWarning> InitializationWarnings { get; }

    /// <summary>
    /// Reads the latest cached metric snapshot, filtered to requested metric ids.
    /// </summary>
    /// <remarks>
    /// This method does not traverse LibreHardwareMonitor hardware. Call
    /// <see cref="RefreshSnapshotAsync" /> from the helper background refresh
    /// loop to update the cache. When the requested ids all belong to one
    /// helper polling group, this reads that group's latest published values
    /// without waiting for unrelated groups. The method keeps the Async suffix
    /// because it is the async-shaped source contract even though cache reads
    /// usually complete synchronously.
    ///
    /// A service client can read before the background refresh loop completes
    /// its first pass. In that startup race, this returns the initial
    /// unavailable snapshot and the next background refresh replaces it.
    /// </remarks>
    public Task<MetricSnapshot> ReadSnapshotAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        HashSet<string>? requestedMetricIds = BuildRequestedMetricSet(metricIds);
        MetricSnapshot snapshot = ReadCachedSnapshot(metricIds);

        return Task.FromResult(FilterSnapshot(snapshot, requestedMetricIds));
    }

    /// <summary>
    /// Refreshes the cached snapshot by traversing LibreHardwareMonitor once.
    /// </summary>
    public async Task<MetricSnapshot> RefreshSnapshotAsync(CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        if (_computer is null)
        {
            // LHM-unavailable refreshes intentionally stamp a fresh timestamp.
            // This allocates once per refresh while unavailable, which is tiny
            // compared with the normal LHM traversal path and keeps source
            // health observable through the latest cached snapshot.
            MetricSnapshot unavailableSnapshot = BuildUnavailableSnapshot();
            Volatile.Write(ref _latestSnapshot, unavailableSnapshot);
            return unavailableSnapshot;
        }

        await _readGate.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            ObjectDisposedException.ThrowIf(_isDisposed, this);

            long sourceTick = ++_sourceTick;
            DateTimeOffset capturedAt = DateTimeOffset.UtcNow;
            Dictionary<string, MetricReading> readingsByMetricId = new(StringComparer.Ordinal);
            Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId = new(StringComparer.Ordinal);
            List<RankedMetricReading> cpuTemperatureCandidates = [];
            List<RankedMetricReading> cpuPowerCandidates = [];
            List<string> warnings = [];

            foreach (IHardware hardware in _computer.Hardware)
            {
                ReadHardware(
                    hardware,
                    readingsByMetricId,
                    unavailableReportsByMetricId,
                    cpuTemperatureCandidates,
                    cpuPowerCandidates,
                    capturedAt,
                    sourceTick,
                    warnings,
                    cancellationToken);
            }

            AddRankedStableAliasReading(
                LibreHardwareMetricCatalog.CpuTemperatureMetricId,
                cpuTemperatureCandidates,
                readingsByMetricId,
                unavailableReportsByMetricId,
                capturedAt,
                sourceTick);
            AddRankedStableAliasReading(
                LibreHardwareMetricCatalog.CpuPowerMetricId,
                cpuPowerCandidates,
                readingsByMetricId,
                unavailableReportsByMetricId,
                capturedAt,
                sourceTick);
            PublishStableAliasPollingGroupSnapshot(
                LibreHardwareMetricCatalog.CpuTemperatureMetricId,
                readingsByMetricId,
                unavailableReportsByMetricId,
                capturedAt);
            PublishStableAliasPollingGroupSnapshot(
                LibreHardwareMetricCatalog.CpuPowerMetricId,
                readingsByMetricId,
                unavailableReportsByMetricId,
                capturedAt);
            AddDerivedReadings(readingsByMetricId);
            PublishAggregatePollingGroupSnapshots(readingsByMetricId, capturedAt);

            List<MetricReading> readings = FilterReadings(readingsByMetricId, requestedMetricIds: null);
            List<MetricUnavailableReport> unavailableReports = FilterUnavailableMetrics(
                unavailableReportsByMetricId,
                requestedMetricIds: null);
            AddMissingMetricWarnings(readings, warnings);

            MetricSnapshot snapshot = new()
            {
                CapturedAt = capturedAt,
                Readings = readings,
                UnavailableMetrics = unavailableReports,
                Warnings = warnings,
            };
            Volatile.Write(ref _latestSnapshot, snapshot);
            return snapshot;
        }
        finally
        {
            _readGate.Release();
        }
    }

    public Task<HardwareMetricDescriptorSnapshot> ListMetricDescriptorsAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(FilterDescriptorSnapshot(_cachedDescriptorSnapshot, BuildRequestedMetricSet(metricIds)));
    }

    public void Dispose()
    {
        if (_isDisposed)
        {
            return;
        }

        _computer?.Close();
        _readGate.Dispose();
        _isDisposed = true;
    }

    private MetricSnapshot BuildUnavailableSnapshot()
    {
        return new MetricSnapshot
        {
            CapturedAt = DateTimeOffset.UtcNow,
            Readings = [],
            Warnings = InitializationWarnings.Select(warning => warning.Message).ToList(),
        };
    }

    private MetricSnapshot ReadCachedSnapshot(IReadOnlyCollection<string> metricIds)
    {
        if (TryResolveSinglePollingGroupId(metricIds, out string? pollingGroupId)
            && pollingGroupId is not null
            && _latestSnapshotsByPollingGroupId.TryGetValue(pollingGroupId, out MetricSnapshot? groupSnapshot))
        {
            return groupSnapshot;
        }

        return Volatile.Read(ref _latestSnapshot);
    }

    private bool TryResolveSinglePollingGroupId(
        IReadOnlyCollection<string> metricIds,
        out string? pollingGroupId)
    {
        pollingGroupId = null;

        foreach (string metricId in metricIds)
        {
            if (!_pollingGroupIdsByMetricId.TryGetValue(metricId, out string? currentPollingGroupId))
            {
                return false;
            }

            if (pollingGroupId is null)
            {
                pollingGroupId = currentPollingGroupId;
                continue;
            }

            if (!pollingGroupId.Equals(currentPollingGroupId, StringComparison.Ordinal))
            {
                return false;
            }
        }

        return pollingGroupId is not null;
    }

    private static HardwareMetricDescriptorSnapshot BuildMetricDescriptorSnapshot(
        Computer computer,
        CancellationToken cancellationToken)
    {
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId = new(StringComparer.Ordinal);
        List<RankedHardwareMetricDescriptor> cpuTemperatureDescriptorCandidates = [];
        List<RankedHardwareMetricDescriptor> cpuPowerDescriptorCandidates = [];
        List<string> warnings = [];

        foreach (IHardware hardware in computer.Hardware)
        {
            ReadHardwareDescriptors(
                hardware,
                descriptorsByMetricId,
                cpuTemperatureDescriptorCandidates,
                cpuPowerDescriptorCandidates,
                warnings,
                cancellationToken);
        }

        AddRankedStableAliasDescriptor(
            LibreHardwareMetricCatalog.CpuTemperatureMetricId,
            cpuTemperatureDescriptorCandidates,
            descriptorsByMetricId);
        AddRankedStableAliasDescriptor(
            LibreHardwareMetricCatalog.CpuPowerMetricId,
            cpuPowerDescriptorCandidates,
            descriptorsByMetricId);
        AddDerivedDescriptors(descriptorsByMetricId);

        List<HardwareMetricDescriptor> descriptors = FilterDescriptors(descriptorsByMetricId, requestedMetricIds: null);

        return new HardwareMetricDescriptorSnapshot
        {
            DescriptorFingerprint = BuildDescriptorFingerprint(descriptors),
            Descriptors = descriptors,
            Warnings = warnings,
        };
    }

    private static HardwareMetricDescriptorSnapshot BuildUnavailableDescriptorSnapshot(IReadOnlyList<string> warnings)
    {
        return new HardwareMetricDescriptorSnapshot
        {
            DescriptorFingerprint = UnavailableDescriptorFingerprint,
            Descriptors = [],
            Warnings = warnings,
        };
    }

    private void ReadHardware(
        IHardware hardware,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId,
        List<RankedMetricReading> cpuTemperatureCandidates,
        List<RankedMetricReading> cpuPowerCandidates,
        DateTimeOffset capturedAt,
        long sourceTick,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        string? updateError = null;

        try
        {
            hardware.Update();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            updateError = $"{exception.GetType().Name}: {exception.Message}";
            warnings.Add($"Hardware update failed for {hardware.Name}: {updateError}");
        }

        Dictionary<string, MetricReading> hardwareReadingsByMetricId = new(StringComparer.Ordinal);
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
            DisableSensorHistoryForHardware(hardware);

            foreach (ISensor sensor in hardware.Sensors)
            {
                AddUnsupportedSensorTypeWarning(sensor, warnings);
                AddUnsupportedSensorTypeWarning(sensor, hardwareWarnings);

                AddSensorReadings(
                    hardware,
                    sensor,
                    hardwareReadingsByMetricId,
                    readingsByMetricId,
                    unavailableReportsByMetricId,
                    cpuTemperatureCandidates,
                    cpuPowerCandidates,
                    capturedAt,
                    sourceTick);
            }
        }

        AddMemoryDerivedReadings(hardwareReadingsByMetricId);
        PublishPollingGroupSnapshot(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(hardware),
            hardwareReadingsByMetricId,
            hardwareWarnings,
            capturedAt,
            unavailableReportsByMetricId.Values.ToList());

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
                cpuTemperatureCandidates,
                cpuPowerCandidates,
                capturedAt,
                sourceTick,
                warnings,
                cancellationToken);
        }
    }

    private static void ReadHardwareDescriptors(
        IHardware hardware,
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId,
        List<RankedHardwareMetricDescriptor> cpuTemperatureDescriptorCandidates,
        List<RankedHardwareMetricDescriptor> cpuPowerDescriptorCandidates,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            hardware.Update();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            warnings.Add($"Hardware update failed for {hardware.Name}: {exception.GetType().Name}: {exception.Message}");
            return;
        }

        if (LibreHardwareMetricCatalog.IsSupportedHardwareType(hardware.HardwareType))
        {
            // Descriptor preload also updates hardware, which can expose new
            // sensors. Keep the descriptor pass under the same no-history
            // policy as normal snapshot refreshes.
            DisableSensorHistoryForHardware(hardware);

            foreach (ISensor sensor in hardware.Sensors)
            {
                AddUnsupportedSensorTypeWarning(sensor, warnings);

                foreach (HardwareMetricDescriptor descriptor in LibreHardwareMetricCatalog.CreateDescriptors(hardware, sensor))
                {
                    descriptorsByMetricId.TryAdd(descriptor.MetricId, descriptor);
                }

                if (LibreHardwareMetricCatalog.TryCreateCpuStableAliasDescriptorCandidate(
                    hardware,
                    sensor,
                    out RankedHardwareMetricDescriptor? cpuStableAliasDescriptorCandidate))
                {
                    if (cpuStableAliasDescriptorCandidate.Descriptor.MetricId.Equals(
                        LibreHardwareMetricCatalog.CpuTemperatureMetricId,
                        StringComparison.Ordinal))
                    {
                        cpuTemperatureDescriptorCandidates.Add(cpuStableAliasDescriptorCandidate);
                    }
                    else
                    {
                        cpuPowerDescriptorCandidates.Add(cpuStableAliasDescriptorCandidate);
                    }
                }
            }
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardwareDescriptors(
                childHardware,
                descriptorsByMetricId,
                cpuTemperatureDescriptorCandidates,
                cpuPowerDescriptorCandidates,
                warnings,
                cancellationToken);
        }
    }

    private void AddSensorReadings(
        IHardware hardware,
        ISensor sensor,
        Dictionary<string, MetricReading> hardwareReadingsByMetricId,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId,
        List<RankedMetricReading> cpuTemperatureCandidates,
        List<RankedMetricReading> cpuPowerCandidates,
        DateTimeOffset capturedAt,
        long sourceTick)
    {
        bool hadFreshReading = false;

        foreach (MetricReading reading in LibreHardwareMetricCatalog.CreateReadings(hardware, sensor))
        {
            hadFreshReading = true;
            RecordFreshReading(reading, sourceTick, capturedAt);
            AddReading(hardwareReadingsByMetricId, reading);
            AddReading(readingsByMetricId, reading);
        }

        if (LibreHardwareMetricCatalog.TryCreateCpuStableAliasReadingCandidate(
            hardware,
            sensor,
            out RankedMetricReading? cpuStableAliasCandidate))
        {
            hadFreshReading = true;
            if (cpuStableAliasCandidate.Reading.MetricId.Equals(
                LibreHardwareMetricCatalog.CpuTemperatureMetricId,
                StringComparison.Ordinal))
            {
                cpuTemperatureCandidates.Add(cpuStableAliasCandidate);
            }
            else
            {
                cpuPowerCandidates.Add(cpuStableAliasCandidate);
            }
        }

        if (hadFreshReading)
        {
            return;
        }

        string sourceSensorMetricId = LibreHardwareMetricCatalog.BuildDynamicMetricId(sensor);
        if (_retentionCache.TryReadSourceSensor(
            sensor.Identifier.ToString(),
            sourceTick,
            capturedAt,
            out MetricReading retainedCatalogReading,
            out bool sourceSensorExpired))
        {
            AddReading(hardwareReadingsByMetricId, retainedCatalogReading);
            AddReading(readingsByMetricId, retainedCatalogReading);
        }
        else if (LibreHardwareMetricCatalog.HasCanonicalMetricUnit(sensor.SensorType))
        {
            unavailableReportsByMetricId[sourceSensorMetricId] = BuildUnavailableReport(
                sourceSensorMetricId,
                sourceSensorExpired ? MetricUnavailableReason.Expired : MetricUnavailableReason.InvalidValue,
                sourceSensorExpired
                    ? BuildRawSensorIdentity(retainedCatalogReading)
                    : BuildRawSensorIdentity(hardware, sensor));
        }

        if (LibreHardwareMetricCatalog.TryGetStableMetricId(hardware, sensor, out string? stableMetricId))
        {
            if (_retentionCache.TryReadStableAlias(
                stableMetricId,
                sourceTick,
                capturedAt,
                out MetricReading retainedStableReading,
                out bool stableAliasExpired))
            {
                AddReading(hardwareReadingsByMetricId, retainedStableReading);
                AddReading(readingsByMetricId, retainedStableReading);
                unavailableReportsByMetricId.Remove(stableMetricId);
                return;
            }

            unavailableReportsByMetricId[stableMetricId] = BuildUnavailableReport(
                stableMetricId,
                stableAliasExpired ? MetricUnavailableReason.Expired : MetricUnavailableReason.InvalidValue,
                stableAliasExpired
                    ? BuildRawSensorIdentity(retainedStableReading)
                    : BuildRawSensorIdentity(hardware, sensor));
        }
    }

    private void RecordFreshReading(MetricReading reading, long sourceTick, DateTimeOffset capturedAt)
    {
        if (LibreHardwareMetricCatalog.IsSourceSensorMetricId(reading.MetricId))
        {
            _retentionCache.RecordFreshSourceSensor(reading, sourceTick, capturedAt);
            return;
        }

        _retentionCache.RecordFreshStableAlias(reading, sourceTick, capturedAt);
    }

    private void AddRankedStableAliasReading(
        string metricId,
        List<RankedMetricReading> candidates,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId,
        DateTimeOffset capturedAt,
        long sourceTick)
    {
        RankedMetricReading? selectedCandidate = candidates
            .OrderBy(candidate => candidate.Rank)
            .ThenBy(candidate => candidate.Reading.HardwareId, StringComparer.Ordinal)
            .ThenBy(candidate => candidate.Reading.SensorId, StringComparer.Ordinal)
            .FirstOrDefault();

        if (selectedCandidate is not null)
        {
            RecordFreshReading(selectedCandidate.Reading, sourceTick, capturedAt);
            AddReading(readingsByMetricId, selectedCandidate.Reading);
            unavailableReportsByMetricId.Remove(metricId);
            return;
        }

        if (_retentionCache.TryReadStableAlias(
            metricId,
            sourceTick,
            capturedAt,
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

    private void PublishAggregatePollingGroupSnapshots(
        Dictionary<string, MetricReading> readingsByMetricId,
        DateTimeOffset capturedAt)
    {
        // Aggregate groups are computed from the full traversal, but their
        // snapshots must not inherit unrelated hardware warnings. A GPU update
        // failure should not appear on a network throughput read.
        PublishPollingGroupSnapshot(
            LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId,
            readingsByMetricId,
            [],
            capturedAt);
        PublishPollingGroupSnapshot(
            LibreHardwareMetricCatalog.StorageAggregatePollingGroupId,
            readingsByMetricId,
            [],
            capturedAt);
    }

    private void PublishPollingGroupSnapshot(
        string pollingGroupId,
        Dictionary<string, MetricReading> readingsByMetricId,
        IReadOnlyList<string> warnings,
        DateTimeOffset capturedAt,
        IReadOnlyList<MetricUnavailableReport>? unavailableReports = null)
    {
        List<MetricReading> readings = readingsByMetricId.Values
            .Where(reading => !LibreHardwareMetricCatalog.IsInternalMetricId(reading.MetricId)
                && IsMetricInPollingGroup(reading.MetricId, pollingGroupId))
            .ToList();
        List<MetricUnavailableReport> filteredUnavailableMetrics = unavailableReports?
            .Where(diagnostic => IsMetricInPollingGroup(diagnostic.MetricId, pollingGroupId))
            .ToList() ?? [];

        if (readings.Count == 0 && warnings.Count == 0 && filteredUnavailableMetrics.Count == 0)
        {
            return;
        }

        _latestSnapshotsByPollingGroupId[pollingGroupId] = new MetricSnapshot
        {
            CapturedAt = capturedAt,
            Readings = readings,
            UnavailableMetrics = filteredUnavailableMetrics,
            Warnings = warnings.ToList(),
        };
    }

    private void PublishStableAliasPollingGroupSnapshot(
        string metricId,
        Dictionary<string, MetricReading> readingsByMetricId,
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId,
        DateTimeOffset capturedAt)
    {
        if (!_pollingGroupIdsByMetricId.TryGetValue(metricId, out string? pollingGroupId))
        {
            return;
        }

        PublishPollingGroupSnapshot(
            pollingGroupId,
            readingsByMetricId,
            [],
            capturedAt,
            unavailableReportsByMetricId.Values.ToList());
    }

    private bool IsMetricInPollingGroup(string metricId, string pollingGroupId)
    {
        return _pollingGroupIdsByMetricId.TryGetValue(metricId, out string? metricPollingGroupId)
            && metricPollingGroupId.Equals(pollingGroupId, StringComparison.Ordinal);
    }

    private static void AddDerivedReadings(Dictionary<string, MetricReading> readingsByMetricId)
    {
        AddMemoryDerivedReadings(readingsByMetricId);
        AddDiskDerivedReadings(readingsByMetricId);
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

    private static void AddDiskDerivedReadings(Dictionary<string, MetricReading> readingsByMetricId)
    {
        MetricReading? diskRead = readingsByMetricId.GetValueOrDefault(LibreHardwareMetricCatalog.DiskReadThroughputMetricId);
        MetricReading? diskWrite = readingsByMetricId.GetValueOrDefault(LibreHardwareMetricCatalog.DiskWriteThroughputMetricId);

        if (diskRead is not null || diskWrite is not null)
        {
            MetricReading baseReading = diskRead ?? diskWrite!;

            readingsByMetricId[LibreHardwareMetricCatalog.DiskTotalThroughputMetricId] = baseReading with
            {
                MetricId = LibreHardwareMetricCatalog.DiskTotalThroughputMetricId,
                SensorId = JoinSourceSensorIds(diskRead?.SensorId, diskWrite?.SensorId),
                SensorName = "Disk Throughput Total",
                Value = (diskRead?.Value ?? 0) + (diskWrite?.Value ?? 0),
                Unit = MetricUnit.BytesPerSecond,
            };
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

        HardwareMetricDescriptor? diskRead = descriptorsByMetricId.GetValueOrDefault(LibreHardwareMetricCatalog.DiskReadThroughputMetricId);
        HardwareMetricDescriptor? diskWrite = descriptorsByMetricId.GetValueOrDefault(LibreHardwareMetricCatalog.DiskWriteThroughputMetricId);

        if (diskRead is not null || diskWrite is not null)
        {
            HardwareMetricDescriptor baseDescriptor = diskRead ?? diskWrite!;

            descriptorsByMetricId[LibreHardwareMetricCatalog.DiskTotalThroughputMetricId] = baseDescriptor with
            {
                MetricId = LibreHardwareMetricCatalog.DiskTotalThroughputMetricId,
                SourceSensorId = JoinSourceSensorIds(diskRead?.SourceSensorId, diskWrite?.SourceSensorId),
                SensorName = "Disk Throughput Total",
                Unit = MetricUnit.BytesPerSecond,
            };
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

    private static List<MetricReading> FilterReadings(
        Dictionary<string, MetricReading> readingsByMetricId,
        HashSet<string>? requestedMetricIds)
    {
        return readingsByMetricId.Values
            .Where(reading => !LibreHardwareMetricCatalog.IsInternalMetricId(reading.MetricId)
                && IsRequestedMetric(requestedMetricIds, reading.MetricId))
            .ToList();
    }

    private static MetricSnapshot FilterSnapshot(
        MetricSnapshot snapshot,
        HashSet<string>? requestedMetricIds)
    {
        if (requestedMetricIds is null)
        {
            return snapshot;
        }

        return snapshot with
        {
            Readings = snapshot.Readings
                .Where(reading => requestedMetricIds.Contains(reading.MetricId))
                .ToList(),
            UnavailableMetrics = BuildFilteredUnavailableMetrics(snapshot, requestedMetricIds),
        };
    }

    private static List<MetricUnavailableReport> BuildFilteredUnavailableMetrics(
        MetricSnapshot snapshot,
        HashSet<string> requestedMetricIds)
    {
        HashSet<string> returnedMetricIds = new(
            snapshot.Readings.Select(reading => reading.MetricId),
            StringComparer.Ordinal);
        Dictionary<string, MetricUnavailableReport> diagnosticsByMetricId = snapshot.UnavailableMetrics
            .Where(diagnostic => requestedMetricIds.Contains(diagnostic.MetricId))
            .ToDictionary(diagnostic => diagnostic.MetricId, StringComparer.Ordinal);

        foreach (string requestedMetricId in requestedMetricIds)
        {
            if (returnedMetricIds.Contains(requestedMetricId)
                || diagnosticsByMetricId.ContainsKey(requestedMetricId))
            {
                continue;
            }

            diagnosticsByMetricId[requestedMetricId] = BuildUnavailableReport(
                requestedMetricId,
                MetricUnavailableReason.NoSensor);
        }

        return diagnosticsByMetricId.Values.ToList();
    }

    private static List<MetricUnavailableReport> FilterUnavailableMetrics(
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId,
        HashSet<string>? requestedMetricIds)
    {
        return unavailableReportsByMetricId.Values
            .Where(diagnostic => IsRequestedMetric(requestedMetricIds, diagnostic.MetricId))
            .ToList();
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

    private static List<HardwareMetricDescriptor> FilterDescriptors(
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId,
        HashSet<string>? requestedMetricIds)
    {
        return descriptorsByMetricId.Values
            .Where(descriptor => !LibreHardwareMetricCatalog.IsInternalMetricId(descriptor.MetricId)
                && IsRequestedMetric(requestedMetricIds, descriptor.MetricId))
            .ToList();
    }

    private static HardwareMetricDescriptorSnapshot FilterDescriptorSnapshot(
        HardwareMetricDescriptorSnapshot descriptorSnapshot,
        HashSet<string>? requestedMetricIds)
    {
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

    private static HashSet<string>? BuildRequestedMetricSet(IReadOnlyCollection<string> metricIds)
    {
        return metricIds.Count == 0 ? null : new HashSet<string>(metricIds, StringComparer.Ordinal);
    }

    private static bool IsRequestedMetric(HashSet<string>? requestedMetricIds, string metricId)
    {
        return requestedMetricIds is null || requestedMetricIds.Contains(metricId);
    }

    private static void AddMissingMetricWarnings(List<MetricReading> readings, List<string> warnings)
    {
        if (!readings.Any(reading => reading.MetricId.Equals("cpu.usage_percent", StringComparison.Ordinal)))
        {
            warnings.Add("No CPU metric value was returned by LibreHardwareMonitor.");
        }
    }

    private static void AddUnsupportedSensorTypeWarning(ISensor sensor, List<string> warnings)
    {
        if (!LibreHardwareMetricCatalog.HasCanonicalMetricUnit(sensor.SensorType))
        {
            string warning = $"LibreHardwareMonitor sensor type '{sensor.SensorType}' has no ShoMetrics unit mapping.";

            if (!warnings.Contains(warning, StringComparer.Ordinal))
            {
                warnings.Add(warning);
            }
        }
    }

    private static void DisableSensorHistoryForComputer(Computer computer)
    {
        foreach (IHardware hardware in computer.Hardware)
        {
            DisableSensorHistoryForHardwareTree(hardware);
        }
    }

    private static void DisableSensorHistoryForHardwareTree(IHardware hardware)
    {
        DisableSensorHistoryForHardware(hardware);

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            DisableSensorHistoryForHardwareTree(childHardware);
        }
    }

    private static void DisableSensorHistoryForHardware(IHardware hardware)
    {
        // ShoMetrics owns history in MetricStore. Keeping LHM's per-sensor
        // history duplicates storage and allocation work inside the helper.
        foreach (ISensor sensor in hardware.Sensors)
        {
            sensor.ValuesTimeWindow = TimeSpan.Zero;
        }
    }

    private static string JoinSourceSensorIds(string? firstSourceSensorId, string? secondSourceSensorId)
    {
        return string.Join(
            ';',
            new[] { firstSourceSensorId, secondSourceSensorId }.Where(id => !string.IsNullOrWhiteSpace(id)));
    }
}
