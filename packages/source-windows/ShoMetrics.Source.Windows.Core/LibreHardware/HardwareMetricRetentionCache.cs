namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Retains the last good LHM sample for short sensor gaps.
/// </summary>
/// <remarks>
/// Retention is owned by metric polling group, not by the whole reader. A GPU
/// refresh must not age out a CPU sensor, while a slow-refresh CPU group must
/// still stop showing retained values after the monotonic age cap.
/// </remarks>
internal sealed class HardwareMetricRetentionCache
{
    private const string StableAliasKeyPrefix = "stable:";
    private const string SourceSensorKeyPrefix = "sensor:";
    private const int DefaultRetainedTickLimit = 3;
    // Tick and age limits are both required: fast groups use the miss budget,
    // while slow-demanded groups are mostly governed by the age cap.
    private static readonly TimeSpan DefaultRetainedAgeLimit = TimeSpan.FromSeconds(90);

    private readonly int _retainedTickLimit;
    private readonly TimeSpan _retainedAgeLimit;
    private readonly TimeProvider _timeProvider;
    private readonly Dictionary<string, RetainedHardwareMetricSample> _samplesByKey =
        new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _sourceTicksByPollingGroupId = new(StringComparer.Ordinal);
    // Ranked stable aliases can move between raw sensors. Remembering the last
    // owner group keeps record and fallback read on the same miss counter.
    private readonly Dictionary<string, string> _stableAliasPollingGroupIdsByMetricId = new(StringComparer.Ordinal);

    /// <summary>
    /// Creates a retention cache with the default miss budget and monotonic age cap.
    /// </summary>
    public HardwareMetricRetentionCache(TimeProvider? timeProvider = null)
        : this(DefaultRetainedTickLimit, DefaultRetainedAgeLimit, timeProvider)
    {
    }

    internal HardwareMetricRetentionCache(int retainedTickLimit, TimeProvider? timeProvider = null)
        : this(retainedTickLimit, DefaultRetainedAgeLimit, timeProvider)
    {
    }

    internal HardwareMetricRetentionCache(
        int retainedTickLimit,
        TimeSpan retainedAgeLimit,
        TimeProvider? timeProvider = null)
    {
        if (retainedTickLimit < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(retainedTickLimit));
        }

