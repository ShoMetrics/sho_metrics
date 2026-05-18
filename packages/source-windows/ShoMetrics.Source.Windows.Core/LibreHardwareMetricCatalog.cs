using System.Diagnostics.CodeAnalysis;
using System.Text;
using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

internal static class LibreHardwareMetricCatalog
{
    public static bool IsSupportedHardwareType(HardwareType hardwareType)
    {
        return hardwareType is HardwareType.Cpu
            or HardwareType.GpuAmd
            or HardwareType.GpuIntel
            or HardwareType.GpuNvidia
            or HardwareType.Memory
            or HardwareType.Network
            or HardwareType.Storage;
    }

    public static bool TryCreateReading(IHardware hardware, ISensor sensor, [NotNullWhen(true)] out MetricReading? reading)
    {
        reading = null;

        if (sensor.Value is not { } value
            || !float.IsFinite(value)
            || !TryGetMetricId(hardware, sensor, out string? metricId))
        {
            return false;
        }

        reading = new MetricReading
        {
            MetricId = metricId,
            HardwareId = hardware.Identifier.ToString(),
            HardwareName = hardware.Name,
            HardwareType = hardware.HardwareType.ToString(),
            SensorId = sensor.Identifier.ToString(),
            SensorName = sensor.Name,
            SensorType = sensor.SensorType.ToString(),
            Value = value,
            Unit = GetUnit(sensor.SensorType),
        };
        return true;
    }

    public static bool TryCreateDescriptor(
        IHardware hardware,
        ISensor sensor,
        [NotNullWhen(true)] out HardwareMetricDescriptor? descriptor)
    {
        descriptor = null;

        if (!TryGetMetricId(hardware, sensor, out string? metricId))
        {
            return false;
        }

        descriptor = new HardwareMetricDescriptor
        {
            MetricId = metricId,
            SourceSensorId = sensor.Identifier.ToString(),
            HardwareId = hardware.Identifier.ToString(),
            HardwareName = hardware.Name,
            SensorName = sensor.Name,
            SensorType = sensor.SensorType.ToString(),
            Unit = GetUnit(sensor.SensorType),
            IsDynamic = false,
        };
        return true;
    }

    public static string GetUnit(SensorType sensorType)
    {
        return sensorType switch
        {
            SensorType.Load => "percent",
            SensorType.Temperature => "celsius",
            SensorType.Data => "gb",
            SensorType.Power => "watts",
            SensorType.Throughput => "bytes_per_second",
            _ => "raw",
        };
    }

    private static bool TryGetMetricId(IHardware hardware, ISensor sensor, [NotNullWhen(true)] out string? metricId)
    {
        metricId = hardware.HardwareType switch
        {
            HardwareType.Cpu => GetCpuMetricId(sensor),
            HardwareType.Memory => GetMemoryMetricId(hardware, sensor),
            HardwareType.GpuAmd or HardwareType.GpuIntel or HardwareType.GpuNvidia => GetGpuMetricId(hardware, sensor),
            HardwareType.Network => GetNetworkMetricId(hardware, sensor),
            HardwareType.Storage => GetStorageMetricId(hardware, sensor),
            _ => null,
        };

        return metricId is not null;
    }

    private static string? GetCpuMetricId(ISensor sensor)
    {
        return sensor.SensorType switch
        {
            SensorType.Load when sensor.Name.Equals("CPU Total", StringComparison.Ordinal) => "cpu.load.percent",
            SensorType.Load when sensor.Name.Equals("CPU Core Max", StringComparison.Ordinal) => "cpu.core.max_load.percent",
            SensorType.Temperature when sensor.Name.Equals("CPU Package", StringComparison.Ordinal) => "cpu.package.temperature.celsius",
            SensorType.Temperature when sensor.Name.Equals("Core Max", StringComparison.Ordinal) => "cpu.core.max_temperature.celsius",
            SensorType.Power when sensor.Name.Equals("CPU Package", StringComparison.Ordinal) => "cpu.package.power.watts",
            _ => null,
        };
    }

    private static string? GetMemoryMetricId(IHardware hardware, ISensor sensor)
    {
        if (!hardware.Name.Equals("Memory", StringComparison.Ordinal)
            && !hardware.Name.Equals("Total Memory", StringComparison.Ordinal))
        {
            return null;
        }

        return sensor.SensorType switch
        {
            SensorType.Load when sensor.Name.Equals("Memory", StringComparison.Ordinal) => "ram.load.percent",
            SensorType.Data when sensor.Name.Equals("Memory Used", StringComparison.Ordinal) => "ram.used.gb",
            SensorType.Data when sensor.Name.Equals("Memory Available", StringComparison.Ordinal) => "ram.available.gb",
            _ => null,
        };
    }

