using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class WindowsMetricSnapshotWorker(
    LibreHardwareMonitorSession monitorSession,
    ILogger<WindowsMetricSnapshotWorker> logger) : BackgroundService
{
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(1);
    private const string CpuUsageMetricId = "cpu.usage_percent";

    private long _refreshIndex;
    private DateTimeOffset? _previousRefreshStartedAt;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Starting Windows metric snapshot refresh worker.");

        try
        {
            await RefreshUntilStoppedAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            logger.LogInformation("Stopping Windows metric snapshot refresh worker.");
        }
    }

    private async Task RefreshUntilStoppedAsync(CancellationToken stoppingToken)
    {
        await RefreshOnceAsync(stoppingToken).ConfigureAwait(false);

        using PeriodicTimer timer = new(RefreshInterval);

        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            await RefreshOnceAsync(stoppingToken).ConfigureAwait(false);
        }
    }

    private async Task RefreshOnceAsync(CancellationToken stoppingToken)
    {
        DateTimeOffset refreshStartedAt = DateTimeOffset.UtcNow;
        TimeSpan? refreshStartGap = _previousRefreshStartedAt is null
            ? null
            : refreshStartedAt - _previousRefreshStartedAt.Value;
        long refreshIndex = _refreshIndex++;
        long refreshStartedTimestamp = Stopwatch.GetTimestamp();
        _previousRefreshStartedAt = refreshStartedAt;

        try
        {
            MetricSnapshot snapshot = await monitorSession.RefreshSnapshotAsync(stoppingToken).ConfigureAwait(false);
            // TODO: Remove this temporary full-refresh timing log after the
            // helper publishes per-group cached values.
            LogRefreshCompleted(snapshot, refreshIndex, refreshStartedTimestamp, refreshStartGap);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "Windows metric snapshot refresh failed. refreshIndex={RefreshIndex} durationMs={DurationMs} startGapMs={StartGapMs}",
                refreshIndex,
                Stopwatch.GetElapsedTime(refreshStartedTimestamp).TotalMilliseconds,
                refreshStartGap?.TotalMilliseconds);
        }
    }

    private void LogRefreshCompleted(
        MetricSnapshot snapshot,
        long refreshIndex,
        long refreshStartedTimestamp,
        TimeSpan? refreshStartGap)
    {
        MetricReading? cpuUsageReading = snapshot.Readings
            .FirstOrDefault(reading => reading.MetricId.Equals(CpuUsageMetricId, StringComparison.Ordinal));

        logger.LogDebug(
            "Windows metric snapshot refresh completed. refreshIndex={RefreshIndex} durationMs={DurationMs} startGapMs={StartGapMs} capturedAgeMs={CapturedAgeMs} readingCount={ReadingCount} warningCount={WarningCount} cpuUsagePercent={CpuUsagePercent} cpuSensorId={CpuSensorId} cpuHardware={CpuHardware}",
            refreshIndex,
            Stopwatch.GetElapsedTime(refreshStartedTimestamp).TotalMilliseconds,
            refreshStartGap?.TotalMilliseconds,
            (DateTimeOffset.UtcNow - snapshot.CapturedAt).TotalMilliseconds,
            snapshot.Readings.Count,
            snapshot.Warnings.Count,
            cpuUsageReading?.Value,
            cpuUsageReading?.SensorId,
            cpuUsageReading?.HardwareName);
    }
}
