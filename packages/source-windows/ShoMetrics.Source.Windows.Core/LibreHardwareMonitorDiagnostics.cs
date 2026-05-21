namespace ShoMetrics.Source.Windows.Core;

// TODO: Remove this temporary LHM latency diagnostic surface after the
// per-group helper cache replaces the full-snapshot publish barrier and the
// new latency profile has been captured.
public interface ILibreHardwareMonitorDiagnosticSink
{
    void RecordHardwareRefresh(LibreHardwareMonitorHardwareRefreshDiagnostic diagnostic);

    void RecordRefreshSummary(LibreHardwareMonitorRefreshSummary diagnostic);
}

public sealed record LibreHardwareMonitorHardwareRefreshDiagnostic
{
    public required long RefreshIndex { get; init; }

    public required int Depth { get; init; }

    public required string HardwareId { get; init; }

    public required string HardwareName { get; init; }

    public required string HardwareType { get; init; }

    public required double UpdateDurationMilliseconds { get; init; }

    public required double OwnReadDurationMilliseconds { get; init; }

    public required int SensorCount { get; init; }

    public required int SubHardwareCount { get; init; }

    public required int AddedReadingCount { get; init; }

    public required int AddedWarningCount { get; init; }

    public double? CpuUsagePercent { get; init; }

    public string? CpuSensorId { get; init; }

    public string? CpuSensorName { get; init; }

    public string? UpdateError { get; init; }
}

public sealed record LibreHardwareMonitorRefreshSummary
{
    public required long RefreshIndex { get; init; }

    public required double DurationMilliseconds { get; init; }

    public required double GateWaitMilliseconds { get; init; }

    public required int HardwareCount { get; init; }

    public required int SensorCount { get; init; }

    public required int ReadingCount { get; init; }

    public required int WarningCount { get; init; }

    public required DateTimeOffset CapturedAt { get; init; }

    public double? CpuUsagePercent { get; init; }

    public string? CpuSensorId { get; init; }

    public string? CpuSensorName { get; init; }

    public string? CpuHardwareName { get; init; }
}