        if (retainedAgeLimit <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(retainedAgeLimit));
        }

        _retainedTickLimit = retainedTickLimit;
        _retainedAgeLimit = retainedAgeLimit;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>
    /// Opens the per-traversal retention view for one LHM reader pass.
    /// </summary>
    /// <remarks>
    /// Callers should create one scope at the start of a reader traversal and
    /// pass the same scope through that traversal. The scope is what prevents a
    /// polling group from being counted more than once during a single pass.
    /// </remarks>
    public ReadScope BeginRead(long currentTimestamp)
    {
        return new ReadScope(this, currentTimestamp);
    }

    private void RecordFreshStableAlias(
        MetricReading reading,
        string ownerPollingGroupId,
        long capturedTimestamp,
        HashSet<string> advancedPollingGroupIds)
    {
        // Stable aliases such as cpu.temp may move between ranked raw sensors
        // when the preferred sensor temporarily stops reporting. Retain by the
        // public metric id so the user-facing alias can keep the last good value.
        long sourceTick = ReadOrAdvancePollingGroupSourceTick(ownerPollingGroupId, advancedPollingGroupIds);
        _stableAliasPollingGroupIdsByMetricId[reading.MetricId] = ownerPollingGroupId;
        Record(BuildStableAliasKey(reading.MetricId), reading, sourceTick, capturedTimestamp);
    }

    private void RecordFreshSourceSensor(
        MetricReading reading,
        string ownerPollingGroupId,
        long capturedTimestamp,
        HashSet<string> advancedPollingGroupIds)
    {
        // Catalog metrics are explicit raw sensors. Retain by source sensor id
        // so a chosen lhm.sensor:/... metric never silently falls back to a
        // different physical sensor.
        long sourceTick = ReadOrAdvancePollingGroupSourceTick(ownerPollingGroupId, advancedPollingGroupIds);
        Record(BuildSourceSensorKey(reading.SensorId), reading, sourceTick, capturedTimestamp);
    }

    private bool TryReadStableAlias(
        string metricId,
        string fallbackPollingGroupId,
        long currentTimestamp,
        HashSet<string> advancedPollingGroupIds,
        out MetricReading reading,
        out bool isExpired)
    {
        string ownerPollingGroupId = ResolveStableAliasPollingGroupId(metricId, fallbackPollingGroupId);
        long sourceTick = ReadOrAdvancePollingGroupSourceTick(ownerPollingGroupId, advancedPollingGroupIds);
        return TryRead(BuildStableAliasKey(metricId), sourceTick, currentTimestamp, out reading, out isExpired);
    }

    private bool TryReadSourceSensor(
        string sourceSensorId,
        string ownerPollingGroupId,
        long currentTimestamp,
        HashSet<string> advancedPollingGroupIds,
        out MetricReading reading,
        out bool isExpired)
    {
        long sourceTick = ReadOrAdvancePollingGroupSourceTick(ownerPollingGroupId, advancedPollingGroupIds);
        return TryRead(BuildSourceSensorKey(sourceSensorId), sourceTick, currentTimestamp, out reading, out isExpired);
    }

    private void TouchPollingGroup(
        string pollingGroupId,
        HashSet<string> advancedPollingGroupIds)
    {
        ReadOrAdvancePollingGroupSourceTick(pollingGroupId, advancedPollingGroupIds);
    }

    private void Record(
        string key,
        MetricReading reading,
        long sourceTick,
        long capturedTimestamp)
    {
        _samplesByKey[key] = new RetainedHardwareMetricSample(reading, sourceTick, capturedTimestamp);
    }

    private bool TryRead(
        string key,
        long sourceTick,
        long currentTimestamp,
        out MetricReading reading,
        out bool isExpired)
    {
        reading = default!;
        isExpired = false;

        if (!_samplesByKey.TryGetValue(key, out RetainedHardwareMetricSample sample))
        {
            return false;
        }

        TimeSpan retainedAge = _timeProvider.GetElapsedTime(sample.CapturedTimestamp, currentTimestamp);
        reading = BuildRetainedReading(sample, retainedAge);

        long retainedTickAge = sourceTick - sample.SourceTick;
        if (retainedTickAge <= _retainedTickLimit && retainedAge <= _retainedAgeLimit)
        {
            // Expiry is based on the owning polling group's miss count, capped
            // by monotonic age so slow-refresh groups cannot display stale
            // values for minutes.
            return true;
        }

        isExpired = true;
        return false;
    }

    private static string BuildStableAliasKey(string metricId)
    {
        return StableAliasKeyPrefix + metricId;
    }

    private static string BuildSourceSensorKey(string sourceSensorId)
    {
        return SourceSensorKeyPrefix + sourceSensorId;
    }

    private long ReadOrAdvancePollingGroupSourceTick(
        string pollingGroupId,
        HashSet<string> advancedPollingGroupIds)
    {
        if (advancedPollingGroupIds.Contains(pollingGroupId))
        {
            return _sourceTicksByPollingGroupId[pollingGroupId];
        }

        _sourceTicksByPollingGroupId.TryGetValue(pollingGroupId, out long sourceTick);
        sourceTick++;
        _sourceTicksByPollingGroupId[pollingGroupId] = sourceTick;
        advancedPollingGroupIds.Add(pollingGroupId);
        return sourceTick;
    }

    private string ResolveStableAliasPollingGroupId(string metricId, string fallbackPollingGroupId)
    {
        return _stableAliasPollingGroupIdsByMetricId.TryGetValue(
                metricId,
                out string? ownerPollingGroupId)
            && _sourceTicksByPollingGroupId.ContainsKey(ownerPollingGroupId)
                ? ownerPollingGroupId
                : fallbackPollingGroupId;
    }

    private static MetricReading BuildRetainedReading(
        RetainedHardwareMetricSample sample,
        TimeSpan retainedAge)
    {
        return sample.Reading with
        {
            ValueFreshness = MetricValueFreshness.Retained,
            RetainedAge = retainedAge >= TimeSpan.Zero ? retainedAge : TimeSpan.Zero,
        };
    }

    private readonly record struct RetainedHardwareMetricSample(
        MetricReading Reading,
        long SourceTick,
        long CapturedTimestamp);

    /// <summary>
    /// Per-reader-traversal retention view that advances each polling group at most once.
    /// </summary>
    /// <remarks>
    /// Create one scope per <see cref="LibreHardwareSnapshotReader.Read" /> call
    /// and discard it after the traversal. Reusing a scope would hide refresh
    /// misses from the retained-sample counter.
    /// </remarks>
    internal sealed class ReadScope
    {
        private readonly HardwareMetricRetentionCache _cache;
        private readonly long _currentTimestamp;
        private readonly HashSet<string> _advancedPollingGroupIds = new(StringComparer.Ordinal);

        internal ReadScope(HardwareMetricRetentionCache cache, long currentTimestamp)
        {
            _cache = cache;
            _currentTimestamp = currentTimestamp;
        }

        /// <summary>
        /// Marks a polling group as refreshed by this traversal.
        /// </summary>
        public void TouchPollingGroup(string pollingGroupId)
        {
            _cache.TouchPollingGroup(pollingGroupId, _advancedPollingGroupIds);
        }

        /// <summary>
        /// Records a fresh public alias sample against the polling group that produced it.
        /// </summary>
        public void RecordFreshStableAlias(MetricReading reading, string ownerPollingGroupId)
        {
            _cache.RecordFreshStableAlias(
                reading,
                ownerPollingGroupId,
                _currentTimestamp,
                _advancedPollingGroupIds);
        }

        /// <summary>
        /// Records a fresh raw sensor sample against the polling group that owns the sensor.
        /// </summary>
        public void RecordFreshSourceSensor(MetricReading reading, string ownerPollingGroupId)
        {
            _cache.RecordFreshSourceSensor(
                reading,
                ownerPollingGroupId,
                _currentTimestamp,
                _advancedPollingGroupIds);
        }

        /// <summary>
        /// Reads a retained public alias sample using its last recorded owner group when known.
        /// </summary>
        /// <remarks>
        /// The fallback group is used before any fresh owner has been recorded,
        /// for example when a ranked CPU alias has not yet selected a candidate.
        /// </remarks>
        public bool TryReadStableAlias(
            string metricId,
            string fallbackPollingGroupId,
            out MetricReading reading,
            out bool isExpired)
        {
            return _cache.TryReadStableAlias(
                metricId,
                fallbackPollingGroupId,
                _currentTimestamp,
                _advancedPollingGroupIds,
                out reading,
                out isExpired);
        }

        /// <summary>
        /// Reads a retained raw sensor sample using the sensor's owner polling group.
        /// </summary>
        public bool TryReadSourceSensor(
            string sourceSensorId,
            string ownerPollingGroupId,
            out MetricReading reading,
            out bool isExpired)
        {
            return _cache.TryReadSourceSensor(
                sourceSensorId,
                ownerPollingGroupId,
                _currentTimestamp,
                _advancedPollingGroupIds,
                out reading,
                out isExpired);
        }
    }
}
