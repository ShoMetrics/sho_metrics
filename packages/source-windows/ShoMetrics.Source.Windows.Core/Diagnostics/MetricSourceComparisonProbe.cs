using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text.Json;
using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Runs the Windows-side diagnostic probe used by the Hub's source comparison script.
/// </summary>
/// <remarks>
/// This is not a production metric source. It emits newline-delimited JSON so
/// `packages/hub/scripts/diagnostics/metric-source-comparison.mjs` can compare
/// OS-native aggregate counters against LibreHardwareMonitor DLL traversal in
/// the same measurement window. Keep it in source control because Phase 6
/// network/disk routing changes must be validated with the same workload shape.
/// </remarks>
public static partial class MetricSourceComparisonProbe
{
    private static readonly TimeSpan DefaultProbeDuration = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan DefaultProbeInterval = TimeSpan.FromSeconds(1);

    private const string DurationOptionName = "--duration-ms";
    private const string IntervalOptionName = "--interval-ms";
    private const string ProbeSourcesOptionName = "--probe-sources";
    private const string NativeProbeSourceName = "native";
    private const string LhmDllProbeSourceName = "lhm-dll";
    private const string LhmStorageWarning =
        "LHM storage probing is enabled for diagnostics and may wake or disturb disks.";

    /// <summary>
    /// Runs the probe with CLI-style arguments and writes NDJSON events to stdout.
    /// </summary>
    public static async Task<int> RunAsync(IReadOnlyList<string> args)
    {
        ProbeOptions options = ReadOptions(args);
        Computer? computer = options.ShouldReadLhmDll ? LibreHardwareComputerFactory.CreateForDiagnosticProbe() : null;
        NativeSampler? nativeSampler = options.ShouldReadNative ? new NativeSampler() : null;
        DateTimeOffset startedAt = DateTimeOffset.UtcNow;
        Stopwatch stopwatch = Stopwatch.StartNew();
        TimeSpan nextSampleAt = TimeSpan.Zero;
        int sampleIndex = 0;

        try
        {
            computer?.Open();
            WriteJson(new
            {
                @event = "start",
                startedAt,
                durationMilliseconds = options.Duration.TotalMilliseconds,
                intervalMilliseconds = options.Interval.TotalMilliseconds,
                probeSources = options.ProbeSourceNames,
                lhmStorageWarning = options.ShouldReadLhmDll ? LhmStorageWarning : null,
            });

            while (stopwatch.Elapsed < options.Duration)
            {
                TimeSpan elapsed = stopwatch.Elapsed;

                // Native and LHM samples share one loop tick here. That is useful
                // for comparing value shape, but it is not independent validation.
                NativeSample? nativeSample = options.ShouldReadNative ? nativeSampler!.Read() : null;
                LhmDllSample? lhmDllSample = options.ShouldReadLhmDll ? ReadLhmDllSample(computer!) : null;

                WriteJson(new
                {
                    @event = "sample",
                    sampleIndex,
                    elapsedMilliseconds = Math.Round(elapsed.TotalMilliseconds),
                    lhmDll = lhmDllSample,
                    native = nativeSample,
                });

                sampleIndex++;
                nextSampleAt += options.Interval;
                TimeSpan delay = nextSampleAt - stopwatch.Elapsed;

                if (delay > TimeSpan.Zero)
                {
                    await Task.Delay(delay).ConfigureAwait(false);
                }
            }
        }
        finally
        {
            nativeSampler?.Dispose();
            computer?.Close();
        }

        WriteJson(new
        {
            @event = "summary",
            sampleCount = sampleIndex,
        });

        return 0;
    }

