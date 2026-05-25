using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;
using CoreDescriptorSnapshot = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptorSnapshot;
using CoreMetricSnapshot = ShoMetrics.Source.Windows.Core.MetricSnapshot;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class SourceRequestHandler(
    LibreHardwareMonitorSession monitorSession,
    SourceProtocolMapper protocolMapper,
    ILogger<SourceRequestHandler> logger)
{
    private static readonly TimeSpan HealthTimeout = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ReadSnapshotTimeout = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan ListDescriptorsTimeout = TimeSpan.FromSeconds(8);

    public async Task<SourceIpcResponse> HandleAsync(SourceIpcRequest request, CancellationToken cancellationToken)
    {
        TimeSpan operationTimeout = ResolveOperationTimeout(request.PayloadCase);

        using CancellationTokenSource operationCancellationTokenSource =
            CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        operationCancellationTokenSource.CancelAfter(operationTimeout);

        try
        {
            return await DispatchAsync(
                request,
                operationCancellationTokenSource.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException) when (operationCancellationTokenSource.IsCancellationRequested)
        {
            logger.LogWarning(
                "Source IPC request {PayloadCase} with request id {RequestId} timed out after {Timeout}.",
                request.PayloadCase,
                request.RequestId,
                operationTimeout);

            return protocolMapper.BuildTimeoutResponse(request.RequestId);
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

    private async Task<SourceIpcResponse> DispatchAsync(
        SourceIpcRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return request.PayloadCase switch
        {
            SourceIpcRequest.PayloadOneofCase.GetSourceHealth =>
                protocolMapper.BuildHealthResponse(request.RequestId, monitorSession.InitializationWarnings),
            SourceIpcRequest.PayloadOneofCase.ReadMetricSnapshot =>
                await HandleReadMetricSnapshotAsync(
                    request.RequestId,
                    request.ReadMetricSnapshot,
                    cancellationToken).ConfigureAwait(false),
            SourceIpcRequest.PayloadOneofCase.ListMetricDescriptors =>
                await HandleListMetricDescriptorsAsync(
                    request.RequestId,
                    request.ListMetricDescriptors,
                    cancellationToken).ConfigureAwait(false),
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

    private async Task<SourceIpcResponse> HandleReadMetricSnapshotAsync(
        string requestId,
        ReadMetricSnapshotRequest request,
        CancellationToken cancellationToken)
    {
        if (!monitorSession.IsAvailable)
        {
            return protocolMapper.BuildSourceUnavailableResponse(requestId);
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
            requestId,
            snapshot,
            request.MetricIds,
            descriptorSnapshot);
    }

    private async Task<SourceIpcResponse> HandleListMetricDescriptorsAsync(
        string requestId,
        ListMetricDescriptorsRequest request,
        CancellationToken cancellationToken)
    {
        if (!monitorSession.IsAvailable)
        {
            return protocolMapper.BuildSourceUnavailableResponse(requestId);
        }

        CoreDescriptorSnapshot descriptorSnapshot = await monitorSession
            .ListMetricDescriptorsAsync(request.MetricIds, cancellationToken)
            .ConfigureAwait(false);

        return protocolMapper.BuildListMetricDescriptorsResponse(
            requestId,
            descriptorSnapshot,
            request.MetricIds);
    }

    private static TimeSpan ResolveOperationTimeout(SourceIpcRequest.PayloadOneofCase payloadCase)
    {
        return payloadCase switch
        {
            SourceIpcRequest.PayloadOneofCase.GetSourceHealth => HealthTimeout,
            SourceIpcRequest.PayloadOneofCase.ReadMetricSnapshot => ReadSnapshotTimeout,
            SourceIpcRequest.PayloadOneofCase.ListMetricDescriptors => ListDescriptorsTimeout,
            _ => HealthTimeout,
        };
    }
}
