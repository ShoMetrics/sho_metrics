using Microsoft.Extensions.Logging;

namespace ShoMetrics.Source.Windows.Diagnostics;

/// <summary>
/// Terminal builder for one throttled log statement.
/// </summary>
/// <remarks>
/// Use the plain <see cref="Log(string, object?[])" /> overload when arguments
/// are already cheap; it automatically adds a suppressed-count property when
/// previous same-key attempts were throttled. Use the factory overload when
/// building the message or arguments requires aggregation, string joins, object
/// graph traversal, or other work that should happen only after level and
/// throttle checks pass.
/// </remarks>
public readonly struct ThrottledLogSite
{
    private readonly ThrottledLogger _owner;
    private readonly LogLevel _level;
    private readonly string _key;
    private readonly TimeSpan _interval;

    internal ThrottledLogSite(
        ThrottledLogger owner,
        LogLevel level,
        string key,
        TimeSpan interval)
    {
        _owner = owner;
        _level = level;
        _key = key;
        _interval = interval;
    }

    public void Log(string message, params object?[] args)
    {
        _owner.LogEvery(_level, _key, _interval, message, args);
    }

    public void Log(Exception exception, string message, params object?[] args)
    {
        _owner.LogEvery(_level, _key, _interval, exception, message, args);
    }

    /// <summary>
    /// Writes a throttled log entry after level and throttle checks pass.
    /// </summary>
    /// <remarks>
    /// The factory receives the suppressed count and owns whether/how to include
    /// it in the emitted structured log.
    /// </remarks>
    public void Log(Func<ThrottledLogContext, ThrottledLogEntry> createEntry)
    {
        _owner.LogEvery(_level, _key, _interval, createEntry);
    }
}