    private static ProbeOptions ReadOptions(IReadOnlyList<string> args)
    {
        TimeSpan duration = DefaultProbeDuration;
        TimeSpan interval = DefaultProbeInterval;
        bool shouldReadNative = true;
        bool shouldReadLhmDll = true;

        for (int argumentIndex = 0; argumentIndex < args.Count; argumentIndex++)
        {
            string argument = args[argumentIndex];

            if (TryReadTimeSpanOption(args, ref argumentIndex, DurationOptionName, out TimeSpan durationOption))
            {
                duration = durationOption;
                continue;
            }

            if (TryReadTimeSpanOption(args, ref argumentIndex, IntervalOptionName, out TimeSpan intervalOption))
            {
                interval = intervalOption;
                continue;
            }

            if (TryReadStringOption(args, ref argumentIndex, ProbeSourcesOptionName, out string? probeSourcesOption))
            {
                if (string.IsNullOrWhiteSpace(probeSourcesOption))
                {
                    throw new ArgumentException($"{ProbeSourcesOptionName} must not be empty.", nameof(args));
                }

                (shouldReadNative, shouldReadLhmDll) = ReadProbeSources(probeSourcesOption);
                continue;
            }

            throw new ArgumentException($"Unknown metric source probe argument: {argument}", nameof(args));
        }

        return new ProbeOptions(duration, interval, shouldReadNative, shouldReadLhmDll);
    }

    private static (bool ShouldReadNative, bool ShouldReadLhmDll) ReadProbeSources(string probeSources)
    {
        string[] sourceNames = probeSources
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        bool shouldReadNative = sourceNames.Contains(NativeProbeSourceName, StringComparer.Ordinal);
        bool shouldReadLhmDll = sourceNames.Contains(LhmDllProbeSourceName, StringComparer.Ordinal);

        if (!shouldReadNative && !shouldReadLhmDll)
        {
            throw new ArgumentException(
                $"{ProbeSourcesOptionName} must include {NativeProbeSourceName}, {LhmDllProbeSourceName}, or both.",
                nameof(probeSources));
        }

        foreach (string sourceName in sourceNames)
        {
            if (!sourceName.Equals(NativeProbeSourceName, StringComparison.Ordinal)
                && !sourceName.Equals(LhmDllProbeSourceName, StringComparison.Ordinal))
            {
                throw new ArgumentException($"Unknown metric source probe source: {sourceName}.", nameof(probeSources));
            }
        }

        return (shouldReadNative, shouldReadLhmDll);
    }

    private static bool TryReadStringOption(
        IReadOnlyList<string> args,
        ref int argumentIndex,
        string optionName,
        out string? value)
    {
        string argument = args[argumentIndex];

        if (argument.Equals(optionName, StringComparison.Ordinal))
        {
            if (argumentIndex + 1 >= args.Count)
            {
                throw new ArgumentException($"Missing value for {optionName}.", nameof(args));
            }

            argumentIndex++;
            value = args[argumentIndex];
            return true;
        }

        if (argument.StartsWith(optionName + "=", StringComparison.Ordinal))
        {
            value = argument[(optionName.Length + 1)..];
            return true;
        }

        value = null;
        return false;
    }

    private static bool TryReadTimeSpanOption(
        IReadOnlyList<string> args,
        ref int argumentIndex,
        string optionName,
        out TimeSpan value)
    {
        string argument = args[argumentIndex];
        string? rawValue = null;

        if (argument.Equals(optionName, StringComparison.Ordinal))
        {
            if (argumentIndex + 1 >= args.Count)
            {
                throw new ArgumentException($"Missing value for {optionName}.", nameof(args));
            }

            argumentIndex++;
            rawValue = args[argumentIndex];
        }
        else if (argument.StartsWith(optionName + "=", StringComparison.Ordinal))
        {
            rawValue = argument[(optionName.Length + 1)..];
        }

        if (rawValue is null)
        {
            value = default;
            return false;
        }

        if (!int.TryParse(rawValue, out int milliseconds) || milliseconds <= 0)
        {
            throw new ArgumentException($"{optionName} must be a positive integer millisecond value.", nameof(args));
        }

        value = TimeSpan.FromMilliseconds(milliseconds);
        return true;
    }

