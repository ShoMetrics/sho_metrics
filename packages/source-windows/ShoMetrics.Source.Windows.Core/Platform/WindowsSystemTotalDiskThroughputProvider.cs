using System.Runtime.InteropServices;

namespace ShoMetrics.Source.Windows.Core;

internal sealed class WindowsSystemTotalDiskThroughputProvider : IDisposable
{
    internal const string ReadThroughputMetricId = "disk.throughput.read";
    internal const string WriteThroughputMetricId = "disk.throughput.write";
    internal const string PollingGroupId = "windows-native:aggregate:disk";

    private const string HardwareId = "windows-native:disk-total";
    private const string HardwareName = "Windows PhysicalDisk _Total";
    private const string HardwareType = "WindowsNativeSystemTotalDisk";
    private const string SourceSensorType = "Throughput";

    private readonly IWindowsSystemTotalDiskThroughputCounterReader _counterReader;

    public WindowsSystemTotalDiskThroughputProvider()
        : this(new WindowsPdhSystemTotalDiskThroughputCounterReader())
    {
    }

    internal WindowsSystemTotalDiskThroughputProvider(IWindowsSystemTotalDiskThroughputCounterReader counterReader)
    {
        _counterReader = counterReader;
    }

    public bool HasCounterBinding => _counterReader.HasCounterBinding;

    public IReadOnlyList<HardwareMetricDescriptor> CreateDescriptors()
    {
        if (!HasCounterBinding)
        {
            return [];
        }

        return
        [
            CreateDescriptor(ReadThroughputMetricId, "windows-native:disk-total:throughput:read", "Disk Read Bytes/sec"),
            CreateDescriptor(WriteThroughputMetricId, "windows-native:disk-total:throughput:write", "Disk Write Bytes/sec"),
        ];
    }

    public IReadOnlyList<MetricReading> Read()
    {
        if (!_counterReader.TryRead(out WindowsSystemTotalDiskThroughputCounterSample sample)
            || !IsValidThroughputValue(sample.ReadBytesPerSecond)
            || !IsValidThroughputValue(sample.WriteBytesPerSecond))
        {
            return [];
        }

        return
        [
            CreateReading(
                ReadThroughputMetricId,
                "windows-native:disk-total:throughput:read",
                "Disk Read Bytes/sec",
                sample.ReadBytesPerSecond),
            CreateReading(
                WriteThroughputMetricId,
                "windows-native:disk-total:throughput:write",
                "Disk Write Bytes/sec",
                sample.WriteBytesPerSecond),
        ];
    }

    public void Dispose()
    {
        _counterReader.Dispose();
    }

    private static HardwareMetricDescriptor CreateDescriptor(string metricId, string sourceSensorId, string sensorName)
    {
        return new HardwareMetricDescriptor
        {
            MetricId = metricId,
            SourceSensorId = sourceSensorId,
            PollingGroupId = PollingGroupId,
            HardwareId = HardwareId,
            HardwareName = HardwareName,
            HardwareType = HardwareType,
            SensorName = sensorName,
            SourceSensorType = SourceSensorType,
            ValueKind = MetricValueKind.Scalar,
            Unit = MetricUnit.BytesPerSecond,
            MetricIdKind = MetricIdKind.StableAlias,
        };
    }

    private static MetricReading CreateReading(string metricId, string sensorId, string sensorName, double value)
    {
        return new MetricReading
        {
            MetricId = metricId,
            HardwareId = HardwareId,
            HardwareName = HardwareName,
            HardwareType = HardwareType,
            SensorId = sensorId,
            SensorName = sensorName,
            SourceSensorType = SourceSensorType,
            Value = value,
            Unit = MetricUnit.BytesPerSecond,
        };
    }

    private static bool IsValidThroughputValue(double value)
    {
        return double.IsFinite(value) && value >= 0;
    }
}

