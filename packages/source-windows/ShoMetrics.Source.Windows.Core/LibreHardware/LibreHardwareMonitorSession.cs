using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

public sealed class LibreHardwareMonitorSession : IDisposable
{
    private readonly Computer? _computer;
    // Disk throughput stays native even though this session uses LHM for other
    // sensors; enabling LHM storage traverses broader disk paths than
    // throughput. See the Windows disk throughput plan:
    // docs/development/runtime-sources/03-windows-helper/03-lhm-storage-reading-implementation-plan.md.
    private readonly WindowsSystemTotalDiskThroughputProvider _diskThroughputProvider;
    private readonly TimeProvider _timeProvider;
    private readonly IReadOnlyList<IHardware> _rootHardware = [];
    private readonly HardwareMetricDescriptorSnapshot _cachedDescriptorSnapshot;
    private readonly MetricRefreshTargetIndex _refreshTargetIndex;
    private readonly MetricRefreshDemandState _refreshDemandState;
    private readonly MetricSnapshotCache _snapshotCache;
    private readonly LibreHardwareSnapshotReader _snapshotReader;
    private readonly SemaphoreSlim _readGate = new(1, 1);
    private long _lastLhmRefreshTimestamp = -1;
    private bool _isDisposed;

    public LibreHardwareMonitorSession()
        : this(TimeProvider.System)
    {
    }

    public LibreHardwareMonitorSession(TimeProvider timeProvider)
    {
        ArgumentNullException.ThrowIfNull(timeProvider);

        _timeProvider = timeProvider;
        _snapshotReader = new LibreHardwareSnapshotReader(_timeProvider);
        _diskThroughputProvider = new WindowsSystemTotalDiskThroughputProvider();
        Computer computer = LibreHardwareComputerFactory.Create();
        List<HardwareSourceWarning> warnings = [];
        HardwareMetricDescriptorSnapshot? cachedDescriptorSnapshot = null;

        try
        {
            computer.Open();
            // LHM enables per-sensor history by default. ShoMetrics stores the
            // user-visible history in MetricStore, so the helper disables the
            // duplicate LHM buffer as soon as the catalog is opened.
            LibreHardwareMonitorSensorPolicy.DisableSensorHistoryForComputer(computer);
            _computer = computer;
            _rootHardware = computer.Hardware.ToList();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            warnings.Add(new HardwareSourceWarning
            {
                Code = "lhm_init_failed",
                Message = $"LibreHardwareMonitor initialization failed: {exception.Message}",
            });
            computer.Close();
        }

        if (_computer is not null)
        {
            try
            {
                cachedDescriptorSnapshot = HardwareMetricDescriptorSnapshotBuilder.Build(
                    _rootHardware,
                    _diskThroughputProvider,
                    CancellationToken.None);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                warnings.Add(new HardwareSourceWarning
                {
                    Code = "lhm_descriptor_preload_failed",
                    Message = $"LibreHardwareMonitor descriptor preload failed: {exception.Message}",
                });
            }
        }

        cachedDescriptorSnapshot ??= HardwareMetricDescriptorSnapshotBuilder.BuildNativeOnly(
            _diskThroughputProvider,
            warnings.Select(warning => warning.Message).ToList());
        InitializationWarnings = warnings;
        _cachedDescriptorSnapshot = cachedDescriptorSnapshot;
        IReadOnlyDictionary<string, string> pollingGroupIdsByMetricId = cachedDescriptorSnapshot.Descriptors.ToDictionary(
            descriptor => descriptor.MetricId,
            descriptor => descriptor.PollingGroupId,
            StringComparer.Ordinal);
        _refreshTargetIndex = MetricRefreshTargetIndex.Build(_rootHardware, cachedDescriptorSnapshot);
        _refreshDemandState = new MetricRefreshDemandState(
            HardwareMetricDescriptorSnapshotBuilder.ReadKnownPollingGroupIds(cachedDescriptorSnapshot));
        _snapshotCache = new MetricSnapshotCache(pollingGroupIdsByMetricId, BuildUnavailableSnapshot());
    }

