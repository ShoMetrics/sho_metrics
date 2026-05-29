using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;
using ShoMetrics.Source.Windows.Diagnostics;
using CoreDescriptorSnapshot = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptorSnapshot;
using CoreMetricSnapshot = ShoMetrics.Source.Windows.Core.MetricSnapshot;

namespace ShoMetrics.Source.Windows.Service;

internal sealed partial class SourceRequestHandler(
    LibreHardwareMonitorSession monitorSession,
    SourceProtocolMapper protocolMapper,
    ILogger<SourceRequestHandler> logger,
    TimeProvider timeProvider) : ISourceRequestHandler
{
    private static readonly TimeSpan HealthTimeout = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ReadSnapshotTimeout = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan ListDescriptorsTimeout = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan SetRefreshDemandTimeout = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan SlowOperationDebugThreshold = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan OperationLogThrottleInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan MinimumDemandApplyInterval = TimeSpan.FromMilliseconds(250);

    private readonly MetricRefreshDemandChangeGate _demandChangeGate =
        new(timeProvider, MinimumDemandApplyInterval);

    public Task<GetSourceHealthResponse> GetSourceHealthAsync(
        GetSourceHealthRequest request,
        CancellationToken cancellationToken)
    {
        return HandleOperationAsync(
            nameof(GetSourceHealthAsync),
            HealthTimeout,
            _ => Task.FromResult(protocolMapper.BuildHealthResponse(monitorSession.InitializationWarnings)),
            cancellationToken);
    }

    public Task<ReadMetricSnapshotResponse> ReadMetricSnapshotAsync(
        ReadMetricSnapshotRequest request,
        CancellationToken cancellationToken)
    {
        return HandleOperationAsync(
            nameof(ReadMetricSnapshotAsync),
            ReadSnapshotTimeout,
            operationCancellationToken => ReadMetricSnapshotCoreAsync(request, operationCancellationToken),
            cancellationToken);
    }

    public Task<ListMetricDescriptorsResponse> ListMetricDescriptorsAsync(
        ListMetricDescriptorsRequest request,
        CancellationToken cancellationToken)
    {
        return HandleOperationAsync(
            nameof(ListMetricDescriptorsAsync),
            ListDescriptorsTimeout,
            operationCancellationToken => ListMetricDescriptorsCoreAsync(request, operationCancellationToken),
            cancellationToken);
    }

    public Task<SetMetricRefreshDemandResponse> SetMetricRefreshDemandAsync(
        SetMetricRefreshDemandRequest request,
        CancellationToken cancellationToken)
    {
        return HandleOperationAsync(
            nameof(SetMetricRefreshDemandAsync),
            SetRefreshDemandTimeout,
            _ => Task.FromResult(SetMetricRefreshDemandCore(request)),
            cancellationToken);
    }

    private async Task<ReadMetricSnapshotResponse> ReadMetricSnapshotCoreAsync(
        ReadMetricSnapshotRequest request,
        CancellationToken cancellationToken)
    {
        if (!monitorSession.IsAvailable)
        {
            throw new SourceRequestException(
                SourceRequestFailureKind.SourceUnavailable,
                "Windows source reader is unavailable.");
        }

        CoreMetricSnapshot snapshot = await monitorSession
            .ReadSnapshotAsync(request.MetricIds, cancellationToken)
            .ConfigureAwait(false);

        CoreDescriptorSnapshot? descriptorSnapshot = null;
        if (request.IncludeDescriptors)
        {
            descriptorSnapshot = await monitorSession
                .ListMetricDescriptorsAsync(request.MetricIds, cancellationToken)
                .ConfigureAwait(false);
        }

        return protocolMapper.BuildReadMetricSnapshotResponse(
            snapshot,
            request.MetricIds,
            descriptorSnapshot);
    }

    private async Task<ListMetricDescriptorsResponse> ListMetricDescriptorsCoreAsync(
        ListMetricDescriptorsRequest request,
        CancellationToken cancellationToken)
    {
        if (!monitorSession.IsAvailable)
        {
            throw new SourceRequestException(
                SourceRequestFailureKind.SourceUnavailable,
                "Windows source reader is unavailable.");
        }

        CoreDescriptorSnapshot descriptorSnapshot = await monitorSession
            .ListMetricDescriptorsAsync(request.MetricIds, cancellationToken)
            .ConfigureAwait(false);

        return protocolMapper.BuildListMetricDescriptorsResponse(
            descriptorSnapshot,
            request.MetricIds);
    }

    private SetMetricRefreshDemandResponse SetMetricRefreshDemandCore(SetMetricRefreshDemandRequest request)
    {
        IReadOnlyList<MetricRefreshDemand> demands =
            MetricRefreshDemandRequestValidator.ValidateAndMap(request);

        return _demandChangeGate.RunIfAccepted(demands, demandChangeStatus =>
        {
            MetricRefreshDemandApplyResult result = monitorSession.ApplyMetricRefreshDemand(demands);
            if (demandChangeStatus == MetricRefreshDemandChangeStatus.Changed)
            {
                logger.LogInformation(
                    "Metric refresh demand applied. requestedGroups={RequestedGroupCount} acceptedGroups={AcceptedGroupCount} ignoredGroups={IgnoredGroupCount} metricCount={MetricCount} groupKinds={GroupKinds} minimumIntervalMs={MinimumIntervalMs} ttlMs={TtlMs}",
                    demands.Count,
                    result.AcceptedGroupCount,
                    result.IgnoredGroupCount,
                    CountDemandMetrics(demands),
                    FormatDemandGroupKinds(demands),
                    result.EffectiveMinimumRefreshInterval.TotalMilliseconds,
                    result.DemandTtl.TotalMilliseconds);
            }

            return protocolMapper.BuildSetMetricRefreshDemandResponse(result);
        });
    }

    private async Task<TResponse> HandleOperationAsync<TResponse>(
        string operationName,
        TimeSpan operationTimeout,
        Func<CancellationToken, Task<TResponse>> operation,
        CancellationToken cancellationToken)
    {
        using CancellationTokenSource operationCancellationTokenSource =
            CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        operationCancellationTokenSource.CancelAfter(operationTimeout);
        long operationStartedTimestamp = Stopwatch.GetTimestamp();

        try
        {
            TResponse response = await operation(operationCancellationTokenSource.Token).ConfigureAwait(false);
            TimeSpan duration = Stopwatch.GetElapsedTime(operationStartedTimestamp);

            if (duration >= SlowOperationDebugThreshold)
            {
                logger.AtDebug()
                    .EveryBucket($"source-operation-slow:{operationName}", OperationLogThrottleInterval)
                    .Log(context => ThrottledLogEntry.Create(
                        "Source request operation completed slowly. operationName={OperationName} durationMs={DurationMs} timeoutMs={TimeoutMs} suppressedLogCount={SuppressedLogCount}",
                        operationName,
                        duration.TotalMilliseconds,
                        operationTimeout.TotalMilliseconds,
                        context.SuppressedCount));
            }

            return response;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (SourceRequestException exception)
        {
            LogSourceRequestFailure(
                operationName,
                exception,
                Stopwatch.GetElapsedTime(operationStartedTimestamp));
            throw;
        }
        catch (OperationCanceledException) when (operationCancellationTokenSource.IsCancellationRequested)
        {
            TimeSpan duration = Stopwatch.GetElapsedTime(operationStartedTimestamp);
            logger.AtWarning()
                .EveryBucket($"source-operation-timeout:{operationName}", OperationLogThrottleInterval)
                .Log(context => ThrottledLogEntry.Create(
                    "Source request operation timed out. operationName={OperationName} durationMs={DurationMs} timeoutMs={TimeoutMs} suppressedLogCount={SuppressedLogCount}",
                    operationName,
                    duration.TotalMilliseconds,
                    operationTimeout.TotalMilliseconds,
                    context.SuppressedCount));

            throw new SourceRequestException(
                SourceRequestFailureKind.Timeout,
                $"Source request operation {operationName} exceeded the service timeout.");
        }
    }

    private void LogSourceRequestFailure(
        string operationName,
        SourceRequestException exception,
        TimeSpan duration)
    {
        switch (exception.FailureKind)
        {
            case SourceRequestFailureKind.SourceUnavailable:
                logger.AtWarning()
                    .EveryBucket($"source-operation-unavailable:{operationName}", OperationLogThrottleInterval)
                    .Log(context => ThrottledLogEntry.Create(
                        "Source request operation found the source unavailable. operationName={OperationName} durationMs={DurationMs} failureMessage={FailureMessage} suppressedLogCount={SuppressedLogCount}",
                        operationName,
                        duration.TotalMilliseconds,
                        exception.Message,
                        context.SuppressedCount));
                break;
            case SourceRequestFailureKind.InvalidArgument:
            case SourceRequestFailureKind.FailedPrecondition:
            case SourceRequestFailureKind.ResourceExhausted:
                logger.AtWarning()
                    .EveryBucket($"source-operation-rejected:{operationName}:{exception.FailureKind}", OperationLogThrottleInterval)
                    .Log(context => ThrottledLogEntry.Create(
                        "Source request operation was rejected. operationName={OperationName} failureKind={FailureKind} durationMs={DurationMs} failureMessage={FailureMessage} suppressedLogCount={SuppressedLogCount}",
                        operationName,
                        exception.FailureKind,
                        duration.TotalMilliseconds,
                        exception.Message,
                        context.SuppressedCount));
                break;
            default:
                logger.AtError()
                    .EveryBucket($"source-operation-failure:{operationName}:{exception.FailureKind}", OperationLogThrottleInterval)
                    .Log(context => ThrottledLogEntry.Create(
                        exception,
                        "Source request operation failed with an unmapped request failure kind. operationName={OperationName} failureKind={FailureKind} durationMs={DurationMs} suppressedLogCount={SuppressedLogCount}",
                        operationName,
                        exception.FailureKind,
                        duration.TotalMilliseconds,
                        context.SuppressedCount));
                break;
        }
    }

    private static int CountDemandMetrics(IReadOnlyList<MetricRefreshDemand> demands)
    {
        int metricCount = 0;

        foreach (MetricRefreshDemand demand in demands)
        {
            metricCount += demand.MetricIds.Count;
        }

        return metricCount;
    }

    private static string FormatDemandGroupKinds(IReadOnlyList<MetricRefreshDemand> demands)
    {
        if (demands.Count == 0)
        {
            return "none";
        }

        Dictionary<string, int> countsByKind = new(StringComparer.Ordinal);

        foreach (MetricRefreshDemand demand in demands)
        {
            string groupKind = ClassifyDemandPollingGroupForLog(demand.PollingGroupId);
            countsByKind[groupKind] = countsByKind.TryGetValue(groupKind, out int count)
                ? count + 1
                : 1;
        }

        return string.Join(
            ",",
            countsByKind
                .OrderBy(item => item.Key, StringComparer.Ordinal)
                .Select(item => $"{item.Key}:{item.Value}"));
    }

    internal static string ClassifyDemandPollingGroupForLog(string pollingGroupId)
    {
        // Demand requests carry source-owned polling group ids, not descriptor
        // hardware types. This keeps demand-change logs useful without writing
        // hardware or sensor identity that could expose local machine details.
        // This is log-only; scheduling and security decisions must continue to
        // use the original helper-owned polling group id. Keep this in sync
        // with classifyRefreshDemandPollingGroupForLog in collector-group-supervisor.ts.
        string normalizedPollingGroupId = pollingGroupId.ToLowerInvariant();

        if (normalizedPollingGroupId.Equals("windows-native:aggregate:disk", StringComparison.Ordinal))
        {
            return "disk";
        }

        if (normalizedPollingGroupId.Equals("lhm:aggregate:network", StringComparison.Ordinal))
        {
            return "network";
        }

        Match match = LhmHardwarePollingGroupRegex().Match(normalizedPollingGroupId);
        return match.Success
            ? ClassifyLhmHardwareIdentifierRootForLog(match.Groups[1].Value)
            : "other";
    }

    private static string ClassifyLhmHardwareIdentifierRootForLog(string identifierRoot)
    {
        if (identifierRoot.StartsWith("gpu", StringComparison.Ordinal))
        {
            return "gpu";
        }

        return identifierRoot switch
        {
            "intelcpu" => "cpu",
            "amdcpu" => "cpu",
            "cpu" => "cpu",
            "ram" => "ram",
            "memory" => "ram",
            "nvme" => "storage",
            "ssd" => "storage",
            "hdd" => "storage",
            "storage" => "storage",
            "ata" => "storage",
            "nic" => "network",
            "network" => "network",
            "mainboard" => "motherboard",
            "motherboard" => "motherboard",
            "superio" => "motherboard",
            "lpc" => "motherboard",
            "cooler" => "cooler",
            "battery" => "battery",
            "psu" => "psu",
            "ec" => "embedded-controller",
            "embedded-controller" => "embedded-controller",
            "power-monitor" => "power-monitor",
            _ => "hardware",
        };
    }

    [GeneratedRegex("^lhm:hardware:/([^/]+)", RegexOptions.CultureInvariant)]
    private static partial Regex LhmHardwarePollingGroupRegex();
}
