using System.Collections.Concurrent;

namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Owns the latest global and per-polling-group metric snapshots.
/// </summary>
/// <remarks>
/// This cache is a publication/read boundary only. It does not traverse hardware,
/// apply demand, or own refresh serialization. The session decides when data is
/// fresh enough to publish; callers read filtered snapshots from this cache.
/// </remarks>
internal sealed class MetricSnapshotCache
{
    private readonly IReadOnlyDictionary<string, string> _pollingGroupIdsByMetricId;
    private readonly ConcurrentDictionary<string, MetricSnapshot> _latestSnapshotsByPollingGroupId =
        new(StringComparer.Ordinal);
    private MetricSnapshot _latestSnapshot;

    public MetricSnapshotCache(
        IReadOnlyDictionary<string, string> pollingGroupIdsByMetricId,
        MetricSnapshot initialSnapshot)
    {
        _pollingGroupIdsByMetricId = pollingGroupIdsByMetricId;
        _latestSnapshot = initialSnapshot;
    }

    public MetricSnapshot Read(IReadOnlyCollection<string> metricIds)
    {
        HashSet<string>? requestedMetricIds = BuildRequestedMetricSet(metricIds);
        MetricSnapshot snapshot = ReadCachedSnapshot(metricIds, requestedMetricIds);

        return FilterSnapshot(snapshot, requestedMetricIds);
    }

    public MetricSnapshot ReadLatest()
    {
        return Volatile.Read(ref _latestSnapshot);
    }

    public MetricSnapshot ReadPollingGroup(string pollingGroupId)
    {
        if (_latestSnapshotsByPollingGroupId.TryGetValue(pollingGroupId, out MetricSnapshot? groupSnapshot))
        {
            return groupSnapshot;
        }

        return Volatile.Read(ref _latestSnapshot);
    }

    public void PublishLatest(MetricSnapshot snapshot)
    {
        Volatile.Write(ref _latestSnapshot, snapshot);
    }

    public void PublishAggregatePollingGroupSnapshots(
        Dictionary<string, MetricReading> readingsByMetricId,
        DateTimeOffset capturedAt)
    {
        // Aggregate groups are computed from the full traversal, but their
        // snapshots must not inherit unrelated hardware warnings. A GPU update
        // failure should not appear on a network throughput read.
        ReplaceFilteredPollingGroupSnapshot(
            LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId,
            readingsByMetricId,
            [],
            capturedAt);
        ReplaceFilteredPollingGroupSnapshot(
            WindowsSystemTotalDiskThroughputProvider.PollingGroupId,
            readingsByMetricId,
            [],
            capturedAt);
    }

    public void ReplaceFilteredPollingGroupSnapshot(
        string pollingGroupId,
        Dictionary<string, MetricReading> readingsByMetricId,
        IReadOnlyList<string> warnings,
        DateTimeOffset capturedAt,
        IReadOnlyList<MetricUnavailableReport>? unavailableReports = null)
    {
        // This is replace-not-merge. Call it only for a polling group fully
        // owned by the current refresh; publishing a partial group snapshot will
        // erase any previously cached metrics omitted from the candidate set.
        // Traversal-wide candidates are accepted, but only metrics declared in
        // this polling group can enter the replaced snapshot.
        List<MetricReading> readings = readingsByMetricId.Values
            .Where(reading => !LibreHardwareMetricCatalog.IsInternalMetricId(reading.MetricId)
                && IsMetricInPollingGroup(reading.MetricId, pollingGroupId))
            .ToList();
        List<MetricUnavailableReport> filteredUnavailableMetrics = unavailableReports?
            .Where(diagnostic => IsMetricInPollingGroup(diagnostic.MetricId, pollingGroupId))
            .ToList() ?? [];

        if (readings.Count == 0 && warnings.Count == 0 && filteredUnavailableMetrics.Count == 0)
        {
            return;
        }

        _latestSnapshotsByPollingGroupId[pollingGroupId] = new MetricSnapshot
        {
            CapturedAt = capturedAt,
            Readings = readings,
            UnavailableMetrics = filteredUnavailableMetrics,
            Warnings = warnings.ToList(),
        };
    }

    public static List<MetricReading> FilterReadings(
        Dictionary<string, MetricReading> readingsByMetricId,
        HashSet<string>? requestedMetricIds)
    {
        return readingsByMetricId.Values
            .Where(reading => !LibreHardwareMetricCatalog.IsInternalMetricId(reading.MetricId)
                && IsRequestedMetric(requestedMetricIds, reading.MetricId))
            .ToList();
    }

    public static List<MetricUnavailableReport> FilterUnavailableMetrics(
        Dictionary<string, MetricUnavailableReport> unavailableReportsByMetricId,
        HashSet<string>? requestedMetricIds)
    {
        return unavailableReportsByMetricId.Values
            .Where(diagnostic => IsRequestedMetric(requestedMetricIds, diagnostic.MetricId))
            .ToList();
    }

