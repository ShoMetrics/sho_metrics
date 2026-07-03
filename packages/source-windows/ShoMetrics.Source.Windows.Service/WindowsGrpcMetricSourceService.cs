using System.Diagnostics;
using Grpc.Core;
using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Diagnostics;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class WindowsGrpcMetricSourceService(
    ISourceRequestHandler requestHandler,
    SourceMethodRateLimiter rateLimiter,
    ILogger<WindowsGrpcMetricSourceService> logger) : MetricSourceService.MetricSourceServiceBase
{
    private static readonly TimeSpan SlowUnaryDebugThreshold = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan SlowSnapshotWarningThreshold = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan StaleSnapshotWarningThreshold = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan UnaryLogThrottleInterval = TimeSpan.FromSeconds(30);

    public override Task<GetSourceHealthResponse> GetSourceHealth(
        GetSourceHealthRequest request,
        ServerCallContext context)
    {
        return HandleUnaryAsync(
            nameof(GetSourceHealth),
            context,
            cancellationToken => requestHandler.GetSourceHealthAsync(request, cancellationToken));
    }

    public override Task<ListMetricDescriptorsResponse> ListMetricDescriptors(
        ListMetricDescriptorsRequest request,
        ServerCallContext context)
    {
        return HandleUnaryAsync(
            nameof(ListMetricDescriptors),
            context,
            cancellationToken => requestHandler.ListMetricDescriptorsAsync(request, cancellationToken));
    }

    public override Task<ReadMetricSnapshotResponse> ReadMetricSnapshot(
        ReadMetricSnapshotRequest request,
        ServerCallContext context)
    {
        return HandleUnaryAsync(
            nameof(ReadMetricSnapshot),
            context,
            cancellationToken => requestHandler.ReadMetricSnapshotAsync(request, cancellationToken));
    }

    public override Task<SetMetricRefreshDemandResponse> SetMetricRefreshDemand(
        SetMetricRefreshDemandRequest request,
        ServerCallContext context)
    {
        return HandleUnaryAsync(
            nameof(SetMetricRefreshDemand),
            context,
            cancellationToken => requestHandler.SetMetricRefreshDemandAsync(request, cancellationToken));
    }

    private async Task<TResponse> HandleUnaryAsync<TResponse>(
        string methodName,
        ServerCallContext context,
        Func<CancellationToken, Task<TResponse>> operation)
    {
        long requestStartedTimestamp = Stopwatch.GetTimestamp();

        try
        {
            if (!rateLimiter.TryAcquire(methodName))
            {
                logger.AtWarning()
                    .EveryBucket($"grpc-rate-limit:{methodName}", UnaryLogThrottleInterval)
                    .Log(context => ThrottledLogEntry.Create(
                        "gRPC source request was rate limited. methodName={MethodName} suppressedLogCount={SuppressedLogCount}",
                        methodName,
                        context.SuppressedCount));

                throw new SourceRequestException(
                    SourceRequestFailureKind.ResourceExhausted,
                    "Source request rate limit exceeded.");
            }

            TResponse response = await operation(context.CancellationToken).ConfigureAwait(false);
            TimeSpan duration = Stopwatch.GetElapsedTime(requestStartedTimestamp);
            LogSlowUnaryCompleted(methodName, duration);
            LogSnapshotReadCompleted(methodName, response, duration);
            return response;
        }
        catch (SourceRequestException exception)
        {
            throw new RpcException(new Status(MapStatusCode(exception.FailureKind), exception.Message));
        }
        catch (OperationCanceledException) when (context.CancellationToken.IsCancellationRequested)
        {
            TimeSpan duration = Stopwatch.GetElapsedTime(requestStartedTimestamp);
            logger.AtDebug()
                .EveryBucket($"grpc-client-cancel:{methodName}", UnaryLogThrottleInterval)
                .Log(logContext => ThrottledLogEntry.Create(
                    "gRPC source request was cancelled by the client. methodName={MethodName} durationMs={DurationMs} suppressedLogCount={SuppressedLogCount}",
                    methodName,
                    duration.TotalMilliseconds,
                    logContext.SuppressedCount));

            throw new RpcException(new Status(StatusCode.Cancelled, "Request was cancelled."));
        }
        catch (RpcException)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(
                exception,
                "gRPC source request {MethodName} failed unexpectedly. durationMs={DurationMs}",
                methodName,
                Stopwatch.GetElapsedTime(requestStartedTimestamp).TotalMilliseconds);

            throw new RpcException(new Status(StatusCode.Internal, "Source request failed unexpectedly."));
        }
    }

    private void LogSlowUnaryCompleted(string methodName, TimeSpan duration)
    {
        if (duration < SlowUnaryDebugThreshold)
        {
            return;
        }

        logger.AtDebug()
            .EveryBucket($"grpc-unary-slow:{methodName}", UnaryLogThrottleInterval)
            .Log(context => ThrottledLogEntry.Create(
                "gRPC source request completed slowly. methodName={MethodName} durationMs={DurationMs} suppressedLogCount={SuppressedLogCount}",
                methodName,
                duration.TotalMilliseconds,
                context.SuppressedCount));
    }

    private void LogSnapshotReadCompleted<TResponse>(
        string methodName,
        TResponse response,
        TimeSpan duration)
    {
        if (methodName != nameof(ReadMetricSnapshot) || response is not ReadMetricSnapshotResponse readResponse)
        {
            return;
        }

        TimeSpan? snapshotAge = readResponse.Snapshot?.CapturedAt is { } capturedAt
            ? DateTimeOffset.UtcNow - new DateTimeOffset(capturedAt.ToDateTime())
            : null;

        bool isSlow = duration >= SlowSnapshotWarningThreshold;
        bool isStale = snapshotAge >= StaleSnapshotWarningThreshold;
        if (!isSlow && !isStale)
        {
            return;
        }

        logger.AtWarning()
            .EveryBucket("grpc-read-snapshot-slow-or-stale", UnaryLogThrottleInterval)
            .Log(context => ThrottledLogEntry.Create(
                "gRPC ReadMetricSnapshot returned slow or stale data. durationMs={DurationMs} snapshotAgeMs={SnapshotAgeMs} metricCount={MetricCount} unavailableMetricCount={UnavailableMetricCount} warningCount={WarningCount} suppressedLogCount={SuppressedLogCount}",
                duration.TotalMilliseconds,
                snapshotAge?.TotalMilliseconds,
                readResponse.Snapshot?.Metrics.Count ?? 0,
                readResponse.UnavailableMetrics.Count,
                readResponse.Warnings.Count,
                context.SuppressedCount));
    }

    private static StatusCode MapStatusCode(SourceRequestFailureKind failureKind)
    {
        return failureKind switch
        {
            SourceRequestFailureKind.InvalidArgument => StatusCode.InvalidArgument,
            SourceRequestFailureKind.FailedPrecondition => StatusCode.FailedPrecondition,
            SourceRequestFailureKind.ResourceExhausted => StatusCode.ResourceExhausted,
            SourceRequestFailureKind.SourceUnavailable => StatusCode.Unavailable,
            SourceRequestFailureKind.Timeout => StatusCode.DeadlineExceeded,
            _ => StatusCode.Internal,
        };
    }
}