    private static LhmDllSample ReadLhmDllSample(Computer computer)
    {
        Stopwatch stopwatch = Stopwatch.StartNew();
        Dictionary<string, MetricReading> readingsByMetricId = new(StringComparer.Ordinal);
        List<HardwareUpdateSample> hardwareUpdates = [];
        double? cpuTemperatureCelsius = null;

        // The probe uses the same catalog mapping as the helper, but drives LHM
        // directly so we can measure traversal cost without IPC in the way.
        foreach (IHardware hardware in computer.Hardware)
        {
            ReadHardware(hardware, readingsByMetricId, hardwareUpdates, ref cpuTemperatureCelsius);
        }

        AddDerivedReadings(readingsByMetricId);

        return new LhmDllSample(
            Values: new ProbeMetricValues(
                CpuUsagePercent: ReadValue(readingsByMetricId, "cpu.usage_percent"),
                CpuTemperatureCelsius: cpuTemperatureCelsius,
                RamUsedBytes: ReadValue(readingsByMetricId, "ram.used"),
                RamTotalBytes: ReadValue(readingsByMetricId, LibreHardwareMetricCatalog.RamTotalMetricId),
                NetworkDownloadBytesPerSecond: ReadValue(readingsByMetricId, "net.down"),
                NetworkUploadBytesPerSecond: ReadValue(readingsByMetricId, "net.up"),
                DiskReadBytesPerSecond: ReadValue(readingsByMetricId, WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId),
                DiskWriteBytesPerSecond: ReadValue(readingsByMetricId, WindowsSystemTotalDiskThroughputProvider.WriteThroughputMetricId),
                GpuUsagePercent: ReadValue(readingsByMetricId, "gpu.usage_percent"),
                GpuTemperatureCelsius: ReadValue(readingsByMetricId, "gpu.temp"),
                GpuPowerWatts: ReadValue(readingsByMetricId, "gpu.power"),
                GpuVramUsedBytes: ReadValue(readingsByMetricId, "gpu.vram_used"),
                GpuVramTotalBytes: ReadValue(readingsByMetricId, "gpu.vram_total")),
            UpdateMilliseconds: Math.Round(stopwatch.Elapsed.TotalMilliseconds, 3),
            HardwareUpdates: hardwareUpdates,
            ErrorCount: hardwareUpdates.Count(update => update.Error is not null));
    }

    private static void ReadHardware(
        IHardware hardware,
        Dictionary<string, MetricReading> readingsByMetricId,
        List<HardwareUpdateSample> hardwareUpdates,
        ref double? cpuTemperatureCelsius)
    {
        Stopwatch updateStopwatch = Stopwatch.StartNew();
        string? updateError = null;

        try
        {
            hardware.Update();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            updateError = $"{exception.GetType().Name}: {exception.Message}";
        }

        int readingCountBefore = readingsByMetricId.Count;

        foreach (ISensor sensor in hardware.Sensors)
        {
            foreach (MetricReading reading in LibreHardwareMetricCatalog.CreateReadings(hardware, sensor))
            {
                AddReading(readingsByMetricId, reading);
            }

            if (TryCreateProbeStorageReading(hardware, sensor, out MetricReading? storageReading)
                && storageReading is not null)
            {
                AddReading(readingsByMetricId, storageReading);
            }

            if (hardware.HardwareType == HardwareType.Cpu
                && sensor.SensorType == SensorType.Temperature
                && sensor.Value is { } temperature
                && float.IsFinite(temperature)
                && temperature > 0)
            {
                cpuTemperatureCelsius = SelectCpuTemperature(cpuTemperatureCelsius, sensor, temperature);
            }
        }

        hardwareUpdates.Add(new HardwareUpdateSample(
            HardwareId: hardware.Identifier.ToString(),
            HardwareName: hardware.Name,
            HardwareType: hardware.HardwareType.ToString(),
            UpdateMilliseconds: Math.Round(updateStopwatch.Elapsed.TotalMilliseconds, 3),
            ReadingCount: readingsByMetricId.Count - readingCountBefore,
            Error: updateError));

        foreach (IHardware childHardware in hardware.SubHardware)
        {
            ReadHardware(childHardware, readingsByMetricId, hardwareUpdates, ref cpuTemperatureCelsius);
        }
    }

    private static double SelectCpuTemperature(double? currentValue, ISensor sensor, double candidateValue)
    {
        if (sensor.Name.Equals("CPU Package", StringComparison.Ordinal)
            || sensor.Name.Contains("Package", StringComparison.OrdinalIgnoreCase)
            || sensor.Name.Contains("Tctl", StringComparison.OrdinalIgnoreCase)
            || sensor.Name.Contains("Tdie", StringComparison.OrdinalIgnoreCase))
        {
            return candidateValue;
        }

        return currentValue ?? candidateValue;
    }

