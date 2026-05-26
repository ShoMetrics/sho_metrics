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
