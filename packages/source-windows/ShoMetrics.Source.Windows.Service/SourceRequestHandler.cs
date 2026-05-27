using System.Diagnostics;
using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;
using ShoMetrics.Source.Windows.Diagnostics;
using CoreDescriptorSnapshot = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptorSnapshot;
using CoreMetricSnapshot = ShoMetrics.Source.Windows.Core.MetricSnapshot;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class SourceRequestHandler(
    LibreHardwareMonitorSession monitorSession,
    SourceProtocolMapper protocolMapper,
    ILogger<SourceRequestHandler> logger) : ISourceRequestHandler
{
    private static readonly TimeSpan HealthTimeout = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ReadSnapshotTimeout = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan ListDescriptorsTimeout = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan SlowOperationDebugThreshold = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan OperationLogThrottleInterval = TimeSpan.FromSeconds(30);

    private readonly ThrottledLogger _log = new(logger);

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
                _log.AtDebug()
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
            _log.AtWarning()
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
                _log.AtWarning()
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
                _log.AtWarning()
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
                _log.AtError()
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
}