// TODO: Split counter-reader implementations into separate files if a second
// native counter backend is added.
internal interface IWindowsSystemTotalDiskThroughputCounterReader : IDisposable
{
    bool HasCounterBinding { get; }

    bool TryRead(out WindowsSystemTotalDiskThroughputCounterSample sample);
}

internal readonly record struct WindowsSystemTotalDiskThroughputCounterSample(
    double ReadBytesPerSecond,
    double WriteBytesPerSecond);

internal sealed class WindowsPdhSystemTotalDiskThroughputCounterReader : IWindowsSystemTotalDiskThroughputCounterReader
{
    private const string TotalPhysicalDiskReadCounterPath = @"\PhysicalDisk(_Total)\Disk Read Bytes/sec";
    private const string TotalPhysicalDiskWriteCounterPath = @"\PhysicalDisk(_Total)\Disk Write Bytes/sec";
    private const uint PdhFmtDouble = 0x00000200;

    private nint _queryHandle;
    private nint _readCounterHandle;
    private nint _writeCounterHandle;

    public WindowsPdhSystemTotalDiskThroughputCounterReader()
    {
        if (PdhOpenQuery(null, nuint.Zero, out _queryHandle) != 0)
        {
            return;
        }

        if (PdhAddEnglishCounter(
                _queryHandle,
                TotalPhysicalDiskReadCounterPath,
                nuint.Zero,
                out _readCounterHandle) != 0
            || PdhAddEnglishCounter(
                _queryHandle,
                TotalPhysicalDiskWriteCounterPath,
                nuint.Zero,
                out _writeCounterHandle) != 0)
        {
            Dispose();
            return;
        }

        HasCounterBinding = PdhCollectQueryData(_queryHandle) == 0;
    }

    public bool HasCounterBinding { get; private set; }

    public bool TryRead(out WindowsSystemTotalDiskThroughputCounterSample sample)
    {
        sample = default;

        if (!HasCounterBinding || PdhCollectQueryData(_queryHandle) != 0)
        {
            return false;
        }

        if (!TryReadCounterValue(_readCounterHandle, out double readBytesPerSecond)
            || !TryReadCounterValue(_writeCounterHandle, out double writeBytesPerSecond))
        {
            return false;
        }

        sample = new WindowsSystemTotalDiskThroughputCounterSample(readBytesPerSecond, writeBytesPerSecond);
        return true;
    }

    public void Dispose()
    {
        if (_queryHandle != nint.Zero)
        {
            _ = PdhCloseQuery(_queryHandle);
            _queryHandle = nint.Zero;
        }

        HasCounterBinding = false;
    }

    private static bool TryReadCounterValue(nint counterHandle, out double value)
    {
        value = 0;

        if (PdhGetFormattedCounterValue(
                counterHandle,
                PdhFmtDouble,
                out _,
                out PdhFmtCounterValue counterValue) != 0
            || counterValue.CStatus != 0
            || !double.IsFinite(counterValue.DoubleValue))
        {
            return false;
        }

        value = Math.Max(0, counterValue.DoubleValue);
        return true;
    }

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    private static extern int PdhOpenQuery(string? dataSource, nuint userData, out nint queryHandle);

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    private static extern int PdhAddEnglishCounter(
        nint queryHandle,
        string fullCounterPath,
        nuint userData,
        out nint counterHandle);

    [DllImport("pdh.dll")]
    private static extern int PdhCollectQueryData(nint queryHandle);

    [DllImport("pdh.dll")]
    private static extern int PdhGetFormattedCounterValue(
        nint counterHandle,
        uint format,
        out uint type,
        out PdhFmtCounterValue value);

    [DllImport("pdh.dll")]
    private static extern int PdhCloseQuery(nint queryHandle);

    [StructLayout(LayoutKind.Sequential)]
    private struct PdhFmtCounterValue
    {
        public uint CStatus;

        public double DoubleValue;
    }
}
