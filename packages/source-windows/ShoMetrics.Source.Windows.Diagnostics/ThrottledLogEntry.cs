namespace ShoMetrics.Source.Windows.Diagnostics;

/// <summary>
/// Fully materialized log entry created only after throttling permits emission.
/// </summary>
public readonly struct ThrottledLogEntry
{
    private ThrottledLogEntry(
        string message,
        object?[] args,
        Exception? exception)
    {
        Message = message;
        Args = args;
        Exception = exception;
    }

    public string Message { get; }

    public object?[] Args { get; }

    public Exception? Exception { get; }

    public static ThrottledLogEntry Create(string message, params object?[] args)
    {
        return new ThrottledLogEntry(message, args, exception: null);
    }

    public static ThrottledLogEntry Create(Exception exception, string message, params object?[] args)
    {
        return new ThrottledLogEntry(message, args, exception);
    }
}
