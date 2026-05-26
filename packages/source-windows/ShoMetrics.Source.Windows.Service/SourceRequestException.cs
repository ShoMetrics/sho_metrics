namespace ShoMetrics.Source.Windows.Service;

internal enum SourceRequestFailureKind
{
    InvalidArgument,
    FailedPrecondition,
    SourceUnavailable,
    Timeout,
}

internal sealed class SourceRequestException(SourceRequestFailureKind failureKind, string message) : Exception(message)
{
    public SourceRequestFailureKind FailureKind { get; } = failureKind;
}
