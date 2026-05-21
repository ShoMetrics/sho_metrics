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
    private readonly SemaphoreSlim _readGate = new(1, 1);
    private bool _isDisposed;

    public LibreHardwareMonitorSession()
    {
        Computer computer = LibreHardwareComputerFactory.Create();
        List<HardwareSourceWarning> warnings = [];
        HardwareMetricDescriptorSnapshot? cachedDescriptorSnapshot = null;

        try
        {
            computer.Open();
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
    }

    public bool IsAvailable => _computer is not null;

    public IReadOnlyList<HardwareSourceWarning> InitializationWarnings { get; }

    public async Task<MetricSnapshot> ReadSnapshotAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        if (_computer is null)
        {
            return BuildUnavailableSnapshot();
        }

        await _readGate.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            ObjectDisposedException.ThrowIf(_isDisposed, this);

            Dictionary<string, MetricReading> readingsByMetricId = new(StringComparer.Ordinal);
            List<string> warnings = [];
            HashSet<string>? requestedMetricIds = BuildRequestedMetricSet(metricIds);

            foreach (IHardware hardware in _computer.Hardware)
            {
                ReadHardware(hardware, readingsByMetricId, warnings, cancellationToken);
            }

            AddDerivedReadings(readingsByMetricId);

            List<MetricReading> readings = FilterReadings(readingsByMetricId, requestedMetricIds);

            if (metricIds.Count == 0)
            {
                AddMissingMetricWarnings(readings, warnings);
            }

            return new MetricSnapshot
            {
                CapturedAt = DateTimeOffset.UtcNow,
                Readings = readings,
                Warnings = warnings,
            };
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

    private static void ReadHardware(
        IHardware hardware,
        Dictionary<string, MetricReading> readingsByMetricId,
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
            foreach (ISensor sensor in hardware.Sensors)
            {
                AddUnsupportedSensorTypeWarning(sensor, warnings);

                foreach (MetricReading reading in LibreHardwareMetricCatalog.CreateReadings(hardware, sensor))
                {
                    AddReading(readingsByMetricId, reading);
                }
            }
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardware(childHardware, readingsByMetricId, warnings, cancellationToken);
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

    private static void AddDerivedReadings(Dictionary<string, MetricReading> readingsByMetricId)
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

    private static string JoinSourceSensorIds(string? firstSourceSensorId, string? secondSourceSensorId)
    {
        return string.Join(
            ';',
            new[] { firstSourceSensorId, secondSourceSensorId }.Where(id => !string.IsNullOrWhiteSpace(id)));
    }
}
