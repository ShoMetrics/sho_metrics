using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Service;

internal interface ISourceRequestHandler
{
    Task<GetSourceHealthResponse> GetSourceHealthAsync(
        GetSourceHealthRequest request,
        CancellationToken cancellationToken);

    Task<ListMetricDescriptorsResponse> ListMetricDescriptorsAsync(
        ListMetricDescriptorsRequest request,
        CancellationToken cancellationToken);

    Task<ReadMetricSnapshotResponse> ReadMetricSnapshotAsync(
        ReadMetricSnapshotRequest request,
        CancellationToken cancellationToken);

    Task<SetMetricRefreshDemandResponse> SetMetricRefreshDemandAsync(
        SetMetricRefreshDemandRequest request,
        CancellationToken cancellationToken);

    /// <summary>
    /// Reports whether any metric refresh demand is currently active. Snapshot
    /// staleness logging uses this to separate a snapshot that aged because
    /// nothing asks for metrics (demand-driven refresh idles on purpose) from
    /// one that aged despite active demand.
    /// </summary>
    bool HasActiveMetricRefreshDemand();
}
