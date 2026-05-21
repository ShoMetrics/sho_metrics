using System.Diagnostics;
using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;
using CoreDescriptorSnapshot = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptorSnapshot;
using CoreMetricReading = ShoMetrics.Source.Windows.Core.MetricReading;
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
    private const string CpuUsageMetricId = "cpu.usage_percent";

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
            _ => protocolMapper.BuildInvalidRequestResponse(request.RequestId),
        };
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

        long readStartedTimestamp = Stopwatch.GetTimestamp();
        CoreMetricSnapshot snapshot = await monitorSession
            .ReadSnapshotAsync(request.MetricIds, cancellationToken)
            .ConfigureAwait(false);
        // TODO: Remove this temporary per-request latency log after the
        // per-group helper cache is implemented and the new IPC profile is
        // captured.
        LogReadMetricSnapshotServed(requestId, request, snapshot, readStartedTimestamp);

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

    private void LogReadMetricSnapshotServed(
        string requestId,
        ReadMetricSnapshotRequest request,
        CoreMetricSnapshot snapshot,
        long readStartedTimestamp)
    {
        CoreMetricReading? cpuUsageReading = snapshot.Readings
            .FirstOrDefault(reading => reading.MetricId.Equals(CpuUsageMetricId, StringComparison.Ordinal));

        logger.LogDebug(
            "Windows source snapshot request served. requestId={RequestId} durationMs={DurationMs} capturedAgeMs={CapturedAgeMs} requestedMetricCount={RequestedMetricCount} requestedMetrics={RequestedMetrics} readingCount={ReadingCount} warningCount={WarningCount} includeDescriptors={IncludeDescriptors} cpuUsagePercent={CpuUsagePercent} cpuSensorId={CpuSensorId} cpuHardware={CpuHardware}",
            requestId,
            Stopwatch.GetElapsedTime(readStartedTimestamp).TotalMilliseconds,
            (DateTimeOffset.UtcNow - snapshot.CapturedAt).TotalMilliseconds,
            request.MetricIds.Count,
            string.Join(",", request.MetricIds),
            snapshot.Readings.Count,
            snapshot.Warnings.Count,
            request.IncludeDescriptors,
            cpuUsageReading?.Value,
            cpuUsageReading?.SensorId,
            cpuUsageReading?.HardwareName);
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
