using Microsoft.Extensions.Logging;

namespace ShoMetrics.Source.Windows.Diagnostics.Tests;

public sealed class ThrottledLoggerTests
{
    [Fact]
    public void LogSuppressesRepeatedKeyWithinInterval()
    {
        var timeProvider = new ManualTimeProvider();
        var logger = new CapturingLogger(LogLevel.Debug);
        var throttledLogger = new ThrottledLogger(logger, timeProvider);

        LogRepeatedSummary(throttledLogger, 1);
        LogRepeatedSummary(throttledLogger, 2);

        Assert.Single(logger.Entries);
        Assert.Contains("1", logger.Entries[0].Message, StringComparison.Ordinal);
    }

    [Fact]
    public void EveryUsesCallSiteKeyWhenNoExplicitKeyIsProvided()
    {
        var timeProvider = new ManualTimeProvider();
        var logger = new CapturingLogger(LogLevel.Debug);
        var throttledLogger = new ThrottledLogger(logger, timeProvider);

        LogFromFirstCallSite(throttledLogger);
        LogFromSecondCallSite(throttledLogger);

        Assert.Equal(2, logger.Entries.Count);
    }

    [Fact]
    public void LogReportsSuppressedCountAfterInterval()
    {
        var timeProvider = new ManualTimeProvider();
        var logger = new CapturingLogger(LogLevel.Debug);
        var throttledLogger = new ThrottledLogger(logger, timeProvider);

        throttledLogger
            .AtDebug()
            .EveryBucket("refresh-summary", TimeSpan.FromSeconds(30))
            .Log(context => ThrottledLogEntry.Create(
                "Refresh summary suppressed={SuppressedCount}",
                context.SuppressedCount));
        throttledLogger
            .AtDebug()
            .EveryBucket("refresh-summary", TimeSpan.FromSeconds(30))
            .Log(context => ThrottledLogEntry.Create(
                "Refresh summary suppressed={SuppressedCount}",
                context.SuppressedCount));
        throttledLogger
            .AtDebug()
            .EveryBucket("refresh-summary", TimeSpan.FromSeconds(30))
            .Log(context => ThrottledLogEntry.Create(
                "Refresh summary suppressed={SuppressedCount}",
                context.SuppressedCount));

        timeProvider.Advance(TimeSpan.FromSeconds(30));

        throttledLogger
            .AtDebug()
            .EveryBucket("refresh-summary", TimeSpan.FromSeconds(30))
            .Log(context => ThrottledLogEntry.Create(
                "Refresh summary suppressed={SuppressedCount}",
                context.SuppressedCount));

        Assert.Equal(2, logger.Entries.Count);
        Assert.Contains("suppressed=0", logger.Entries[0].Message, StringComparison.Ordinal);
        Assert.Contains("suppressed=2", logger.Entries[1].Message, StringComparison.Ordinal);
    }

    [Fact]
    public void PlainLogIncludesSuppressedCountAfterInterval()
    {
        var timeProvider = new ManualTimeProvider();
        var logger = new CapturingLogger(LogLevel.Debug);
        var throttledLogger = new ThrottledLogger(logger, timeProvider);

        LogPlainRepeatedSummary(throttledLogger, 1);
        LogPlainRepeatedSummary(throttledLogger, 2);
        LogPlainRepeatedSummary(throttledLogger, 3);

        timeProvider.Advance(TimeSpan.FromSeconds(30));

        LogPlainRepeatedSummary(throttledLogger, 4);

        Assert.Equal(2, logger.Entries.Count);
        Assert.Contains("suppressedLogCount=0", logger.Entries[0].Message, StringComparison.Ordinal);
        Assert.Contains("suppressedLogCount=2", logger.Entries[1].Message, StringComparison.Ordinal);
    }

    [Fact]
    public void PlainExceptionLogIncludesSuppressedCountAfterInterval()
    {
        var timeProvider = new ManualTimeProvider();
        var logger = new CapturingLogger(LogLevel.Warning);
        var throttledLogger = new ThrottledLogger(logger, timeProvider);
        var exception = new InvalidOperationException("failure");

        LogPlainRepeatedFailure(throttledLogger, exception);
        LogPlainRepeatedFailure(throttledLogger, exception);

        timeProvider.Advance(TimeSpan.FromSeconds(30));

        LogPlainRepeatedFailure(throttledLogger, exception);

        Assert.Equal(2, logger.Entries.Count);
        Assert.Contains("suppressedLogCount=1", logger.Entries[1].Message, StringComparison.Ordinal);
        Assert.Same(exception, logger.Entries[1].Exception);
    }

    [Fact]
    public void ThrottleUsesMonotonicTimeWhenUtcClockMovesBackward()
    {
        var timeProvider = new ManualTimeProvider();
        var logger = new CapturingLogger(LogLevel.Debug);
        var throttledLogger = new ThrottledLogger(logger, timeProvider);

        LogPlainRepeatedSummary(throttledLogger, 1);
        timeProvider.RewindUtc(TimeSpan.FromHours(1));
        timeProvider.Advance(TimeSpan.FromSeconds(30));
        LogPlainRepeatedSummary(throttledLogger, 2);

        Assert.Equal(2, logger.Entries.Count);
        Assert.Contains("Plain refresh summary 2", logger.Entries[1].Message, StringComparison.Ordinal);
    }