    internal LibreHardwareMonitorSession(
        WindowsSystemTotalDiskThroughputProvider diskThroughputProvider,
        IReadOnlyList<HardwareSourceWarning>? initializationWarnings = null,
        TimeProvider? timeProvider = null)
    {
        _timeProvider = timeProvider ?? TimeProvider.System;
        _snapshotReader = new LibreHardwareSnapshotReader(_timeProvider);
        _diskThroughputProvider = diskThroughputProvider;
        InitializationWarnings = initializationWarnings ?? [];
        _cachedDescriptorSnapshot = HardwareMetricDescriptorSnapshotBuilder.BuildNativeOnly(
            _diskThroughputProvider,
            InitializationWarnings.Select(warning => warning.Message).ToList());
        IReadOnlyDictionary<string, string> pollingGroupIdsByMetricId = _cachedDescriptorSnapshot.Descriptors.ToDictionary(
            descriptor => descriptor.MetricId,
            descriptor => descriptor.PollingGroupId,
            StringComparer.Ordinal);
        _refreshTargetIndex = MetricRefreshTargetIndex.Build(_rootHardware, _cachedDescriptorSnapshot);
        _refreshDemandState = new MetricRefreshDemandState(
            HardwareMetricDescriptorSnapshotBuilder.ReadKnownPollingGroupIds(_cachedDescriptorSnapshot));
        _snapshotCache = new MetricSnapshotCache(pollingGroupIdsByMetricId, BuildUnavailableSnapshot());
    }

    internal LibreHardwareMonitorSession(
        IReadOnlyList<IHardware> rootHardware,
        WindowsSystemTotalDiskThroughputProvider diskThroughputProvider,
        TimeProvider? timeProvider = null,
        IReadOnlyList<HardwareSourceWarning>? initializationWarnings = null)
    {
        _timeProvider = timeProvider ?? TimeProvider.System;
        _snapshotReader = new LibreHardwareSnapshotReader(_timeProvider);
        _rootHardware = rootHardware;
        _diskThroughputProvider = diskThroughputProvider;
        InitializationWarnings = initializationWarnings ?? [];
        _cachedDescriptorSnapshot = HardwareMetricDescriptorSnapshotBuilder.Build(
            _rootHardware,
            _diskThroughputProvider,
            CancellationToken.None);
        IReadOnlyDictionary<string, string> pollingGroupIdsByMetricId = _cachedDescriptorSnapshot.Descriptors.ToDictionary(
            descriptor => descriptor.MetricId,
            descriptor => descriptor.PollingGroupId,
            StringComparer.Ordinal);
        _refreshTargetIndex = MetricRefreshTargetIndex.Build(_rootHardware, _cachedDescriptorSnapshot);
        _refreshDemandState = new MetricRefreshDemandState(
            HardwareMetricDescriptorSnapshotBuilder.ReadKnownPollingGroupIds(_cachedDescriptorSnapshot));
        _snapshotCache = new MetricSnapshotCache(pollingGroupIdsByMetricId, BuildUnavailableSnapshot());
    }

    public bool IsAvailable => _rootHardware.Count > 0 || _diskThroughputProvider.HasCounterBinding;

    public IReadOnlyList<HardwareSourceWarning> InitializationWarnings { get; }

    /// <summary>
    /// The immutable descriptor catalog built once at construction. Exposed so the
    /// Service host can log a startup summary: the catalog drives the Property
    /// Inspector picker, and because it is never rebuilt, a hardware category that
    /// failed to enumerate at startup (for example motherboard SuperIO sensors when
    /// the ring0 driver was not yet ready) stays missing for the whole process.
    /// </summary>
    public HardwareMetricDescriptorSnapshot DescriptorSnapshot => _cachedDescriptorSnapshot;