    private static bool TryCreateProbeStorageReading(
        IHardware hardware,
        ISensor sensor,
        out MetricReading? reading)
    {
        reading = null;

        if (hardware.HardwareType is not HardwareType.Storage
            || sensor.SensorType is not SensorType.Throughput
            || sensor.Value is not { } value
            || !float.IsFinite(value)
            || value < 0)
        {
            return false;
        }

        string? metricId = sensor.Name switch
        {
            "Read Rate" => WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId,
            "Write Rate" => WindowsSystemTotalDiskThroughputProvider.WriteThroughputMetricId,
            _ => null,
        };

        if (metricId is null)
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
            SourceSensorType = sensor.SensorType.ToString(),
            Value = value,
            Unit = MetricUnit.BytesPerSecond,
        };
        return true;
    }

    private static double? ReadValue(Dictionary<string, MetricReading> readingsByMetricId, string metricId)
    {
        return readingsByMetricId.TryGetValue(metricId, out MetricReading? reading) ? reading.Value : null;
    }

    private static void AddReading(Dictionary<string, MetricReading> readingsByMetricId, MetricReading reading)
    {
        if (!readingsByMetricId.TryGetValue(reading.MetricId, out MetricReading? existingReading))
        {
            readingsByMetricId.Add(reading.MetricId, reading);
            return;
        }

        if (LibreHardwareMetricCatalog.ShouldAggregateMetric(reading.MetricId)
            || IsProbeDiskThroughputMetric(reading.MetricId))
        {
            // This intentionally preserves the naive LHM aggregate shape for
            // diagnostics. Production network aggregation still needs adapter
            // filtering before it can become a routing default or fallback.
            readingsByMetricId[reading.MetricId] = existingReading with
            {
                Value = existingReading.Value + reading.Value,
            };
        }
    }

    private static bool IsProbeDiskThroughputMetric(string metricId)
    {
        return metricId is WindowsSystemTotalDiskThroughputProvider.ReadThroughputMetricId
            or WindowsSystemTotalDiskThroughputProvider.WriteThroughputMetricId;
    }

    private static void AddDerivedReadings(Dictionary<string, MetricReading> readingsByMetricId)
    {
        if (readingsByMetricId.TryGetValue("ram.used", out MetricReading? memoryUsed)
            && readingsByMetricId.TryGetValue(LibreHardwareMetricCatalog.RamAvailableMetricId, out MetricReading? memoryAvailable))
        {
            readingsByMetricId[LibreHardwareMetricCatalog.RamTotalMetricId] = memoryUsed with
            {
                MetricId = LibreHardwareMetricCatalog.RamTotalMetricId,
                SensorName = "Memory Total",
                Value = memoryUsed.Value + memoryAvailable.Value,
            };
        }

    }

    private static void WriteJson<T>(T value)
    {
        Console.Out.WriteLine(JsonSerializer.Serialize(value));
    }

    private sealed class NativeSampler : IDisposable
    {
        private readonly WindowsPdhSystemTotalDiskThroughputCounterReader _diskCounterReader = new();
        private CpuTimes? _previousCpuTimes;
        private NetworkCounterSample? _previousNetworkCounterSample;

        public NativeSample Read()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            (double? cpuUsagePercent, double cpuReadMilliseconds) = ReadCpuUsagePercent();
            (double? ramUsedBytes, double? ramTotalBytes, double ramReadMilliseconds) = ReadMemory();
            (double? networkDownloadBytesPerSecond, double? networkUploadBytesPerSecond, double networkReadMilliseconds) =
                ReadNetworkRates();
            (double? diskReadBytesPerSecond, double? diskWriteBytesPerSecond, double diskReadMilliseconds) =
                ReadDiskRates();

            return new NativeSample(
                Values: new ProbeMetricValues(
                    CpuUsagePercent: cpuUsagePercent,
                    CpuTemperatureCelsius: null,
                    RamUsedBytes: ramUsedBytes,
                    RamTotalBytes: ramTotalBytes,
                    NetworkDownloadBytesPerSecond: networkDownloadBytesPerSecond,
                    NetworkUploadBytesPerSecond: networkUploadBytesPerSecond,
                    DiskReadBytesPerSecond: diskReadBytesPerSecond,
                    DiskWriteBytesPerSecond: diskWriteBytesPerSecond,
                    GpuUsagePercent: null,
                    GpuTemperatureCelsius: null,
                    GpuPowerWatts: null,
                    GpuVramUsedBytes: null,
                    GpuVramTotalBytes: null),
                ReadMilliseconds: Math.Round(stopwatch.Elapsed.TotalMilliseconds, 3),
                CpuReadMilliseconds: Math.Round(cpuReadMilliseconds, 3),
                RamReadMilliseconds: Math.Round(ramReadMilliseconds, 3),
                NetworkReadMilliseconds: Math.Round(networkReadMilliseconds, 3),
                DiskReadMilliseconds: Math.Round(diskReadMilliseconds, 3));
        }

        public void Dispose()
        {
            _diskCounterReader.Dispose();
        }

        private (double? CpuUsagePercent, double ReadMilliseconds) ReadCpuUsagePercent()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            CpuTimes? currentCpuTimes = TryReadCpuTimes();
            double? cpuUsagePercent = _previousCpuTimes is null || currentCpuTimes is null
                ? null
                : CalculateCpuUsagePercent(_previousCpuTimes.Value, currentCpuTimes.Value);

            _previousCpuTimes = currentCpuTimes ?? _previousCpuTimes;

            return (cpuUsagePercent, stopwatch.Elapsed.TotalMilliseconds);
        }

        private static (double? RamUsedBytes, double? RamTotalBytes, double ReadMilliseconds) ReadMemory()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            MemoryStatusEx memoryStatus = new()
            {
                Length = (uint)Marshal.SizeOf<MemoryStatusEx>(),
            };

            if (!GlobalMemoryStatusEx(ref memoryStatus))
            {
                return (null, null, stopwatch.Elapsed.TotalMilliseconds);
            }

            double totalBytes = memoryStatus.TotalPhys;
            double usedBytes = memoryStatus.TotalPhys - memoryStatus.AvailPhys;

            return (usedBytes, totalBytes, stopwatch.Elapsed.TotalMilliseconds);
        }

        private (double? DownloadBytesPerSecond, double? UploadBytesPerSecond, double ReadMilliseconds) ReadNetworkRates()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            ulong receivedBytes = 0;
            ulong sentBytes = 0;

            // This simple aggregate is intentionally broad. The latency report
            // proved it can overcount on machines with virtual/filter adapters;
            // production code must add adapter filtering and revalidate values.
            foreach (NetworkInterface networkInterface in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (networkInterface.OperationalStatus != OperationalStatus.Up
                    || networkInterface.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                {
                    continue;
                }

                IPv4InterfaceStatistics statistics = networkInterface.GetIPv4Statistics();
                receivedBytes += checked((ulong)Math.Max(0, statistics.BytesReceived));
                sentBytes += checked((ulong)Math.Max(0, statistics.BytesSent));
            }

            DateTimeOffset capturedAt = DateTimeOffset.UtcNow;
            NetworkCounterSample currentSample = new(receivedBytes, sentBytes, capturedAt);
            NetworkCounterSample? previousSample = _previousNetworkCounterSample;
            _previousNetworkCounterSample = currentSample;

            if (previousSample is null)
            {
                return (null, null, stopwatch.Elapsed.TotalMilliseconds);
            }

            double elapsedSeconds = Math.Max(
                0.001,
                (capturedAt - previousSample.Value.CapturedAt).TotalSeconds);
            double downloadBytesPerSecond = CalculateCounterRate(
                previousSample.Value.ReceivedBytes,
                receivedBytes,
                elapsedSeconds);
            double uploadBytesPerSecond = CalculateCounterRate(
                previousSample.Value.SentBytes,
                sentBytes,
                elapsedSeconds);

            return (downloadBytesPerSecond, uploadBytesPerSecond, stopwatch.Elapsed.TotalMilliseconds);
        }

        private (double? ReadBytesPerSecond, double? WriteBytesPerSecond, double ReadMilliseconds) ReadDiskRates()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();

            return _diskCounterReader.TryRead(out WindowsSystemTotalDiskThroughputCounterSample sample)
                ? (sample.ReadBytesPerSecond, sample.WriteBytesPerSecond, stopwatch.Elapsed.TotalMilliseconds)
                : (null, null, stopwatch.Elapsed.TotalMilliseconds);
        }
    }

    private static CpuTimes? TryReadCpuTimes()
    {
        return GetSystemTimes(out FileTime idleTime, out FileTime kernelTime, out FileTime userTime)
            ? new CpuTimes(
                ToUInt64(idleTime),
                ToUInt64(kernelTime),
                ToUInt64(userTime))
            : null;
    }

    private static double CalculateCpuUsagePercent(CpuTimes previousCpuTimes, CpuTimes currentCpuTimes)
    {
        ulong idleDelta = currentCpuTimes.IdleTime - previousCpuTimes.IdleTime;
        ulong kernelDelta = currentCpuTimes.KernelTime - previousCpuTimes.KernelTime;
        ulong userDelta = currentCpuTimes.UserTime - previousCpuTimes.UserTime;
        ulong totalDelta = kernelDelta + userDelta;

        if (totalDelta == 0)
        {
            return 0;
        }

        return Math.Round((1d - (idleDelta / (double)totalDelta)) * 100d, 2);
    }

    private static ulong ToUInt64(FileTime fileTime)
    {
        return ((ulong)fileTime.HighDateTime << 32) | fileTime.LowDateTime;
    }

    private static double CalculateCounterRate(ulong previousValue, ulong currentValue, double elapsedSeconds)
    {
        if (currentValue < previousValue)
        {
            return 0;
        }

        return (currentValue - previousValue) / elapsedSeconds;
    }

    [DllImport("kernel32.dll", SetLastError = false)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSystemTimes(
        out FileTime idleTime,
        out FileTime kernelTime,
        out FileTime userTime);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx buffer);

    private sealed record LhmDllSample(
        ProbeMetricValues Values,
        double UpdateMilliseconds,
        IReadOnlyList<HardwareUpdateSample> HardwareUpdates,
        int ErrorCount);

    private sealed record HardwareUpdateSample(
        string HardwareId,
        string HardwareName,
        string HardwareType,
        double UpdateMilliseconds,
        int ReadingCount,
        string? Error);

    private sealed record NativeSample(
        ProbeMetricValues Values,
        double ReadMilliseconds,
        double CpuReadMilliseconds,
        double RamReadMilliseconds,
        double NetworkReadMilliseconds,
        double DiskReadMilliseconds);

    private sealed record ProbeOptions(
        TimeSpan Duration,
        TimeSpan Interval,
        bool ShouldReadNative,
        bool ShouldReadLhmDll)
    {
        public IReadOnlyList<string> ProbeSourceNames { get; } = BuildProbeSourceNames(
            ShouldReadNative,
            ShouldReadLhmDll);

        private static IReadOnlyList<string> BuildProbeSourceNames(bool shouldReadNative, bool shouldReadLhmDll)
        {
            List<string> sourceNames = [];

            if (shouldReadNative)
            {
                sourceNames.Add(NativeProbeSourceName);
            }

            if (shouldReadLhmDll)
            {
                sourceNames.Add(LhmDllProbeSourceName);
            }

            return sourceNames;
        }
    }

    private sealed record ProbeMetricValues(
        double? CpuUsagePercent,
        double? CpuTemperatureCelsius,
        double? RamUsedBytes,
        double? RamTotalBytes,
        double? NetworkDownloadBytesPerSecond,
        double? NetworkUploadBytesPerSecond,
        double? DiskReadBytesPerSecond,
        double? DiskWriteBytesPerSecond,
        double? GpuUsagePercent,
        double? GpuTemperatureCelsius,
        double? GpuPowerWatts,
        double? GpuVramUsedBytes,
        double? GpuVramTotalBytes);

    private readonly record struct CpuTimes(ulong IdleTime, ulong KernelTime, ulong UserTime);

    private readonly record struct NetworkCounterSample(
        ulong ReceivedBytes,
        ulong SentBytes,
        DateTimeOffset CapturedAt);

    private struct FileTime
    {
        public uint LowDateTime;

        public uint HighDateTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatusEx
    {
        public uint Length;

        public uint MemoryLoad;

        public ulong TotalPhys;

        public ulong AvailPhys;

        public ulong TotalPageFile;

        public ulong AvailPageFile;

        public ulong TotalVirtual;

        public ulong AvailVirtual;

        public ulong AvailExtendedVirtual;
    }

}