    [Fact]
    public void DisabledLevelDoesNotInvokeLazyFactory()
    {
        var logger = new CapturingLogger(LogLevel.Information);
        var throttledLogger = new ThrottledLogger(logger, new ManualTimeProvider());
        int factoryCalls = 0;

        throttledLogger
            .AtDebug()
            .EveryBucket("debug-detail", TimeSpan.FromSeconds(30))
            .Log(_ =>
            {
                factoryCalls++;
                return ThrottledLogEntry.Create("Debug detail");
            });

        Assert.Equal(0, factoryCalls);
        Assert.Empty(logger.Entries);
    }

    [Fact]
    public void ThrottleStateIsOwnedByWrapperInstance()
    {
        var timeProvider = new ManualTimeProvider();
        var firstLogger = new CapturingLogger(LogLevel.Debug);
        var secondLogger = new CapturingLogger(LogLevel.Debug);
        var firstThrottledLogger = new ThrottledLogger(firstLogger, timeProvider);
        var secondThrottledLogger = new ThrottledLogger(secondLogger, timeProvider);

        firstThrottledLogger
            .AtDebug()
            .EveryBucket("same-key", TimeSpan.FromSeconds(30))
            .Log("First owner");
        secondThrottledLogger
            .AtDebug()
            .EveryBucket("same-key", TimeSpan.FromSeconds(30))
            .Log("Second owner");

        Assert.Single(firstLogger.Entries);
        Assert.Single(secondLogger.Entries);
    }

    [Fact]
    public void ExtensionThrottleStateIsOwnedByLoggerInstance()
    {
        var firstLogger = new CapturingLogger(LogLevel.Debug);
        var secondLogger = new CapturingLogger(LogLevel.Debug);

        firstLogger
            .AtDebug()
            .EveryBucket("same-key", TimeSpan.FromSeconds(30))
            .Log("First owner");
        firstLogger
            .AtDebug()
            .EveryBucket("same-key", TimeSpan.FromSeconds(30))
            .Log("Suppressed first owner");
        secondLogger
            .AtDebug()
            .EveryBucket("same-key", TimeSpan.FromSeconds(30))
            .Log("Second owner");

        Assert.Single(firstLogger.Entries);
        Assert.Single(secondLogger.Entries);
    }

    [Fact]
    public void ExtensionThrottleStateIsSharedForTheSameLoggerInstance()
    {
        var logger = new CapturingLogger(LogLevel.Debug);

        LogFromExtensionCallSite(logger);
        LogFromExtensionCallSite(logger);

        Assert.Single(logger.Entries);
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private DateTimeOffset _utcNow = new(2026, 5, 26, 0, 0, 0, TimeSpan.Zero);
        private long _timestamp;

        public override DateTimeOffset GetUtcNow()
        {
            return _utcNow;
        }

        public override long GetTimestamp()
        {
            return _timestamp;
        }

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;


        public void Advance(TimeSpan duration)
        {
            _utcNow = _utcNow.Add(duration);
            _timestamp += duration.Ticks;
        }

        public void RewindUtc(TimeSpan duration)
        {
            _utcNow = _utcNow.Subtract(duration);
        }
    }

    private sealed class CapturingLogger(LogLevel minimumLevel) : ILogger
    {
        public List<CapturedLogEntry> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull
        {
            return null;
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            return logLevel >= minimumLevel;
        }

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            Entries.Add(new CapturedLogEntry(
                logLevel,
                formatter(state, exception),
                exception));
        }
    }

    private sealed record CapturedLogEntry(
        LogLevel Level,
        string Message,
        Exception? Exception);

    private static void LogFromFirstCallSite(ThrottledLogger throttledLogger)
    {
        throttledLogger
            .AtDebug()
            .Every(TimeSpan.FromSeconds(30))
            .Log("First call site");
    }

    private static void LogFromSecondCallSite(ThrottledLogger throttledLogger)
    {
        throttledLogger
            .AtDebug()
            .Every(TimeSpan.FromSeconds(30))
            .Log("Second call site");
    }

    private static void LogRepeatedSummary(ThrottledLogger throttledLogger, int value)
    {
        throttledLogger
            .AtDebug()
            .Every(TimeSpan.FromSeconds(30))
            .Log("Refresh summary {Value}", value);
    }

    private static void LogPlainRepeatedSummary(ThrottledLogger throttledLogger, int value)
    {
        throttledLogger
            .AtDebug()
            .Every(TimeSpan.FromSeconds(30))
            .Log("Plain refresh summary {Value}", value);
    }

    private static void LogPlainRepeatedFailure(ThrottledLogger throttledLogger, Exception exception)
    {
        throttledLogger
            .AtWarning()
            .Every(TimeSpan.FromSeconds(30))
            .Log(exception, "Plain failure");
    }

    private static void LogFromExtensionCallSite(ILogger logger)
    {
        logger
            .AtDebug()
            .Every(TimeSpan.FromSeconds(30))
            .Log("Extension call site");
    }
}