    /// <summary>
    /// Reads the latest cached metric snapshot, filtered to requested metric ids.
    /// </summary>
    /// <remarks>
    /// This method does not traverse LibreHardwareMonitor hardware. The helper
    /// background worker updates the cache through polling-group refreshes.
    /// The full-refresh API remains for one-shot helper diagnostics. When the
    /// requested ids all belong to one
    /// helper polling group, this reads that group's latest published values
    /// without waiting for unrelated groups. The method keeps the Async suffix
    /// because it is the async-shaped source contract even though cache reads
    /// usually complete synchronously.
    ///
    /// A service client can read before the background refresh loop completes
    /// its first pass. In that startup race, this returns the initial
    /// unavailable snapshot and the next background refresh replaces it.
    /// </remarks>
    public Task<MetricSnapshot> ReadSnapshotAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(_snapshotCache.Read(metricIds));
    }

    /// <summary>
    /// Refreshes the cached snapshot by traversing LibreHardwareMonitor once.
    /// </summary>
    public async Task<MetricSnapshot> RefreshSnapshotAsync(CancellationToken cancellationToken)
    {
        MetricSnapshotRefreshResult result = await RefreshSnapshotWithDiagnosticsAsync(cancellationToken)
            .ConfigureAwait(false);

        return result.Snapshot;
    }

    /// <summary>
    /// Refreshes the cached snapshot and returns transport-independent refresh diagnostics.
    /// </summary>
    public async Task<MetricSnapshotRefreshResult> RefreshSnapshotWithDiagnosticsAsync(CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        if (_rootHardware.Count == 0)
        {
            return RefreshNativeOnlySnapshot(pollingGroupId: null);
        }

        return await RefreshLibreHardwareMonitorTargetAsync(
            pollingGroupId: null,
            _rootHardware,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<MetricSnapshot> RefreshPollingGroupAsync(
        string pollingGroupId,
        CancellationToken cancellationToken)
    {
        MetricSnapshotRefreshResult result = await RefreshPollingGroupWithDiagnosticsAsync(
                pollingGroupId,
                cancellationToken)
            .ConfigureAwait(false);

        return result.Snapshot;
    }

    public async Task<MetricSnapshotRefreshResult> RefreshPollingGroupWithDiagnosticsAsync(
        string pollingGroupId,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        if (!_refreshTargetIndex.TryRead(pollingGroupId, out MetricRefreshTarget? refreshTarget))
        {
            MetricSnapshot snapshot = _snapshotCache.ReadPollingGroup(pollingGroupId);
            return BuildRefreshResult(
                snapshot,
                pollingGroupId,
                usesLibreHardwareMonitor: false,
                skippedByCoreGateway: false,
                coreGatewayAge: null,
                hardwareUpdates: []);
        }

        if (refreshTarget.Kind == MetricRefreshTargetKind.NativeDisk)
        {
            return RefreshNativeOnlySnapshot(pollingGroupId);
        }

        return await RefreshLibreHardwareMonitorTargetAsync(
            pollingGroupId,
            refreshTarget.Hardware,
            cancellationToken).ConfigureAwait(false);
    }

    private async Task<MetricSnapshotRefreshResult> RefreshLibreHardwareMonitorTargetAsync(
        string? pollingGroupId,
        IReadOnlyList<IHardware> hardwareTargets,
        CancellationToken cancellationToken)
    {
        await _readGate.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            ObjectDisposedException.ThrowIf(_isDisposed, this);

            long currentTimestamp = _timeProvider.GetTimestamp();
            TimeSpan coreGatewayAge = _lastLhmRefreshTimestamp < 0
                ? TimeSpan.MaxValue
                : _timeProvider.GetElapsedTime(_lastLhmRefreshTimestamp, currentTimestamp);

            // This is the final Core-owned guard before runtime IHardware.Update()
            // calls. Keep it inside _readGate so timestamp state cannot race and
            // future callers cannot hammer LHM by bypassing Service-level limits.
            if (coreGatewayAge < MetricRefreshDemandConstants.MinimumCoreLhmRefreshInterval)
            {
                MetricSnapshot cachedSnapshot = pollingGroupId is null
                    ? _snapshotCache.ReadLatest()
                    : _snapshotCache.ReadPollingGroup(pollingGroupId);

                return BuildRefreshResult(
                    cachedSnapshot,
                    pollingGroupId,
                    usesLibreHardwareMonitor: true,
                    skippedByCoreGateway: true,
                    coreGatewayAge,
                    hardwareUpdates: []);
            }

            _lastLhmRefreshTimestamp = currentTimestamp;

            LibreHardwareSnapshotReadResult readResult = _snapshotReader.Read(hardwareTargets, cancellationToken);

            foreach (MetricPollingGroupSnapshotPublication publication in readResult.PollingGroupSnapshotPublications)
            {
                _snapshotCache.ReplaceFilteredPollingGroupSnapshot(
                    publication.PollingGroupId,
                    publication.TraversalReadingsByMetricId,
                    publication.Warnings,
                    publication.CapturedAt,
                    publication.TraversalUnavailableReports);
            }

            if (pollingGroupId is null)
            {
                AddNativeDiskThroughputReadings(readResult.ReadingsByMetricId);
                _snapshotCache.PublishAggregatePollingGroupSnapshots(
                    readResult.ReadingsByMetricId,
                    readResult.CapturedAt);
            }
            else if (pollingGroupId.Equals(LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId, StringComparison.Ordinal))
            {
                _snapshotCache.ReplaceFilteredPollingGroupSnapshot(
                    LibreHardwareMetricCatalog.NetworkAggregatePollingGroupId,
                    readResult.ReadingsByMetricId,
                    [],
                    readResult.CapturedAt,
                    readResult.UnavailableReportsByMetricId.Values.ToList());
            }

            MetricSnapshot snapshot;

            if (pollingGroupId is null)
            {
                List<MetricReading> readings = MetricSnapshotCache.FilterReadings(
                    readResult.ReadingsByMetricId,
                    requestedMetricIds: null);
                List<MetricUnavailableReport> unavailableReports = MetricSnapshotCache.FilterUnavailableMetrics(
                    readResult.UnavailableReportsByMetricId,
                    requestedMetricIds: null);
                List<string> warnings = readResult.Warnings.ToList();
                AddMissingMetricWarnings(readings, warnings);

                snapshot = new MetricSnapshot
                {
                    CapturedAt = readResult.CapturedAt,
                    Readings = readings,
                    UnavailableMetrics = unavailableReports,
                    Warnings = warnings,
                };
            }
            else
            {
                snapshot = _snapshotCache.ReadPollingGroup(pollingGroupId);
            }

            if (pollingGroupId is null)
            {
                _snapshotCache.PublishLatest(snapshot);
            }

            return BuildRefreshResult(
                snapshot,
                pollingGroupId,
                usesLibreHardwareMonitor: true,
                skippedByCoreGateway: false,
                coreGatewayAge: null,
                hardwareUpdates: readResult.HardwareUpdates);
        }
        finally
        {
            _readGate.Release();
        }
    }

    public Task<HardwareMetricDescriptorSnapshot> ListMetricDescriptorsAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(HardwareMetricDescriptorSnapshotBuilder.Filter(_cachedDescriptorSnapshot, metricIds));
    }

    public MetricRefreshDemandApplyResult ApplyMetricRefreshDemand(IReadOnlyList<MetricRefreshDemand> demands)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        return _refreshDemandState.Apply(demands);
    }

    public IReadOnlyList<EffectiveMetricRefreshDemand> ReadMetricRefreshDemands()
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        return _refreshDemandState.Snapshot();
    }

    public void Dispose()
    {
        if (_isDisposed)
        {
            return;
        }

        _computer?.Close();
        _diskThroughputProvider.Dispose();
        _readGate.Dispose();
        _isDisposed = true;
    }

    private MetricSnapshotRefreshResult RefreshNativeOnlySnapshot(string? pollingGroupId)
    {
        DateTimeOffset capturedAt = DateTimeOffset.UtcNow;
        Dictionary<string, MetricReading> readingsByMetricId = new(StringComparer.Ordinal);

        AddNativeDiskThroughputReadings(readingsByMetricId);
        if (pollingGroupId is null)
        {
            _snapshotCache.PublishAggregatePollingGroupSnapshots(readingsByMetricId, capturedAt);
        }
        else
        {
            _snapshotCache.ReplaceFilteredPollingGroupSnapshot(
                pollingGroupId,
                readingsByMetricId,
                [],
                capturedAt);
        }

        MetricSnapshot snapshot = pollingGroupId is null
            ? new MetricSnapshot
            {
                CapturedAt = capturedAt,
                Readings = MetricSnapshotCache.FilterReadings(readingsByMetricId, requestedMetricIds: null),
                Warnings = InitializationWarnings.Select(warning => warning.Message).ToList(),
            }
            : _snapshotCache.ReadPollingGroup(pollingGroupId);

        if (pollingGroupId is null)
        {
            _snapshotCache.PublishLatest(snapshot);
        }

        return BuildRefreshResult(
            snapshot,
            pollingGroupId,
            usesLibreHardwareMonitor: false,
            skippedByCoreGateway: false,
            coreGatewayAge: null,
            hardwareUpdates: []);
    }

    private MetricSnapshot BuildUnavailableSnapshot()
    {
        return new MetricSnapshot
        {
            CapturedAt = DateTimeOffset.UtcNow,
            Readings = [],
            Warnings = InitializationWarnings.Select(warning => warning.Message).ToList(),
        };
    }

    private static MetricSnapshotRefreshResult BuildRefreshResult(
        MetricSnapshot snapshot,
        string? pollingGroupId,
        bool usesLibreHardwareMonitor,
        bool skippedByCoreGateway,
        TimeSpan? coreGatewayAge,
        IReadOnlyList<HardwareRefreshDiagnostic> hardwareUpdates)
    {
        return new MetricSnapshotRefreshResult
        {
            Snapshot = snapshot,
            Diagnostics = new MetricSnapshotRefreshDiagnostics
            {
                PollingGroupId = pollingGroupId,
                UsesLibreHardwareMonitor = usesLibreHardwareMonitor,
                SkippedByCoreGateway = skippedByCoreGateway,
                CoreGatewayAge = coreGatewayAge,
                HardwareUpdates = hardwareUpdates,
                ReadingCount = snapshot.Readings.Count,
                UnavailableMetricCount = snapshot.UnavailableMetrics.Count,
                WarningCount = snapshot.Warnings.Count,
            },
        };
    }

    private void AddNativeDiskThroughputReadings(Dictionary<string, MetricReading> readingsByMetricId)
    {
        foreach (MetricReading reading in _diskThroughputProvider.Read())
        {
            readingsByMetricId[reading.MetricId] = reading;
        }
    }

    private static void AddMissingMetricWarnings(List<MetricReading> readings, List<string> warnings)
    {
        if (!readings.Any(reading => reading.MetricId.Equals("cpu.usage_percent", StringComparison.Ordinal)))
        {
            warnings.Add("No CPU metric value was returned by LibreHardwareMonitor.");
        }
    }

}
