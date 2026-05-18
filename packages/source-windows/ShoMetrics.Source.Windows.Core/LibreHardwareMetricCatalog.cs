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

    private const string DynamicMetricIdPrefix = "lhm.sensor:";
    private const double BytesPerGibibyte = 1024d * 1024d * 1024d;
    private const double BytesPerMebibyte = 1024d * 1024d;
    private const double HertzPerMegahertz = 1000d * 1000d;
    private const double SecondsPerNanosecond = 1e-9d;
    private const double WattHoursPerMilliwattHour = 0.001d;
    private const double SiemensPerMicrosiemens = 0.000001d;

    public static bool IsSupportedHardwareType(HardwareType hardwareType)
    {
        return hardwareType is HardwareType.Motherboard
            or HardwareType.SuperIO
            or HardwareType.Cpu
            or HardwareType.GpuAmd
            or HardwareType.GpuIntel
            or HardwareType.GpuNvidia
            or HardwareType.Memory
            or HardwareType.Network
            or HardwareType.Storage
            or HardwareType.Cooler
            or HardwareType.EmbeddedController
            or HardwareType.Psu
            or HardwareType.Battery
            or HardwareType.PowerMonitor;
    }

    public static IReadOnlyList<MetricReading> CreateReadings(IHardware hardware, ISensor sensor)
    {
        if (sensor.Value is not { } value
            || !float.IsFinite(value)
            || !TryConvertValue(sensor.SensorType, value, out double convertedValue, out MetricUnit unit)
            || !IsValidSensorValue(sensor.SensorType, convertedValue))
        {
            return [];
        }

        List<MetricReading> readings = [];

        if (TryGetStableMetricId(hardware, sensor, out string? stableMetricId)
            && IsValidStableMetricValue(stableMetricId, convertedValue))
        {
            readings.Add(CreateReading(hardware, sensor, stableMetricId, convertedValue, unit));
        }

        readings.Add(CreateReading(
            hardware,
            sensor,
            BuildDynamicMetricId(sensor),
            convertedValue,
            unit));

        return readings;
    }

    public static IReadOnlyList<HardwareMetricDescriptor> CreateDescriptors(IHardware hardware, ISensor sensor)
    {
        if (!TryGetCanonicalMetricUnit(sensor.SensorType, out MetricUnit unit))
        {
            return [];
        }

        List<HardwareMetricDescriptor> descriptors = [];

        if (TryGetStableMetricId(hardware, sensor, out string? stableMetricId))
        {
            descriptors.Add(CreateDescriptor(
                hardware,
                sensor,
                stableMetricId,
                unit,
                MetricIdKind.StableAlias));
        }

        descriptors.Add(CreateDescriptor(
            hardware,
            sensor,
            BuildDynamicMetricId(sensor),
            unit,
            MetricIdKind.SourceSensor));

        return descriptors;
    }

    private static MetricReading CreateReading(
        IHardware hardware,
        ISensor sensor,
        string metricId,
        double value,
        MetricUnit unit)
    {
        return new MetricReading
        {
            MetricId = metricId,
            HardwareId = hardware.Identifier.ToString(),
            HardwareName = hardware.Name,
            HardwareType = hardware.HardwareType.ToString(),
            SensorId = sensor.Identifier.ToString(),
            SensorName = sensor.Name,
            SourceSensorType = sensor.SensorType.ToString(),
            Value = value,
            Unit = unit,
        };
    }

    private static HardwareMetricDescriptor CreateDescriptor(
        IHardware hardware,
        ISensor sensor,
        string metricId,
        MetricUnit unit,
        MetricIdKind metricIdKind)
    {
        return new HardwareMetricDescriptor
        {
            MetricId = metricId,
            SourceSensorId = sensor.Identifier.ToString(),
            HardwareId = hardware.Identifier.ToString(),
            HardwareName = hardware.Name,
            HardwareType = hardware.HardwareType.ToString(),
            SensorName = sensor.Name,
            SourceSensorType = sensor.SensorType.ToString(),
            ValueKind = MetricValueKind.Scalar,
            Unit = unit,
            MetricIdKind = metricIdKind,
        };
    }

    internal static string GetRawSensorUnit(SensorType sensorType)
    {
        return sensorType switch
        {
            SensorType.Voltage => "volts",
            SensorType.Current => "amperes",
            SensorType.Power => "watts",
            SensorType.Clock => "megahertz",
            SensorType.Temperature => "celsius",
            SensorType.Load => "percent",
            SensorType.Frequency => "hertz",
            SensorType.Fan => "rpm",
            SensorType.Flow => "liters_per_hour",
            SensorType.Control => "percent",
            SensorType.Level => "percent",
            SensorType.Factor => "unitless",
            SensorType.Data => "gibibytes",
            SensorType.SmallData => "mebibytes",
            SensorType.Throughput => "bytes_per_second",
            SensorType.TimeSpan => "seconds",
            SensorType.Timing => "nanoseconds",
            SensorType.Energy => "milliwatt_hours",
            SensorType.Noise => "decibels_a_weighted",
            SensorType.Conductivity => "microsiemens_per_centimeter",
            SensorType.Humidity => "percent",
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

    internal static bool HasCanonicalMetricUnit(SensorType sensorType)
    {
        return TryGetCanonicalMetricUnit(sensorType, out _);
    }

    private static bool TryGetStableMetricId(IHardware hardware, ISensor sensor, [NotNullWhen(true)] out string? metricId)
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

    private static string BuildDynamicMetricId(ISensor sensor)
    {
        return $"{DynamicMetricIdPrefix}{sensor.Identifier}";
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
            // LHM uses different names across GPU vendors for the same stable power alias.
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

    private static bool TryConvertValue(
        SensorType sensorType,
        double value,
        out double convertedValue,
        out MetricUnit unit)
    {
        unit = MetricUnit.Unspecified;
        convertedValue = 0;

        if (!TryGetCanonicalMetricUnit(sensorType, out unit))
        {
            return false;
        }

        convertedValue = sensorType switch
        {
            SensorType.Data => value * BytesPerGibibyte,
            SensorType.SmallData => value * BytesPerMebibyte,
            SensorType.Clock => value * HertzPerMegahertz,
            SensorType.Timing => value * SecondsPerNanosecond,
            SensorType.Energy => value * WattHoursPerMilliwattHour,
            SensorType.Conductivity => value * SiemensPerMicrosiemens,
            _ => value,
        };

        return double.IsFinite(convertedValue);
    }

    private static bool IsValidStableMetricValue(string metricId, double value)
    {
        return metricId switch
        {
            "cpu.usage_percent" or "gpu.usage_percent" => value is >= 0 and <= 100,
            "gpu.temp" => value > 0,
            "gpu.power" => value >= 0,
            "gpu.vram_used" or "ram.used" or RamAvailableMetricId => value >= 0,
            "gpu.vram_total" => value > 0,
            "net.down" or "net.up" or DiskReadThroughputMetricId or DiskWriteThroughputMetricId => value >= 0,
            _ => throw new UnreachableException($"Missing validation rule for metric '{metricId}'."),
        };
    }

    private static bool IsValidSensorValue(SensorType sensorType, double value)
    {
        return sensorType switch
        {
            SensorType.Load or SensorType.Control or SensorType.Level or SensorType.Humidity =>
                value is >= 0 and <= 100,
            SensorType.Temperature => value > 0,
            SensorType.Clock or SensorType.Frequency => value > 0,
            SensorType.Factor => double.IsFinite(value),
            // TODO: Revisit negative voltage/current/noise handling after the LHM upstream audit.
            SensorType.Voltage
                or SensorType.Current
                or SensorType.Power
                or SensorType.Fan
                or SensorType.Flow
                or SensorType.Data
                or SensorType.SmallData
                or SensorType.Throughput
                or SensorType.TimeSpan
                or SensorType.Timing
                or SensorType.Energy
                or SensorType.Noise
                or SensorType.Conductivity => value >= 0,
            _ => throw new UnreachableException($"Missing validation rule for sensor type '{sensorType}'."),
        };
    }

    private static bool TryGetCanonicalMetricUnit(SensorType sensorType, out MetricUnit unit)
    {
        unit = sensorType switch
        {
            SensorType.Voltage => MetricUnit.Volts,
            SensorType.Current => MetricUnit.Amperes,
            SensorType.Power => MetricUnit.Watts,
            SensorType.Clock => MetricUnit.Hertz,
            SensorType.Temperature => MetricUnit.Celsius,
            SensorType.Load => MetricUnit.Percent,
            SensorType.Frequency => MetricUnit.Hertz,
            SensorType.Fan => MetricUnit.RevolutionsPerMinute,
            SensorType.Flow => MetricUnit.LitersPerHour,
            SensorType.Control => MetricUnit.Percent,
            SensorType.Level => MetricUnit.Percent,
            SensorType.Factor => MetricUnit.Unitless,
            SensorType.Data => MetricUnit.Bytes,
            SensorType.SmallData => MetricUnit.Bytes,
            SensorType.Throughput => MetricUnit.BytesPerSecond,
            SensorType.TimeSpan => MetricUnit.Seconds,
            SensorType.Timing => MetricUnit.Seconds,
            SensorType.Energy => MetricUnit.WattHours,
            SensorType.Noise => MetricUnit.DecibelsAWeighted,
            SensorType.Conductivity => MetricUnit.SiemensPerCentimeter,
            SensorType.Humidity => MetricUnit.Percent,
            _ => MetricUnit.Unspecified,
        };

        return unit is not MetricUnit.Unspecified;
    }
}
