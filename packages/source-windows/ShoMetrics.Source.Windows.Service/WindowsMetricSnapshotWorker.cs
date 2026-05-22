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
        long refreshStartedTimestamp = Stopwatch.GetTimestamp();

        try
        {
            await monitorSession.RefreshSnapshotAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "Windows metric snapshot refresh failed. durationMs={DurationMs}",
                Stopwatch.GetElapsedTime(refreshStartedTimestamp).TotalMilliseconds);
        }
    }
}
