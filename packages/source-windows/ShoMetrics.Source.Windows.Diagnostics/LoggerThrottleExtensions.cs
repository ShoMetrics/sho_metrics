using Microsoft.Extensions.Logging;
using System.Runtime.CompilerServices;

namespace ShoMetrics.Source.Windows.Diagnostics;

/// <summary>
/// Throttled logging entry points for ordinary <see cref="ILogger" /> instances.
/// </summary>
/// <remarks>
/// Application code should keep a single <see cref="ILogger" /> field. These
/// extensions attach bounded per-logger throttle state before delegating back to
/// the normal .NET logging pipeline. The state is keyed by <see cref="ILogger" />
/// object identity, so class instances that share the same injected logger also
/// share throttling for the same call site or explicit bucket. That is
/// intentional for diagnostic throttling: repeated failures from several
/// instances should still emit at most one log per interval.
/// </remarks>
public static class LoggerThrottleExtensions
{
    private static readonly ConditionalWeakTable<ILogger, ThrottledLogger> Loggers = new();

    public static ThrottledLogLevelBuilder AtDebug(this ILogger logger)
    {
        return ResolveThrottledLogger(logger).AtDebug();
    }

    public static ThrottledLogLevelBuilder AtInformation(this ILogger logger)
    {
        return ResolveThrottledLogger(logger).AtInformation();
    }

    public static ThrottledLogLevelBuilder AtWarning(this ILogger logger)
    {
        return ResolveThrottledLogger(logger).AtWarning();
    }

    public static ThrottledLogLevelBuilder AtError(this ILogger logger)
    {
        return ResolveThrottledLogger(logger).AtError();
    }

    private static ThrottledLogger ResolveThrottledLogger(ILogger logger)
    {
        ArgumentNullException.ThrowIfNull(logger);
        return Loggers.GetValue(logger, static logger => new ThrottledLogger(logger));
    }
}
