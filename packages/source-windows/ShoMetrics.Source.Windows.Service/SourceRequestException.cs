namespace ShoMetrics.Source.Windows.Service;

// Service-owned failure kinds that are mapped to canonical gRPC status codes at
// the WindowsGrpcMetricSourceService boundary.
internal enum SourceRequestFailureKind
{
    // The caller sent malformed or unsupported request data.
    InvalidArgument,

    // The request shape is valid, but current helper/source state cannot serve it.
    FailedPrecondition,

    // The caller exceeded a bounded service policy such as request rate.
    ResourceExhausted,

    // The hardware source/session is not available.
    SourceUnavailable,

    // The helper operation exceeded its internal timeout.
    Timeout,
}

internal sealed class SourceRequestException(SourceRequestFailureKind failureKind, string message) : Exception(message)
{
    public SourceRequestFailureKind FailureKind { get; } = failureKind;
}
