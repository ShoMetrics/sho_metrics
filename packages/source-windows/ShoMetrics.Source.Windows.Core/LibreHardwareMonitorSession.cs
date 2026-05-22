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

    private readonly Computer? _computer;
    private readonly HardwareMetricDescriptorSnapshot _cachedDescriptorSnapshot;
    private readonly IReadOnlyDictionary<string, string> _pollingGroupIdsByMetricId;
    private readonly ConcurrentDictionary<string, MetricSnapshot> _latestSnapshotsByPollingGroupId =
        new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _readGate = new(1, 1);
    private MetricSnapshot _latestSnapshot;
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

            Dictionary<string, MetricReading> readingsByMetricId = new(StringComparer.Ordinal);
            List<string> warnings = [];

            foreach (IHardware hardware in _computer.Hardware)
            {
                ReadHardware(
                    hardware,
                    readingsByMetricId,
                    warnings,
                    cancellationToken);
            }

            AddDerivedReadings(readingsByMetricId);
            PublishAggregatePollingGroupSnapshots(readingsByMetricId);

            List<MetricReading> readings = FilterReadings(readingsByMetricId, requestedMetricIds: null);
            AddMissingMetricWarnings(readings, warnings);

            MetricSnapshot snapshot = new()
            {
                CapturedAt = DateTimeOffset.UtcNow,
                Readings = readings,
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
        List<string> warnings = [];

        foreach (IHardware hardware in computer.Hardware)
        {
            ReadHardwareDescriptors(hardware, descriptorsByMetricId, warnings, cancellationToken);
        }

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

                foreach (MetricReading reading in LibreHardwareMetricCatalog.CreateReadings(hardware, sensor))
                {
                    AddReading(hardwareReadingsByMetricId, reading);
                    AddReading(readingsByMetricId, reading);
                }
            }
        }

        AddMemoryDerivedReadings(hardwareReadingsByMetricId);
        PublishPollingGroupSnapshot(
            LibreHardwareMetricCatalog.BuildHardwarePollingGroupId(hardware),
            hardwareReadingsByMetricId,
            hardwareWarnings);

        if (updateError is not null)
        {
            return;
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardware(
                childHardware,
                readingsByMetricId,
                warnings,
                cancellationToken);
        }
    }

    private static void ReadHardwareDescriptors(
        IHardware hardware,
        Dictionary<string, HardwareMetricDescriptor> descriptorsByMetricId,
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
            }
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardwareDescriptors(childHardware, descriptorsByMetricId, warnings, cancellationToken);
        }
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

    private void PublishAggregatePollingGroupSnapshots(Dictionary<string, MetricReading> readingsByMetricId)
    {
        // Aggregate groups are computed from the full traversal, but their
        // snapshots must not inherit unrelated hardware warnings. A GPU update
        // failure should not appear on a network throughput read.
        PublishPollingGroupSnapshot(
            LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId,
            readingsByMetricId,
            []);
        PublishPollingGroupSnapshot(
            LibreHardwareMetricCatalog.StorageAggregatePollingGroupId,
            readingsByMetricId,
            []);
    }

    private void PublishPollingGroupSnapshot(
        string pollingGroupId,
        Dictionary<string, MetricReading> readingsByMetricId,
        IReadOnlyList<string> warnings)
    {
        List<MetricReading> readings = readingsByMetricId.Values
            .Where(reading => !LibreHardwareMetricCatalog.IsInternalMetricId(reading.MetricId)
                && IsMetricInPollingGroup(reading.MetricId, pollingGroupId))
            .ToList();

        if (readings.Count == 0 && warnings.Count == 0)
        {
            return;
        }

        _latestSnapshotsByPollingGroupId[pollingGroupId] = new MetricSnapshot
        {
            CapturedAt = DateTimeOffset.UtcNow,
            Readings = readings,
            Warnings = warnings.ToList(),
        };
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
