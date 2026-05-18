using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

public sealed class LibreHardwareMonitorSession : IDisposable
{
    private readonly Computer? _computer;
    private readonly SemaphoreSlim _readGate = new(1, 1);
    private bool _isDisposed;

    public LibreHardwareMonitorSession()
    {
        Computer computer = CreateComputer();
        List<HardwareSourceWarning> warnings = [];

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

        InitializationWarnings = warnings;
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

            List<MetricReading> readings = [];
            List<string> warnings = [];
            HashSet<string> emittedMetricIds = new(StringComparer.Ordinal);
            HashSet<string>? requestedMetricIds = BuildRequestedMetricSet(metricIds);

            foreach (IHardware hardware in _computer.Hardware)
            {
                ReadHardware(hardware, requestedMetricIds, readings, emittedMetricIds, warnings, cancellationToken);
            }

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

    public async Task<HardwareMetricDescriptorSnapshot> ListMetricDescriptorsAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        if (_computer is null)
        {
            return new HardwareMetricDescriptorSnapshot
            {
                Descriptors = [],
                Warnings = InitializationWarnings.Select(warning => warning.Message).ToList(),
            };
        }

        await _readGate.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            ObjectDisposedException.ThrowIf(_isDisposed, this);

            List<HardwareMetricDescriptor> descriptors = [];
            List<string> warnings = [];
            HashSet<string> emittedMetricIds = new(StringComparer.Ordinal);
            HashSet<string>? requestedMetricIds = BuildRequestedMetricSet(metricIds);

            foreach (IHardware hardware in _computer.Hardware)
            {
                ReadHardwareDescriptors(hardware, requestedMetricIds, descriptors, emittedMetricIds, warnings, cancellationToken);
            }

            return new HardwareMetricDescriptorSnapshot
            {
                Descriptors = descriptors,
                Warnings = warnings,
            };
        }
        finally
        {
            _readGate.Release();
        }
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

    private static void ReadHardware(
        IHardware hardware,
        HashSet<string>? requestedMetricIds,
        List<MetricReading> readings,
        HashSet<string> emittedMetricIds,
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
                if (LibreHardwareMetricCatalog.TryCreateReading(hardware, sensor, out MetricReading? reading)
                    && IsRequestedMetric(requestedMetricIds, reading.MetricId)
                    && emittedMetricIds.Add(reading.MetricId))
                {
                    readings.Add(reading);
                }
            }
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardware(childHardware, requestedMetricIds, readings, emittedMetricIds, warnings, cancellationToken);
        }
    }

    private static void ReadHardwareDescriptors(
        IHardware hardware,
        HashSet<string>? requestedMetricIds,
        List<HardwareMetricDescriptor> descriptors,
        HashSet<string> emittedMetricIds,
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
                if (LibreHardwareMetricCatalog.TryCreateDescriptor(hardware, sensor, out HardwareMetricDescriptor? descriptor)
                    && IsRequestedMetric(requestedMetricIds, descriptor.MetricId)
                    && emittedMetricIds.Add(descriptor.MetricId))
                {
                    descriptors.Add(descriptor);
                }
            }
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardwareDescriptors(childHardware, requestedMetricIds, descriptors, emittedMetricIds, warnings, cancellationToken);
        }
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
        if (!readings.Any(reading => reading.MetricId.StartsWith("cpu.", StringComparison.Ordinal)
            && reading.SensorType.Equals("Temperature", StringComparison.Ordinal)))
        {
            warnings.Add("No CPU temperature value was returned by LibreHardwareMonitor. MSR-backed CPU temperature requires running this helper from an elevated administrator process on this machine.");
        }

        if (!readings.Any(reading => reading.MetricId.StartsWith("gpu.", StringComparison.Ordinal)
            && reading.SensorType.Equals("Temperature", StringComparison.Ordinal)))
        {
            warnings.Add("No GPU temperature value was returned by LibreHardwareMonitor.");
        }
    }

    private static Computer CreateComputer()
    {
        return new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsMotherboardEnabled = true,
            IsNetworkEnabled = true,
            IsStorageEnabled = true,
        };
    }
}
