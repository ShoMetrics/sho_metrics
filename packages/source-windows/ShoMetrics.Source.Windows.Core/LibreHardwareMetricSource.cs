using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

public sealed class LibreHardwareMetricSource : IHardwareMetricSource
{
    public HardwareSensorSnapshot ReadSensorDump(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        List<HardwareSensorReading> sensors = [];
        List<string> warnings = [];

        ReadComputer(
            hardware => ReadHardwareDump(hardware, sensors, warnings, cancellationToken),
            warnings,
            cancellationToken);

        return new HardwareSensorSnapshot
        {
            CapturedAt = DateTimeOffset.UtcNow,
            Sensors = sensors,
            Warnings = warnings,
        };
    }

    public MetricSnapshot ReadSnapshot(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        List<MetricReading> readings = [];
        List<string> warnings = [];
        HashSet<string> metricIds = new(StringComparer.Ordinal);

        ReadComputer(
            hardware => ReadHardware(hardware, readings, metricIds, warnings, cancellationToken),
            warnings,
            cancellationToken);

        AddMissingMetricWarnings(readings, warnings);

        return new MetricSnapshot
        {
            CapturedAt = DateTimeOffset.UtcNow,
            Readings = readings,
            Warnings = warnings,
        };
    }

    private static void ReadComputer(
        Action<IHardware> readHardware,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        Computer computer = CreateComputer();

        try
        {
            computer.Open();

            foreach (IHardware hardware in computer.Hardware)
            {
                cancellationToken.ThrowIfCancellationRequested();
                readHardware(hardware);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            warnings.Add($"LibreHardwareMonitor failed: {exception.GetType().Name}: {exception.Message}");
        }
        finally
        {
            computer.Close();
        }
    }

    private static void ReadHardware(
        IHardware hardware,
        List<MetricReading> readings,
        HashSet<string> metricIds,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            hardware.Update();
        }
        catch (Exception exception)
        {
            warnings.Add($"Hardware update failed for {hardware.Name}: {exception.GetType().Name}: {exception.Message}");
            return;
        }

        if (LibreHardwareMetricCatalog.IsSupportedHardwareType(hardware.HardwareType))
        {
            foreach (ISensor sensor in hardware.Sensors)
            {
                if (LibreHardwareMetricCatalog.TryCreateReading(hardware, sensor, out MetricReading? reading)
                    && metricIds.Add(reading.MetricId))
                {
                    readings.Add(reading);
                }
            }
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardware(childHardware, readings, metricIds, warnings, cancellationToken);
        }
    }

    private static void ReadHardwareDump(
        IHardware hardware,
        List<HardwareSensorReading> sensors,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            hardware.Update();
        }
        catch (Exception exception)
        {
            warnings.Add($"Hardware update failed for {hardware.Name}: {exception.GetType().Name}: {exception.Message}");
            return;
        }

        foreach (ISensor sensor in hardware.Sensors)
        {
            sensors.Add(new HardwareSensorReading
            {
                HardwareId = hardware.Identifier.ToString(),
                HardwareName = hardware.Name,
                HardwareType = hardware.HardwareType.ToString(),
                SensorId = sensor.Identifier.ToString(),
                SensorName = sensor.Name,
                SensorType = sensor.SensorType.ToString(),
                Value = sensor.Value,
                Unit = LibreHardwareMetricCatalog.GetUnit(sensor.SensorType),
            });
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardwareDump(childHardware, sensors, warnings, cancellationToken);
        }
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
