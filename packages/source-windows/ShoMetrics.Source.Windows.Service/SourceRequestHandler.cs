using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class SourceRequestHandler(
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

    private Task<SourceIpcResponse> DispatchAsync(
        SourceIpcRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        SourceIpcResponse response = request.PayloadCase switch
        {
            SourceIpcRequest.PayloadOneofCase.GetSourceHealth =>
                protocolMapper.BuildHealthResponse(request.RequestId),
            SourceIpcRequest.PayloadOneofCase.ReadMetricSnapshot =>
                protocolMapper.BuildSourceUnavailableResponse(request.RequestId),
            SourceIpcRequest.PayloadOneofCase.ListMetricDescriptors =>
                protocolMapper.BuildSourceUnavailableResponse(request.RequestId),
            _ => protocolMapper.BuildInvalidRequestResponse(request.RequestId),
        };

        return Task.FromResult(response);
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
