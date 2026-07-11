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

        int metricCount = readResponse.Snapshot?.Metrics.Count ?? 0;
        int unavailableMetricCount = readResponse.UnavailableMetrics.Count;
        bool hasActiveDemand = requestHandler.HasActiveMetricRefreshDemand();

        if (!ShouldWarnSnapshotSlowOrStale(isSlow, isStale, metricCount, unavailableMetricCount, hasActiveDemand))
        {
            // Two quiet shapes land here. (1) An unfiltered diagnostic read
            // (empty request, used by the Control Panel): it returns the
            // global snapshot, which per-group demand refresh currently does
            // not republish, so its age says nothing about sampling health
            // even while widgets are active. (2) A concrete metric request
            // while nothing demands metrics: demand-driven refresh lets data
            // age on purpose when idle. Warning on either shape misled issue
            // #2 triage. The log line records the observed facts, not this
            // interpretation, so triage can still question it. Information
            // level on purpose: the production service logs at Information
            // minimum, and this line is the positive evidence ("helper alive,
            // read served") that triage needs from a user log. It cannot spam
            // an idle machine because it only runs when a read request
            // arrives, throttled to one line per interval.
            logger.AtInformation()
                .EveryBucket("grpc-read-snapshot-idle", UnaryLogThrottleInterval)
                .Log(context => ThrottledLogEntry.Create(
                    "gRPC ReadMetricSnapshot returned a stale snapshot with no metric readings. snapshotAgeMs={SnapshotAgeMs} unavailableMetricCount={UnavailableMetricCount} hasActiveDemand={HasActiveDemand} suppressedLogCount={SuppressedLogCount}",
                    snapshotAge?.TotalMilliseconds,
                    unavailableMetricCount,
                    hasActiveDemand,
                    context.SuppressedCount));
            return;
        }

        logger.AtWarning()
            .EveryBucket("grpc-read-snapshot-slow-or-stale", UnaryLogThrottleInterval)
            .Log(context => ThrottledLogEntry.Create(
                "gRPC ReadMetricSnapshot returned slow or stale data. durationMs={DurationMs} snapshotAgeMs={SnapshotAgeMs} metricCount={MetricCount} unavailableMetricCount={UnavailableMetricCount} warningCount={WarningCount} suppressedLogCount={SuppressedLogCount}",
                duration.TotalMilliseconds,
                snapshotAge?.TotalMilliseconds,
                metricCount,
                unavailableMetricCount,
                readResponse.Warnings.Count,
                context.SuppressedCount));
    }

    // Slowness is a real performance signal even on an empty snapshot, so a slow
    // read always warns. For staleness the response shape tells the story:
    //
    // - metricCount > 0: a consumer received stale readings; always a fault.
    // - metricCount == 0 with unavailable entries: only a non-empty request can
    //   produce this shape (MetricSnapshotCache fills every requested id into
    //   readings or unavailable reports), so a real metric request got nothing.
    //   Warn only while something actively demands metrics; without demand,
    //   demand-driven refresh lets data age on purpose (idle).
    // - metricCount == 0 with no unavailable entries: only the unfiltered
    //   diagnostic read (empty request) produces this shape, and it returns the
    //   global snapshot that per-group demand refresh currently does not
    //   republish. Its age says nothing about sampling health, with or without
    //   demand, so it stays quiet; warning on it produced false alarms whenever
    //   the Control Panel was opened while widgets were active.
    //
    // hasActiveDemand is deliberately "any demand", not matched to the requested
    // polling groups: the mapping lives in Core and the Hub only reads metrics
    // it also demands, so group matching would add cross-layer plumbing for no
    // observed case. Revisit if the global snapshot ever starts tracking
    // per-group refreshes or a reader starts requesting undemanded metrics.
    internal static bool ShouldWarnSnapshotSlowOrStale(
        bool isSlow,
        bool isStale,
        int metricCount,
        int unavailableMetricCount,
        bool hasActiveDemand)
    {
        if (isSlow)
        {
            return true;
        }

        if (!isStale)
        {
            return false;
        }

        if (metricCount > 0)
        {
            return true;
        }

        return unavailableMetricCount > 0 && hasActiveDemand;
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
