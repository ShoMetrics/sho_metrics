using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

internal static class LibreHardwareMetricCatalog
{
    internal const string RamAvailableMetricId = "ram.available";
    internal const string RamTotalMetricId = "ram.total";
    internal const string DiskReadThroughputMetricId = "disk.throughput.read";
    internal const string DiskWriteThroughputMetricId = "disk.throughput.write";
    internal const string DiskTotalThroughputMetricId = "disk.throughput.total";

    private const double BytesPerGibibyte = 1024d * 1024d * 1024d;

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
            || !TryGetMetricId(hardware, sensor, out string? metricId)
            || !TryConvertValue(sensor.SensorType, value, out double convertedValue)
            || !IsValidMetricValue(metricId, convertedValue))
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
            Value = convertedValue,
            Unit = GetCanonicalMetricUnit(sensor.SensorType),
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
            Unit = GetCanonicalMetricUnit(sensor.SensorType),
            IsDynamic = false,
        };
        return true;
    }

    internal static string GetRawSensorUnit(SensorType sensorType)
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

    internal static bool IsInternalMetricId(string metricId)
    {
        return metricId.Equals(RamAvailableMetricId, StringComparison.Ordinal);
    }

    internal static bool ShouldAggregateMetric(string metricId)
    {
        return metricId is "net.down" or "net.up" or DiskReadThroughputMetricId or DiskWriteThroughputMetricId;
    }

    private static bool TryGetMetricId(IHardware hardware, ISensor sensor, [NotNullWhen(true)] out string? metricId)
    {
        metricId = hardware.HardwareType switch
        {
            HardwareType.Cpu => GetCpuMetricId(sensor),
            HardwareType.Memory => GetMemoryMetricId(hardware, sensor),
            HardwareType.GpuAmd or HardwareType.GpuIntel or HardwareType.GpuNvidia => GetGpuMetricId(sensor),
            HardwareType.Network => GetNetworkMetricId(sensor),
            HardwareType.Storage => GetStorageMetricId(sensor),
            _ => null,
        };

        return metricId is not null;
    }

    private static string? GetCpuMetricId(ISensor sensor)
    {
        return sensor.SensorType switch
        {
            SensorType.Load when sensor.Name.Equals("CPU Total", StringComparison.Ordinal) => "cpu.usage_percent",
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
            SensorType.Data when sensor.Name.Equals("Memory Used", StringComparison.Ordinal) => "ram.used",
            SensorType.Data when sensor.Name.Equals("Memory Available", StringComparison.Ordinal) => RamAvailableMetricId,
            _ => null,
        };
    }

    private static string? GetGpuMetricId(ISensor sensor)
    {
        return sensor.SensorType switch
        {
            SensorType.Load when sensor.Name.Equals("GPU Core", StringComparison.Ordinal) => "gpu.usage_percent",
            SensorType.Temperature when sensor.Name.Equals("GPU Core", StringComparison.Ordinal) => "gpu.temp",
            SensorType.Power when sensor.Name.Equals("GPU Package", StringComparison.Ordinal) => "gpu.power",
            SensorType.Power when sensor.Name.Equals("GPU Power", StringComparison.Ordinal) => "gpu.power",
            SensorType.Data when sensor.Name.Equals("GPU Memory Used", StringComparison.Ordinal) => "gpu.vram_used",
            SensorType.Data when sensor.Name.Equals("GPU Memory Total", StringComparison.Ordinal) => "gpu.vram_total",
            _ => null,
        };
    }

    private static string? GetNetworkMetricId(ISensor sensor)
    {
        return sensor.SensorType switch
        {
            SensorType.Throughput when sensor.Name.Equals("Download Speed", StringComparison.Ordinal) => "net.down",
            SensorType.Throughput when sensor.Name.Equals("Upload Speed", StringComparison.Ordinal) => "net.up",
            _ => null,
        };
    }

    private static string? GetStorageMetricId(ISensor sensor)
    {
        return sensor.SensorType switch
        {
            SensorType.Throughput when sensor.Name.Equals("Read Rate", StringComparison.Ordinal) => DiskReadThroughputMetricId,
            SensorType.Throughput when sensor.Name.Equals("Write Rate", StringComparison.Ordinal) => DiskWriteThroughputMetricId,
            _ => null,
        };
    }

    private static bool TryConvertValue(SensorType sensorType, double value, out double convertedValue)
    {
        convertedValue = sensorType switch
        {
            SensorType.Data => value * BytesPerGibibyte,
            _ => value,
        };

        return double.IsFinite(convertedValue);
    }

    private static bool IsValidMetricValue(string metricId, double value)
    {
        return metricId switch
        {
            "cpu.usage_percent" or "gpu.usage_percent" => value is >= 0 and <= 100,
            "gpu.temp" => value is > 0 and <= 130,
            "gpu.power" => value >= 0,
            "gpu.vram_used" or "ram.used" or RamAvailableMetricId => value >= 0,
            "gpu.vram_total" or RamTotalMetricId => value > 0,
            "net.down" or "net.up" or DiskReadThroughputMetricId or DiskWriteThroughputMetricId or DiskTotalThroughputMetricId => value >= 0,
            _ => throw new UnreachableException($"Missing validation rule for metric '{metricId}'."),
        };
    }

    private static string GetCanonicalMetricUnit(SensorType sensorType)
    {
        return sensorType switch
        {
            SensorType.Load => "%",
            SensorType.Temperature => "°C",
            SensorType.Data => "B",
            SensorType.Power => "W",
            SensorType.Throughput => "B/s",
            _ => "",
        };
    }
}
