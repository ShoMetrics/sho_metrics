using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;
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

    public async Task<SourceIpcResponse> HandleAsync(SourceIpcRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return await DispatchAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (SourceRequestException exception) when (exception.FailureKind == SourceRequestFailureKind.Timeout)
        {
            logger.LogWarning(
                "Source IPC request {PayloadCase} with request id {RequestId} timed out.",
                request.PayloadCase,
                request.RequestId);

            return protocolMapper.BuildTimeoutResponse(request.RequestId);
        }
        catch (SourceRequestException exception) when (exception.FailureKind == SourceRequestFailureKind.SourceUnavailable)
        {
            logger.LogDebug(
                "Source IPC request {PayloadCase} with request id {RequestId} found the source unavailable.",
                request.PayloadCase,
                request.RequestId);

            return protocolMapper.BuildSourceUnavailableResponse(request.RequestId);
        }
        catch (Exception exception)
        {
            logger.LogError(
                exception,
                "Source IPC request {PayloadCase} with request id {RequestId} failed unexpectedly.",
                request.PayloadCase,
                request.RequestId);

            return protocolMapper.BuildInternalErrorResponse(request.RequestId);
        }
    }

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

    private async Task<SourceIpcResponse> DispatchAsync(
        SourceIpcRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return request.PayloadCase switch
        {
            SourceIpcRequest.PayloadOneofCase.GetSourceHealth => new SourceIpcResponse
            {
                RequestId = request.RequestId,
                GetSourceHealth = await GetSourceHealthAsync(
                    request.GetSourceHealth,
                    cancellationToken).ConfigureAwait(false),
            },
            SourceIpcRequest.PayloadOneofCase.ReadMetricSnapshot => new SourceIpcResponse
            {
                RequestId = request.RequestId,
                ReadMetricSnapshot = await ReadMetricSnapshotAsync(
                    request.ReadMetricSnapshot,
                    cancellationToken).ConfigureAwait(false),
            },
            SourceIpcRequest.PayloadOneofCase.ListMetricDescriptors => new SourceIpcResponse
            {
                RequestId = request.RequestId,
                ListMetricDescriptors = await ListMetricDescriptorsAsync(
                    request.ListMetricDescriptors,
                    cancellationToken).ConfigureAwait(false),
            },
            _ => BuildInvalidRequestResponse(request),
        };
    }

    private SourceIpcResponse BuildInvalidRequestResponse(SourceIpcRequest request)
    {
        logger.LogWarning(
            "Rejected unsupported or empty Source IPC request payload {PayloadCase} with request id {RequestId}. This may indicate helper/plugin protocol version skew.",
            request.PayloadCase,
            request.RequestId);

        return protocolMapper.BuildInvalidRequestResponse(request.RequestId);
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

        try
        {
            return await operation(operationCancellationTokenSource.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException) when (operationCancellationTokenSource.IsCancellationRequested)
        {
            logger.LogWarning(
                "Source request operation {OperationName} timed out after {Timeout}.",
                operationName,
                operationTimeout);

            throw new SourceRequestException(
                SourceRequestFailureKind.Timeout,
                $"Source request operation {operationName} exceeded the service timeout.");
        }
    }
}
