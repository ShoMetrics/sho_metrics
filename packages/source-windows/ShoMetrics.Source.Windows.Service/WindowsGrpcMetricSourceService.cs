using Grpc.Core;
using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class WindowsGrpcMetricSourceService(
    ISourceRequestHandler requestHandler,
    ILogger<WindowsGrpcMetricSourceService> logger) : MetricSourceService.MetricSourceServiceBase
{
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

    private async Task<TResponse> HandleUnaryAsync<TResponse>(
        string methodName,
        ServerCallContext context,
        Func<CancellationToken, Task<TResponse>> operation)
    {
        try
        {
            return await operation(context.CancellationToken).ConfigureAwait(false);
        }
        catch (SourceRequestException exception)
        {
            LogSourceRequestFailure(methodName, exception);

            throw new RpcException(new Status(MapStatusCode(exception.FailureKind), exception.Message));
        }
        catch (OperationCanceledException exception) when (context.CancellationToken.IsCancellationRequested)
        {
            logger.LogDebug(
                exception,
                "gRPC source request {MethodName} was cancelled by the client.",
                methodName);

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
                "gRPC source request {MethodName} failed unexpectedly.",
                methodName);

            throw new RpcException(new Status(StatusCode.Internal, "Source request failed unexpectedly."));
        }
    }

    private void LogSourceRequestFailure(string methodName, SourceRequestException exception)
    {
        switch (exception.FailureKind)
        {
            case SourceRequestFailureKind.SourceUnavailable:
                logger.LogDebug(
                    "gRPC source request {MethodName} found the source unavailable.",
                    methodName);
                break;
            case SourceRequestFailureKind.Timeout:
                logger.LogWarning(
                    exception,
                    "gRPC source request {MethodName} timed out.",
                    methodName);
                break;
            case SourceRequestFailureKind.InvalidArgument:
            case SourceRequestFailureKind.FailedPrecondition:
                logger.LogWarning(
                    exception,
                    "gRPC source request {MethodName} failed pre-dispatch validation.",
                    methodName);
                break;
            default:
                logger.LogError(
                    exception,
                    "gRPC source request {MethodName} failed with an unmapped request failure kind {FailureKind}.",
                    methodName,
                    exception.FailureKind);
                break;
        }
    }

    private static StatusCode MapStatusCode(SourceRequestFailureKind failureKind)
    {
        return failureKind switch
        {
            SourceRequestFailureKind.InvalidArgument => StatusCode.InvalidArgument,
            SourceRequestFailureKind.FailedPrecondition => StatusCode.FailedPrecondition,
            SourceRequestFailureKind.SourceUnavailable => StatusCode.Unavailable,
            SourceRequestFailureKind.Timeout => StatusCode.DeadlineExceeded,
            _ => StatusCode.Internal,
        };
    }
}
