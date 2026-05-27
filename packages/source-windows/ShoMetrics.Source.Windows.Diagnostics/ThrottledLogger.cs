using Microsoft.Extensions.Logging;
using System.IO;

namespace ShoMetrics.Source.Windows.Diagnostics;

/// <summary>
/// Small owner-scoped wrapper for throttled, structured logs.
/// </summary>
/// <remarks>
/// This type does not replace <see cref="ILogger" /> or Serilog. It only owns
/// per-call-site throttling state before delegating to the normal .NET logging
/// pipeline. Keep one instance as a field on the class that owns the log sites;
/// do not share one process-wide instance.
/// </remarks>
public sealed class ThrottledLogger
{
    private const int MaximumThrottleKeyCount = 128;
    private const string SuppressedLogCountPropertyName = "SuppressedLogCount";

    private readonly ILogger _logger;
    private readonly TimeProvider _timeProvider;
    private readonly Lock _gate = new();
    private readonly Dictionary<string, LogThrottleState> _stateByKey = new(StringComparer.Ordinal);
    private long _useCounter;

    public ThrottledLogger(ILogger logger, TimeProvider? timeProvider = null)
    {
        _logger = logger;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>
    /// Starts a throttled debug log statement.
    /// </summary>
    public ThrottledLogLevelBuilder AtDebug()
    {
        return new ThrottledLogLevelBuilder(this, LogLevel.Debug);
    }

    /// <summary>
    /// Starts a throttled information log statement.
    /// </summary>
    public ThrottledLogLevelBuilder AtInformation()
    {
        return new ThrottledLogLevelBuilder(this, LogLevel.Information);
    }

    /// <summary>
    /// Starts a throttled warning log statement.
    /// </summary>
    public ThrottledLogLevelBuilder AtWarning()
    {
        return new ThrottledLogLevelBuilder(this, LogLevel.Warning);
    }

    /// <summary>
    /// Starts a throttled error log statement.
    /// </summary>
    public ThrottledLogLevelBuilder AtError()
    {
        return new ThrottledLogLevelBuilder(this, LogLevel.Error);
    }

    internal ThrottledLogSite CreateSite(LogLevel level, string key, TimeSpan interval)
    {
        ValidateThrottleInput(key, interval);
        return new ThrottledLogSite(this, level, key, interval);
    }

    internal static string BuildCallSiteKey(string filePath, string memberName, int lineNumber)
    {
        string fileName = Path.GetFileName(filePath);
        return $"{fileName}:{memberName}:{lineNumber}";
    }

    private bool ShouldLog(
        LogLevel level,
        string key,
        TimeSpan interval,
        out int suppressedCount)
    {
        suppressedCount = 0;

        if (!_logger.IsEnabled(level))
        {
            return false;
        }

        long currentTimestamp = _timeProvider.GetTimestamp();

        lock (_gate)
        {
            _useCounter++;

            if (!_stateByKey.TryGetValue(key, out LogThrottleState? state))
            {
                RememberNewKey(key, currentTimestamp);
                return true;
            }

            state.LastUsed = _useCounter;

            if (_timeProvider.GetElapsedTime(state.LastEmittedTimestamp, currentTimestamp) < interval)
            {
                state.SuppressedCount++;
                return false;
            }

            suppressedCount = state.SuppressedCount;
            state.SuppressedCount = 0;
            state.LastEmittedTimestamp = currentTimestamp;
            return true;
        }
    }

    internal void LogEvery(
        LogLevel level,
        string key,
        TimeSpan interval,
        string message,
        object?[] args)
    {
        if (!ShouldLog(level, key, interval, out int suppressedCount))
        {
            return;
        }

        _logger.Log(
            level,
            BuildMessageWithSuppressedCount(message, suppressedCount),
            BuildArgsWithSuppressedCount(args, suppressedCount));
    }

    internal void LogEvery(
        LogLevel level,
        string key,
        TimeSpan interval,
        Exception exception,
        string message,
        object?[] args)
    {
        if (!ShouldLog(level, key, interval, out int suppressedCount))
        {
            return;
        }

        _logger.Log(
            level,
            exception,
            BuildMessageWithSuppressedCount(message, suppressedCount),
            BuildArgsWithSuppressedCount(args, suppressedCount));
    }

    internal void LogEvery(
        LogLevel level,
        string key,
        TimeSpan interval,
        Func<ThrottledLogContext, ThrottledLogEntry> createEntry)
    {
        if (!ShouldLog(level, key, interval, out int suppressedCount))
        {
            return;
        }

        ThrottledLogEntry entry = createEntry(new ThrottledLogContext(suppressedCount));
        _logger.Log(level, entry.Exception, entry.Message, entry.Args);
    }

    private static string BuildMessageWithSuppressedCount(string message, int suppressedCount)
    {
        return $"{message} suppressedLogCount={{{SuppressedLogCountPropertyName}}}";
    }

    private static object?[] BuildArgsWithSuppressedCount(object?[] args, int suppressedCount)
    {
        object?[] argsWithSuppressedCount = new object?[args.Length + 1];
        Array.Copy(args, argsWithSuppressedCount, args.Length);
        argsWithSuppressedCount[^1] = suppressedCount;
        return argsWithSuppressedCount;
    }

    private static void ValidateThrottleInput(string key, TimeSpan interval)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);

        if (interval <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(interval), interval, "Throttle interval must be positive.");
        }
    }

    private void RememberNewKey(string key, long currentTimestamp)
    {
        if (_stateByKey.Count >= MaximumThrottleKeyCount)
        {
            string? leastRecentlyUsedKey = null;
            long leastRecentUse = long.MaxValue;

            foreach (KeyValuePair<string, LogThrottleState> item in _stateByKey)
            {
                if (item.Value.LastUsed < leastRecentUse)
                {
                    leastRecentlyUsedKey = item.Key;
                    leastRecentUse = item.Value.LastUsed;
                }
            }

            if (leastRecentlyUsedKey is not null)
            {
                _stateByKey.Remove(leastRecentlyUsedKey);
            }
        }

        _stateByKey[key] = new LogThrottleState
        {
            LastEmittedTimestamp = currentTimestamp,
            LastUsed = _useCounter,
        };
    }

    private sealed class LogThrottleState
    {
        public required long LastEmittedTimestamp { get; set; }

        public int SuppressedCount { get; set; }

        public required long LastUsed { get; set; }
    }
}
