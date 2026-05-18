using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

public sealed class LibreHardwareMetricSource
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

    private static void ReadComputer(
        Action<IHardware> readHardware,
        List<string> warnings,
        CancellationToken cancellationToken)
    {
        Computer computer = LibreHardwareComputerFactory.Create();

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
        catch (Exception exception) when (exception is not OperationCanceledException)
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
                Unit = LibreHardwareMetricCatalog.GetRawSensorUnit(sensor.SensorType),
            });
        }

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardwareDump(childHardware, sensors, warnings, cancellationToken);
        }
    }
}