    private MetricSnapshot ReadCachedSnapshot(
        IReadOnlyCollection<string> metricIds,
        HashSet<string>? requestedMetricIds)
    {
        // Empty reads intentionally keep the full latest snapshot path. Only a
        // concrete metric request can prove that one polling group is still
        // warming up.
        if (metricIds.Count == 0)
        {
            return Volatile.Read(ref _latestSnapshot);
        }

        // Unknown metrics and multi-group reads keep the legacy latest-snapshot
        // behavior. A pending-refresh report is only valid when every requested
        // metric is known to belong to the same group.
        if (!TryResolveKnownSinglePollingGroupId(metricIds, out string pollingGroupId))
        {
            return Volatile.Read(ref _latestSnapshot);
        }

        if (_latestSnapshotsByPollingGroupId.TryGetValue(pollingGroupId, out MetricSnapshot? groupSnapshot))
        {
            return groupSnapshot;
        }

        // The metric ids are known and all belong to one group, but that group
        // has never published. This is startup/warmup, not "no sensor".
        return BuildPendingRefreshSnapshot(
            requestedMetricIds ?? [],
            Volatile.Read(ref _latestSnapshot));
    }

    private bool TryResolveKnownSinglePollingGroupId(
        IReadOnlyCollection<string> metricIds,
        out string pollingGroupId)
    {
        pollingGroupId = string.Empty;
        string? resolvedPollingGroupId = null;
        foreach (string metricId in metricIds)
        {
            if (!_pollingGroupIdsByMetricId.TryGetValue(metricId, out string? currentPollingGroupId))
            {
                return false;
            }

            if (resolvedPollingGroupId is null)
            {
                resolvedPollingGroupId = currentPollingGroupId;
                continue;
            }

            if (!resolvedPollingGroupId.Equals(currentPollingGroupId, StringComparison.Ordinal))
            {
                return false;
            }
        }

        if (resolvedPollingGroupId is null)
        {
            return false;
        }

        pollingGroupId = resolvedPollingGroupId;
        return true;
    }

    private bool IsMetricInPollingGroup(string metricId, string pollingGroupId)
    {
        return _pollingGroupIdsByMetricId.TryGetValue(metricId, out string? metricPollingGroupId)
            && metricPollingGroupId.Equals(pollingGroupId, StringComparison.Ordinal);
    }

    private static MetricSnapshot FilterSnapshot(
        MetricSnapshot snapshot,
        HashSet<string>? requestedMetricIds)
    {
        if (requestedMetricIds is null)
        {
            return snapshot;
        }

        return snapshot with
        {
            Readings = snapshot.Readings
                .Where(reading => requestedMetricIds.Contains(reading.MetricId))
                .ToList(),
            UnavailableMetrics = BuildFilteredUnavailableMetrics(snapshot, requestedMetricIds),
        };
    }

    private static List<MetricUnavailableReport> BuildFilteredUnavailableMetrics(
        MetricSnapshot snapshot,
        HashSet<string> requestedMetricIds)
    {
        HashSet<string> returnedMetricIds = new(
            snapshot.Readings.Select(reading => reading.MetricId),
            StringComparer.Ordinal);
        Dictionary<string, MetricUnavailableReport> diagnosticsByMetricId = snapshot.UnavailableMetrics
            .Where(diagnostic => requestedMetricIds.Contains(diagnostic.MetricId))
            .ToDictionary(diagnostic => diagnostic.MetricId, StringComparer.Ordinal);

        foreach (string requestedMetricId in requestedMetricIds)
        {
            if (returnedMetricIds.Contains(requestedMetricId)
                || diagnosticsByMetricId.ContainsKey(requestedMetricId))
            {
                continue;
            }

            diagnosticsByMetricId[requestedMetricId] = new MetricUnavailableReport
            {
                MetricId = requestedMetricId,
                Reason = MetricUnavailableReason.NoSensor,
            };
        }

        return diagnosticsByMetricId.Values.ToList();
    }

    private static MetricSnapshot BuildPendingRefreshSnapshot(
        HashSet<string> requestedMetricIds,
        MetricSnapshot latestSnapshot)
    {
        // Keep warning/capture metadata from the latest source snapshot, but do
        // not borrow readings from unrelated groups. That would collapse
        // pending warmup back into an apparent missing sensor.
        return new MetricSnapshot
        {
            CapturedAt = latestSnapshot.CapturedAt,
            Readings = [],
            UnavailableMetrics = requestedMetricIds
                .Select(metricId => new MetricUnavailableReport
                {
                    MetricId = metricId,
                    Reason = MetricUnavailableReason.PendingRefresh,
                })
                .ToList(),
            Warnings = latestSnapshot.Warnings,
        };
    }

    private static HashSet<string>? BuildRequestedMetricSet(IReadOnlyCollection<string> metricIds)
    {
        return metricIds.Count == 0 ? null : new HashSet<string>(metricIds, StringComparer.Ordinal);
    }

    private static bool IsRequestedMetric(HashSet<string>? requestedMetricIds, string metricId)
    {
        return requestedMetricIds is null || requestedMetricIds.Contains(metricId);
    }
}
