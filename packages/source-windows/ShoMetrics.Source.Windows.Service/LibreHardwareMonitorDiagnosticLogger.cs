using Microsoft.Extensions.Logging;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service;

// TODO: Remove this temporary LHM latency logger with
// ILibreHardwareMonitorDiagnosticSink after the per-group helper cache is
// implemented and measured.
internal sealed class LibreHardwareMonitorDiagnosticLogger(
    ILogger<LibreHardwareMonitorDiagnosticLogger> logger) : ILibreHardwareMonitorDiagnosticSink
{
    public void RecordHardwareRefresh(LibreHardwareMonitorHardwareRefreshDiagnostic diagnostic)
    {
        logger.LogDebug(
            "LHM hardware refresh completed. refreshIndex={RefreshIndex} depth={Depth} hardwareType={HardwareType} hardwareName={HardwareName} hardwareId={HardwareId} updateMs={UpdateMs} ownReadMs={OwnReadMs} sensorCount={SensorCount} subHardwareCount={SubHardwareCount} addedReadingCount={AddedReadingCount} addedWarningCount={AddedWarningCount} cpuUsagePercent={CpuUsagePercent} cpuSensorId={CpuSensorId} cpuSensorName={CpuSensorName} updateError={UpdateError}",
            diagnostic.RefreshIndex,
            diagnostic.Depth,
            diagnostic.HardwareType,
            diagnostic.HardwareName,
            diagnostic.HardwareId,
            diagnostic.UpdateDurationMilliseconds,
            diagnostic.OwnReadDurationMilliseconds,
            diagnostic.SensorCount,
            diagnostic.SubHardwareCount,
            diagnostic.AddedReadingCount,
            diagnostic.AddedWarningCount,
            diagnostic.CpuUsagePercent,
            diagnostic.CpuSensorId,
            diagnostic.CpuSensorName,
            diagnostic.UpdateError);
    }

    public void RecordRefreshSummary(LibreHardwareMonitorRefreshSummary diagnostic)
    {
        logger.LogDebug(
            "LHM refresh summary. refreshIndex={RefreshIndex} durationMs={DurationMs} gateWaitMs={GateWaitMs} capturedAgeMs={CapturedAgeMs} hardwareCount={HardwareCount} sensorCount={SensorCount} readingCount={ReadingCount} warningCount={WarningCount} cpuUsagePercent={CpuUsagePercent} cpuSensorId={CpuSensorId} cpuSensorName={CpuSensorName} cpuHardwareName={CpuHardwareName}",
            diagnostic.RefreshIndex,
            diagnostic.DurationMilliseconds,
            diagnostic.GateWaitMilliseconds,
            (DateTimeOffset.UtcNow - diagnostic.CapturedAt).TotalMilliseconds,
            diagnostic.HardwareCount,
            diagnostic.SensorCount,
            diagnostic.ReadingCount,
            diagnostic.WarningCount,
            diagnostic.CpuUsagePercent,
            diagnostic.CpuSensorId,
            diagnostic.CpuSensorName,
            diagnostic.CpuHardwareName);
    }
}
