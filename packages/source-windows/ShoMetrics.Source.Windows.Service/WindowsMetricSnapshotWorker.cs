using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ShoMetrics.Source.Windows.Core;
using ShoMetrics.Source.Windows.Diagnostics;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class WindowsMetricSnapshotWorker(
    LibreHardwareMonitorSession monitorSession,
    ILogger<WindowsMetricSnapshotWorker> logger) : BackgroundService
{
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan SlowRefreshWarningThreshold = TimeSpan.FromMilliseconds(750);
    private static readonly TimeSpan RefreshWarningThrottleInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan RefreshDebugSummaryInterval = TimeSpan.FromSeconds(30);
    private const int SummaryHardwareLimit = 3;
    private const int SummaryWarningLimit = 3;

    private readonly ThrottledLogger _log = new(logger);
    private long _refreshCount;
    private long _slowRefreshCount;
    private double _maxRefreshDurationMs;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "Starting Windows metric snapshot refresh worker. intervalMs={IntervalMs} debugLoggingEnabled={DebugLoggingEnabled}",
            RefreshInterval.TotalMilliseconds,
            logger.IsEnabled(LogLevel.Debug));
        LogInitializationWarnings();

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
        MetricSnapshotRefreshResult? result = null;

        try
        {
            result = await monitorSession.RefreshSnapshotWithDiagnosticsAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            TimeSpan duration = Stopwatch.GetElapsedTime(refreshStartedTimestamp);
            _log.AtWarning()
                .Every(RefreshWarningThrottleInterval)
                .Log(context => ThrottledLogEntry.Create(
                    "Windows metric snapshot refresh failed. durationMs={DurationMs} errorType={ErrorType} suppressedLogCount={SuppressedLogCount}",
                    duration.TotalMilliseconds,
                    exception.GetType().Name,
                    context.SuppressedCount));
            _log.AtDebug()
                .Every(RefreshWarningThrottleInterval)
                .Log(context => ThrottledLogEntry.Create(
                    exception,
                    "Windows metric snapshot refresh failure detail. durationMs={DurationMs} suppressedLogCount={SuppressedLogCount}",
                    duration.TotalMilliseconds,
                    context.SuppressedCount));
        }
        finally
        {
            if (result is not null)
            {
                LogRefreshCompleted(result, Stopwatch.GetElapsedTime(refreshStartedTimestamp));
            }
        }
    }

    private void LogRefreshCompleted(MetricSnapshotRefreshResult result, TimeSpan duration)
    {
        _refreshCount++;

        double durationMs = duration.TotalMilliseconds;
        if (durationMs > _maxRefreshDurationMs)
        {
            _maxRefreshDurationMs = durationMs;
        }

        if (duration >= SlowRefreshWarningThreshold)
        {
            _slowRefreshCount++;

            _log.AtWarning()
                .Every(RefreshWarningThrottleInterval)
                .Log(context => CreateSlowRefreshEntry(context, result, duration));
        }

        _log.AtDebug()
            .Every(RefreshDebugSummaryInterval)
            .Log(context => CreateRefreshSummaryEntry(context, result, duration));
    }

    private void LogInitializationWarnings()
    {
        if (monitorSession.InitializationWarnings.Count == 0)
        {
            return;
        }

        string warningCodes = string.Join(
            ',',
            monitorSession.InitializationWarnings
                .Select(warning => warning.Code)
                .Distinct(StringComparer.Ordinal));

        logger.LogWarning(
            "Windows metric source initialized with warnings. warningCount={WarningCount} warningCodes={WarningCodes}",
            monitorSession.InitializationWarnings.Count,
            warningCodes);

        if (!logger.IsEnabled(LogLevel.Debug))
        {
            return;
        }

        string warningDetails = string.Join(
            " | ",
            monitorSession.InitializationWarnings.Select(warning => $"{warning.Code}: {warning.Message}"));

        logger.LogDebug(
            "Windows metric source initialization warning details. warnings={Warnings}",
            warningDetails);
    }

    private ThrottledLogEntry CreateSlowRefreshEntry(
        ThrottledLogContext context,
        MetricSnapshotRefreshResult result,
        TimeSpan duration)
    {
        MetricSnapshotRefreshDiagnostics diagnostics = result.Diagnostics;

        return ThrottledLogEntry.Create(
            "Windows metric snapshot refresh was slow. durationMs={DurationMs} readings={ReadingCount} unavailableMetrics={UnavailableMetricCount} unavailableReasons={UnavailableReasons} warnings={WarningCount} hardwareUpdates={HardwareUpdateCount} failedHardwareUpdates={FailedHardwareUpdateCount} slowHardwareTypes={SlowHardwareTypes} suppressedLogCount={SuppressedLogCount}",
            duration.TotalMilliseconds,
            diagnostics.ReadingCount,
            diagnostics.UnavailableMetricCount,
            BuildUnavailableReasonSummary(result.Snapshot.UnavailableMetrics),
            diagnostics.WarningCount,
            diagnostics.HardwareUpdates.Count,
            CountFailedHardwareUpdates(diagnostics),
            BuildHardwareTypeSummary(diagnostics),
            context.SuppressedCount);
    }

    private ThrottledLogEntry CreateRefreshSummaryEntry(
        ThrottledLogContext context,
        MetricSnapshotRefreshResult result,
        TimeSpan latestDuration)
    {
        long refreshCount = _refreshCount;
        long slowRefreshCount = _slowRefreshCount;
        double maxRefreshDurationMs = _maxRefreshDurationMs;

        _refreshCount = 0;
        _slowRefreshCount = 0;
        _maxRefreshDurationMs = 0;

        return ThrottledLogEntry.Create(
            "Windows metric snapshot refresh debug summary. refreshes={RefreshCount} slowRefreshes={SlowRefreshCount} maxDurationMs={MaxDurationMs} latestDurationMs={LatestDurationMs} readings={ReadingCount} unavailableMetrics={UnavailableMetricCount} unavailableReasons={UnavailableReasons} warnings={WarningCount} warningSamples={WarningSamples} hardwareUpdates={HardwareUpdateCount} failedHardwareUpdates={FailedHardwareUpdateCount} slowHardware={SlowHardware} suppressedLogCount={SuppressedLogCount}",
            refreshCount,
            slowRefreshCount,
            maxRefreshDurationMs,
            latestDuration.TotalMilliseconds,
            result.Diagnostics.ReadingCount,
            result.Diagnostics.UnavailableMetricCount,
            BuildUnavailableReasonSummary(result.Snapshot.UnavailableMetrics),
            result.Diagnostics.WarningCount,
            BuildWarningSamples(result.Snapshot.Warnings),
            result.Diagnostics.HardwareUpdates.Count,
            CountFailedHardwareUpdates(result.Diagnostics),
            BuildDetailedHardwareSummary(result.Diagnostics),
            context.SuppressedCount);
    }

    private static int CountFailedHardwareUpdates(MetricSnapshotRefreshDiagnostics diagnostics)
    {
        return diagnostics.HardwareUpdates.Count(update => !update.UpdateSucceeded);
    }

    private static string BuildUnavailableReasonSummary(IReadOnlyList<MetricUnavailableReport> unavailableReports)
    {
        if (unavailableReports.Count == 0)
        {
            return "none";
        }

        return string.Join(
            ',',
            unavailableReports
                .GroupBy(report => report.Reason)
                .OrderBy(group => group.Key)
                .Select(group => $"{group.Key}:{group.Count()}"));
    }

    internal static string BuildHardwareTypeSummary(MetricSnapshotRefreshDiagnostics diagnostics)
    {
        if (!diagnostics.UsesLibreHardwareMonitor)
        {
            return "native-only";
        }

        if (diagnostics.HardwareUpdates.Count == 0)
        {
            return "none";
        }

        List<HardwareTypeRefreshSummary> summaries = diagnostics.HardwareUpdates
            .GroupBy(update => update.HardwareType, StringComparer.Ordinal)
            .Select(group => new HardwareTypeRefreshSummary(
                group.Key,
                group.Count(),
                group.Count(update => !update.UpdateSucceeded),
                group.Max(update => update.UpdateDuration.TotalMilliseconds)))
            .OrderByDescending(summary => summary.MaxDurationMs)
            .ThenBy(summary => summary.HardwareType, StringComparer.Ordinal)
            .Take(SummaryHardwareLimit)
            .ToList();

        return string.Join(
            "; ",
            summaries.Select(summary =>
                $"{summary.HardwareType}:count={summary.Count},maxMs={summary.MaxDurationMs:F0},failures={summary.FailureCount}"));
    }

    internal static string BuildDetailedHardwareSummary(MetricSnapshotRefreshDiagnostics diagnostics)
    {
        if (!diagnostics.UsesLibreHardwareMonitor)
        {
            return "native-only";
        }

        if (diagnostics.HardwareUpdates.Count == 0)
        {
            return "none";
        }

        return string.Join(
            "; ",
            diagnostics.HardwareUpdates
                .OrderByDescending(update => update.UpdateDuration)
                .ThenBy(update => update.HardwareType, StringComparer.Ordinal)
                .ThenBy(update => update.HardwareId, StringComparer.Ordinal)
                .Take(SummaryHardwareLimit)
                .Select(update =>
                    $"{update.HardwareType}:{update.HardwareName}({update.HardwareId}) updateMs={update.UpdateDuration.TotalMilliseconds:F0} sensors={update.SensorCount} subHardware={update.SubHardwareCount} succeeded={update.UpdateSucceeded} error={update.UpdateError ?? "none"}"));
    }

    private static string BuildWarningSamples(IReadOnlyList<string> warnings)
    {
        if (warnings.Count == 0)
        {
            return "none";
        }

        return string.Join(
            " | ",
            warnings
                .Distinct(StringComparer.Ordinal)
                .Take(SummaryWarningLimit));
    }

    private readonly record struct HardwareTypeRefreshSummary(
        string HardwareType,
        int Count,
        int FailureCount,
        double MaxDurationMs);
}
