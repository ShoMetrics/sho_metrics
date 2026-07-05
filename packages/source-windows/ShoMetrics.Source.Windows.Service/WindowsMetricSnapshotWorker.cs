using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ShoMetrics.Source.Windows.Core;
using ShoMetrics.Source.Windows.Diagnostics;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class WindowsMetricSnapshotWorker(
    LibreHardwareMonitorSession monitorSession,
    TimeProvider timeProvider,
    ILogger<WindowsMetricSnapshotWorker> logger) : BackgroundService
{
    private static readonly TimeSpan MaximumDemandCheckDelay = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan MinimumDemandCheckDelay = TimeSpan.FromMilliseconds(1);
    private static readonly TimeSpan SlowRefreshWarningThreshold = TimeSpan.FromMilliseconds(750);
    private static readonly TimeSpan RefreshWarningThrottleInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan RefreshSummaryInterval = TimeSpan.FromSeconds(30);
    private const int SummaryHardwareLimit = 3;
    private const int SummaryWarningLimit = 3;
    private const int InitializationWarningSampleLimit = 3;
    private const string RefreshDurationMayIncludeSleepResumeNote = "duration may include suspended time after system sleep/resume";

    private readonly Dictionary<string, long> _lastRefreshTimestampsByPollingGroupId = new(StringComparer.Ordinal);
    private long _refreshCount;
    private long _slowRefreshCount;
    private long _coreGatewaySkipCount;
    private double _maxRefreshDurationMs;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "Starting Windows metric snapshot refresh worker. mode=demand-driven maxDemandCheckDelayMs={MaxDemandCheckDelayMs} refreshSummaryIntervalMs={RefreshSummaryIntervalMs}",
            MaximumDemandCheckDelay.TotalMilliseconds,
            RefreshSummaryInterval.TotalMilliseconds);
        LogDescriptorCatalogSummary();
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
        while (!stoppingToken.IsCancellationRequested)
        {
            IReadOnlyList<EffectiveMetricRefreshDemand> activeDemands = monitorSession.ReadMetricRefreshDemands();
            RemoveInactiveRefreshTimestamps(activeDemands);

            IReadOnlyList<EffectiveMetricRefreshDemand> dueDemands =
                ReadDueRefreshDemands(activeDemands, timeProvider.GetTimestamp());

            for (int index = 0; index < dueDemands.Count; index++)
            {
                RefreshAttemptResult refreshAttempt = await RefreshOnceAsync(dueDemands[index], stoppingToken)
                    .ConfigureAwait(false);

                if (index < dueDemands.Count - 1
                    && refreshAttempt.TraversedLibreHardwareMonitor
                    && refreshAttempt.Duration < MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval)
                {
                    await Task.Delay(
                            MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval - refreshAttempt.Duration,
                            timeProvider,
                            stoppingToken)
                        .ConfigureAwait(false);
                }
            }

            TimeSpan delay = ComputeNextDelay(activeDemands, timeProvider.GetTimestamp());
            await Task.Delay(delay, timeProvider, stoppingToken).ConfigureAwait(false);
        }
    }

    private async Task<RefreshAttemptResult> RefreshOnceAsync(
        EffectiveMetricRefreshDemand demand,
        CancellationToken stoppingToken)
    {
        long refreshStartedTimestamp = timeProvider.GetTimestamp();
        MetricSnapshotRefreshResult? result = null;
        bool shouldMarkRefresh = false;

        try
        {
            result = await monitorSession
                .RefreshPollingGroupWithDiagnosticsAsync(demand.PollingGroupId, stoppingToken)
                .ConfigureAwait(false);
            shouldMarkRefresh = !result.Diagnostics.SkippedByCoreGateway;
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            shouldMarkRefresh = true;
            TimeSpan duration = timeProvider.GetElapsedTime(refreshStartedTimestamp);
            logger.AtWarning()
                .Every(RefreshWarningThrottleInterval)
                .Log(context => ThrottledLogEntry.Create(
                    "Windows metric snapshot refresh failed. pollingGroupId={PollingGroupId} durationMs={DurationMs} errorType={ErrorType} errorMessage={ErrorMessage} note={DurationNote} suppressedLogCount={SuppressedLogCount}",
                    demand.PollingGroupId,
                    duration.TotalMilliseconds,
                    exception.GetType().Name,
                    exception.Message,
                    RefreshDurationMayIncludeSleepResumeNote,
                    context.SuppressedCount));
            logger.AtDebug()
                .Every(RefreshWarningThrottleInterval)
                .Log(context => ThrottledLogEntry.Create(
                    exception,
                    "Windows metric snapshot refresh failure detail. pollingGroupId={PollingGroupId} durationMs={DurationMs} note={DurationNote} suppressedLogCount={SuppressedLogCount}",
                    demand.PollingGroupId,
                    duration.TotalMilliseconds,
                    RefreshDurationMayIncludeSleepResumeNote,
                    context.SuppressedCount));
        }
        finally
        {
            if (shouldMarkRefresh)
            {
                _lastRefreshTimestampsByPollingGroupId[demand.PollingGroupId] = timeProvider.GetTimestamp();
            }

            if (result is not null)
            {
                LogRefreshCompleted(result, timeProvider.GetElapsedTime(refreshStartedTimestamp));
            }
        }

        TimeSpan totalDuration = timeProvider.GetElapsedTime(refreshStartedTimestamp);
        return new RefreshAttemptResult(
            result?.Diagnostics is { UsesLibreHardwareMonitor: true, SkippedByCoreGateway: false },
            totalDuration);
    }

    private IReadOnlyList<EffectiveMetricRefreshDemand> ReadDueRefreshDemands(
        IReadOnlyList<EffectiveMetricRefreshDemand> activeDemands,
        long currentTimestamp)
    {
        if (activeDemands.Count == 0)
        {
            return [];
        }

        List<EffectiveMetricRefreshDemand> dueDemands = [];

        foreach (EffectiveMetricRefreshDemand demand in activeDemands
            .OrderBy(demand => demand.PollingGroupId, StringComparer.Ordinal))
        {
            if (!_lastRefreshTimestampsByPollingGroupId.TryGetValue(
                    demand.PollingGroupId,
                    out long lastRefreshTimestamp)
                || timeProvider.GetElapsedTime(lastRefreshTimestamp, currentTimestamp) >= demand.RefreshInterval)
            {
                dueDemands.Add(demand);
            }
        }

        return dueDemands;
    }

    private TimeSpan ComputeNextDelay(
        IReadOnlyList<EffectiveMetricRefreshDemand> activeDemands,
        long currentTimestamp)
    {
        if (activeDemands.Count == 0)
        {
            return MaximumDemandCheckDelay;
        }

        TimeSpan minimumRemainingDelay = MaximumDemandCheckDelay;

        foreach (EffectiveMetricRefreshDemand demand in activeDemands)
        {
            if (!_lastRefreshTimestampsByPollingGroupId.TryGetValue(
                    demand.PollingGroupId,
                    out long lastRefreshTimestamp))
            {
                return MinimumDemandCheckDelay;
            }

            TimeSpan elapsed = timeProvider.GetElapsedTime(lastRefreshTimestamp, currentTimestamp);
            TimeSpan remainingDelay = demand.RefreshInterval - elapsed;

            if (remainingDelay <= TimeSpan.Zero)
            {
                return MinimumDemandCheckDelay;
            }

            if (remainingDelay < minimumRemainingDelay)
            {
                minimumRemainingDelay = remainingDelay;
            }
        }

        if (minimumRemainingDelay < MinimumDemandCheckDelay)
        {
            return MinimumDemandCheckDelay;
        }

        return minimumRemainingDelay > MaximumDemandCheckDelay
            ? MaximumDemandCheckDelay
            : minimumRemainingDelay;
    }

    private void RemoveInactiveRefreshTimestamps(IReadOnlyList<EffectiveMetricRefreshDemand> activeDemands)
    {
        HashSet<string> activePollingGroupIds = activeDemands
            .Select(demand => demand.PollingGroupId)
            .ToHashSet(StringComparer.Ordinal);

        foreach (string pollingGroupId in _lastRefreshTimestampsByPollingGroupId.Keys.ToList())
        {
            if (!activePollingGroupIds.Contains(pollingGroupId))
            {
                _lastRefreshTimestampsByPollingGroupId.Remove(pollingGroupId);
            }
        }
    }

    private void LogRefreshCompleted(MetricSnapshotRefreshResult result, TimeSpan duration)
    {
        _refreshCount++;

        if (result.Diagnostics.SkippedByCoreGateway)
        {
            _coreGatewaySkipCount++;

            logger.AtDebug()
                .Every(RefreshWarningThrottleInterval)
                .Log(context => ThrottledLogEntry.Create(
                    "Windows metric snapshot refresh skipped by Core LHM gateway. pollingGroupId={PollingGroupId} ageMs={AgeMs} minimumIntervalMs={MinimumIntervalMs} suppressedLogCount={SuppressedLogCount}",
                    result.Diagnostics.PollingGroupId ?? "all",
                    result.Diagnostics.CoreGatewayAge?.TotalMilliseconds,
                    MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval.TotalMilliseconds,
                    context.SuppressedCount));
        }

        double durationMs = duration.TotalMilliseconds;
        if (durationMs > _maxRefreshDurationMs)
        {
            _maxRefreshDurationMs = durationMs;
        }

        if (duration >= SlowRefreshWarningThreshold)
        {
            _slowRefreshCount++;

            logger.AtWarning()
                .Every(RefreshWarningThrottleInterval)
                .Log(context => CreateSlowRefreshEntry(context, result, duration));
        }

        logger.AtInformation()
            .Every(RefreshSummaryInterval)
            .Log(context => CreateRefreshSummaryEntry(context, result, duration));
    }

    private void LogDescriptorCatalogSummary()
    {
        HardwareMetricDescriptorSnapshot descriptorSnapshot = monitorSession.DescriptorSnapshot;

        // The descriptor catalog is built once at startup and never rebuilt, so a
        // hardware category that failed to enumerate then (for example motherboard
        // SuperIO voltage/fan sensors when the ring0 driver was not ready) stays
        // silently missing from the Property Inspector picker for the whole
        // process. Logging the per-hardware-type counts at startup turns that
        // otherwise invisible failure into a one-line diagnostic.
        logger.LogInformation(
            "Windows metric descriptor catalog built. descriptors={DescriptorCount} byHardwareType={DescriptorsByHardwareType} warnings={WarningCount}",
            descriptorSnapshot.Descriptors.Count,
            BuildDescriptorHardwareTypeSummary(descriptorSnapshot),
            descriptorSnapshot.Warnings.Count);

        // These preload warnings ("Hardware update failed for ...") are otherwise
        // only sent to the hub over gRPC, never written locally, so a startup
        // enumeration failure leaves no trace in the helper log. Surface them here.
        if (descriptorSnapshot.Warnings.Count == 0)
        {
            return;
        }

        logger.LogWarning(
            "Windows metric descriptor catalog built with warnings. warningCount={WarningCount} warningSamples={WarningSamples}",
            descriptorSnapshot.Warnings.Count,
            BuildWarningSamples(descriptorSnapshot.Warnings));
    }

    internal static string BuildDescriptorHardwareTypeSummary(HardwareMetricDescriptorSnapshot descriptorSnapshot)
    {
        if (descriptorSnapshot.Descriptors.Count == 0)
        {
            return "none";
        }

        return string.Join(
            ',',
            descriptorSnapshot.Descriptors
                .GroupBy(
                    descriptor => descriptor.HardwareType.Length == 0 ? "(native)" : descriptor.HardwareType,
                    StringComparer.Ordinal)
                .OrderBy(group => group.Key, StringComparer.Ordinal)
                .Select(group => $"{group.Key}:{group.Count()}"));
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
            "Windows metric source initialized with warnings. warningCount={WarningCount} warningCodes={WarningCodes} warningSamples={WarningSamples}",
            monitorSession.InitializationWarnings.Count,
            warningCodes,
            BuildInitializationWarningSamples(monitorSession.InitializationWarnings));

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
            "Windows metric snapshot refresh was slow. pollingGroupId={PollingGroupId} durationMs={DurationMs} readings={ReadingCount} unavailableMetrics={UnavailableMetricCount} unavailableReasons={UnavailableReasons} warnings={WarningCount} hardwareUpdates={HardwareUpdateCount} failedHardwareUpdates={FailedHardwareUpdateCount} slowHardwareTypes={SlowHardwareTypes} suppressedLogCount={SuppressedLogCount}",
            diagnostics.PollingGroupId ?? "all",
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
        long coreGatewaySkipCount = _coreGatewaySkipCount;
        double maxRefreshDurationMs = _maxRefreshDurationMs;

        _refreshCount = 0;
        _slowRefreshCount = 0;
        _coreGatewaySkipCount = 0;
        _maxRefreshDurationMs = 0;

        return ThrottledLogEntry.Create(
            "Windows metric snapshot refresh summary. refreshes={RefreshCount} slowRefreshes={SlowRefreshCount} coreGatewaySkips={CoreGatewaySkipCount} maxDurationMs={MaxDurationMs} latestDurationMs={LatestDurationMs} latestPollingGroupId={LatestPollingGroupId} readings={ReadingCount} unavailableMetrics={UnavailableMetricCount} unavailableReasons={UnavailableReasons} warnings={WarningCount} warningSamples={WarningSamples} hardwareUpdates={HardwareUpdateCount} failedHardwareUpdates={FailedHardwareUpdateCount} slowHardware={SlowHardware} note={DurationNote} suppressedLogCount={SuppressedLogCount}",
            refreshCount,
            slowRefreshCount,
            coreGatewaySkipCount,
            maxRefreshDurationMs,
            latestDuration.TotalMilliseconds,
            result.Diagnostics.PollingGroupId ?? "all",
            result.Diagnostics.ReadingCount,
            result.Diagnostics.UnavailableMetricCount,
            BuildUnavailableReasonSummary(result.Snapshot.UnavailableMetrics),
            result.Diagnostics.WarningCount,
            BuildWarningSamples(result.Snapshot.Warnings),
            result.Diagnostics.HardwareUpdates.Count,
            CountFailedHardwareUpdates(result.Diagnostics),
            BuildDetailedHardwareSummary(result.Diagnostics),
            RefreshDurationMayIncludeSleepResumeNote,
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

    private static string BuildInitializationWarningSamples(IReadOnlyList<HardwareSourceWarning> warnings)
    {
        return string.Join(
            " | ",
            warnings
                .Select(warning => $"{warning.Code}: {warning.Message}")
                .Distinct(StringComparer.Ordinal)
                .Take(InitializationWarningSampleLimit));
    }

    private readonly record struct HardwareTypeRefreshSummary(
        string HardwareType,
        int Count,
        int FailureCount,
        double MaxDurationMs);

    private readonly record struct RefreshAttemptResult(
        bool TraversedLibreHardwareMonitor,
        TimeSpan Duration);
}