    private static string? GetGpuMetricId(IHardware hardware, ISensor sensor)
    {
        string metricPrefix = GetGpuMetricPrefix(hardware);

        return sensor.SensorType switch
        {
            SensorType.Load when sensor.Name.Equals("GPU Core", StringComparison.Ordinal) => $"{metricPrefix}.load.percent",
            SensorType.Load when sensor.Name.Equals("D3D 3D", StringComparison.Ordinal) => $"{metricPrefix}.d3d_3d_load.percent",
            SensorType.Load when sensor.Name.Equals("GPU Memory", StringComparison.Ordinal) => $"{metricPrefix}.memory.load.percent",
            SensorType.Load when sensor.Name.Equals("GPU Memory Controller", StringComparison.Ordinal) => $"{metricPrefix}.memory_controller.load.percent",
            SensorType.Temperature when sensor.Name.Equals("GPU Core", StringComparison.Ordinal) => $"{metricPrefix}.temperature.celsius",
            SensorType.Temperature when sensor.Name.Equals("GPU Memory Junction", StringComparison.Ordinal) => $"{metricPrefix}.memory_junction.temperature.celsius",
            SensorType.Power when sensor.Name.Equals("GPU Package", StringComparison.Ordinal) => $"{metricPrefix}.power.watts",
            SensorType.Power when sensor.Name.Equals("GPU Power", StringComparison.Ordinal) => $"{metricPrefix}.power.watts",
            SensorType.Data when sensor.Name.Equals("GPU Memory Used", StringComparison.Ordinal) => $"{metricPrefix}.memory.used.gb",
            SensorType.Data when sensor.Name.Equals("GPU Memory Free", StringComparison.Ordinal) => $"{metricPrefix}.memory.free.gb",
            SensorType.Data when sensor.Name.Equals("GPU Memory Total", StringComparison.Ordinal) => $"{metricPrefix}.memory.total.gb",
            _ => null,
        };
    }

    private static string? GetNetworkMetricId(IHardware hardware, ISensor sensor)
    {
        string metricPrefix = $"network.{GetMetricIdSegment(hardware.Identifier.ToString())}";

        return sensor.SensorType switch
        {
            SensorType.Load when sensor.Name.Equals("Network Utilization", StringComparison.Ordinal) => $"{metricPrefix}.utilization.percent",
            SensorType.Throughput when sensor.Name.Equals("Download Speed", StringComparison.Ordinal) => $"{metricPrefix}.download.bytes_per_second",
            SensorType.Throughput when sensor.Name.Equals("Upload Speed", StringComparison.Ordinal) => $"{metricPrefix}.upload.bytes_per_second",
            SensorType.Data when sensor.Name.Equals("Data Downloaded", StringComparison.Ordinal) => $"{metricPrefix}.download.total.gb",
            SensorType.Data when sensor.Name.Equals("Data Uploaded", StringComparison.Ordinal) => $"{metricPrefix}.upload.total.gb",
            _ => null,
        };
    }

    private static string? GetStorageMetricId(IHardware hardware, ISensor sensor)
    {
        string metricPrefix = $"storage.{GetMetricIdSegment(hardware.Identifier.ToString())}";

        return sensor.SensorType switch
        {
            SensorType.Throughput when sensor.Name.Equals("Read Rate", StringComparison.Ordinal) => $"{metricPrefix}.read.bytes_per_second",
            SensorType.Throughput when sensor.Name.Equals("Write Rate", StringComparison.Ordinal) => $"{metricPrefix}.write.bytes_per_second",
            SensorType.Load when sensor.Name.Equals("Read Activity", StringComparison.Ordinal) => $"{metricPrefix}.read_activity.percent",
            SensorType.Load when sensor.Name.Equals("Write Activity", StringComparison.Ordinal) => $"{metricPrefix}.write_activity.percent",
            SensorType.Load when sensor.Name.Equals("Total Activity", StringComparison.Ordinal) => $"{metricPrefix}.activity.percent",
            SensorType.Load when sensor.Name.Equals("Used Space", StringComparison.Ordinal) => $"{metricPrefix}.used.percent",
            SensorType.Data when sensor.Name.Equals("Used Space", StringComparison.Ordinal) => $"{metricPrefix}.used.gb",
            SensorType.Data when sensor.Name.Equals("Free Space", StringComparison.Ordinal) => $"{metricPrefix}.free.gb",
            SensorType.Data when sensor.Name.Equals("Total Space", StringComparison.Ordinal) => $"{metricPrefix}.total.gb",
            _ => null,
        };
    }

    private static string GetGpuMetricPrefix(IHardware hardware)
    {
        return hardware.HardwareType switch
        {
            HardwareType.GpuNvidia => "gpu.nvidia",
            HardwareType.GpuAmd => "gpu.amd",
            HardwareType.GpuIntel => "gpu.intel",
            _ => $"gpu.{GetMetricIdSegment(hardware.Identifier.ToString())}",
        };
    }

    private static string GetMetricIdSegment(string identifier)
    {
        string lastSegment = GetLastPathSegment(identifier);
        StringBuilder segmentBuilder = new(lastSegment.Length);

        foreach (char character in lastSegment)
        {
            segmentBuilder.Append(char.IsAsciiLetterOrDigit(character)
                ? char.ToLowerInvariant(character)
                : '_');
        }

        string segment = segmentBuilder.ToString().Trim('_');
        return segment.Length == 0 ? "0" : segment;
    }

    private static string GetLastPathSegment(string identifier)
    {
        string[] segments = identifier.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return segments.Length == 0 ? identifier : segments[^1];
    }
}
