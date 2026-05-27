using Microsoft.Extensions.Logging;
using System.Runtime.CompilerServices;

namespace ShoMetrics.Source.Windows.Diagnostics;

/// <summary>
/// Level-selected entry point for a throttled log statement.
/// </summary>
/// <remarks>
/// The call-site shape intentionally keeps the same ordering as fluent logging
/// APIs: choose a level, add throttling, then write the message. Throttle state
/// is owned by the surrounding <see cref="ThrottledLogger" /> instance, not by
/// global static state.
/// </remarks>
public readonly struct ThrottledLogLevelBuilder
{
    private readonly ThrottledLogger _owner;
    private readonly LogLevel _level;

    internal ThrottledLogLevelBuilder(ThrottledLogger owner, LogLevel level)
    {
        _owner = owner;
        _level = level;
    }

    /// <summary>
    /// Rate-limits this source line independently from other log statements.
    /// </summary>
    public ThrottledLogSite Every(
        TimeSpan interval,
        [CallerFilePath] string filePath = "",
        [CallerMemberName] string memberName = "",
        [CallerLineNumber] int lineNumber = 0)
    {
        return _owner.CreateSite(_level, ThrottledLogger.BuildCallSiteKey(filePath, memberName, lineNumber), interval);
    }

    /// <summary>
    /// Rate-limits a bounded explicit bucket such as a hardware type or metric group.
    /// </summary>
    /// <remarks>
    /// Prefer <see cref="Every(TimeSpan, string, string, int)" /> for ordinary
    /// call-site throttling. Use explicit buckets only when several related log
    /// statements intentionally share a throttle bucket, or when one log
    /// statement needs a separate bucket per stable low-cardinality value such
    /// as a fixed RPC method name. Do not include hardware ids, sensor ids, user
    /// input, or other high-cardinality values in the key.
    /// </remarks>
    public ThrottledLogSite EveryBucket(string key, TimeSpan interval)
    {
        return _owner.CreateSite(_level, key, interval);
    }
}
