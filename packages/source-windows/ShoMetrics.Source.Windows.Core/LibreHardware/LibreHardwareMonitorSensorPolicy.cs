using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Shared LHM sensor policy used by descriptor preload and runtime reads.
/// </summary>
/// <remarks>
/// Keep only direct LHM sensor rules here, such as disabling LHM-local history
/// and reporting unsupported sensor units. Runtime snapshot state and descriptor
/// ownership belong to their dedicated builder/reader/cache types.
/// </remarks>
internal static class LibreHardwareMonitorSensorPolicy
{
    public static void AddUnsupportedSensorTypeWarning(ISensor sensor, List<string> warnings)
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

    public static void DisableSensorHistoryForComputer(Computer computer)
    {
        foreach (IHardware hardware in computer.Hardware)
        {
            DisableSensorHistoryForHardwareTree(hardware);
        }
    }

    public static void DisableSensorHistoryForHardwareTree(IHardware hardware)
    {
        DisableSensorHistoryForHardware(hardware);

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            DisableSensorHistoryForHardwareTree(childHardware);
        }
    }

    public static void DisableSensorHistoryForHardware(IHardware hardware)
    {
        // ShoMetrics owns history in MetricStore. Keeping LHM's per-sensor
        // history duplicates storage and allocation work inside the helper.
        foreach (ISensor sensor in hardware.Sensors)
        {
            sensor.ValuesTimeWindow = TimeSpan.Zero;
        }
    }
}
