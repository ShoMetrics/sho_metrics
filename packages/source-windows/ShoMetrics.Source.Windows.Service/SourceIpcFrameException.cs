namespace ShoMetrics.Source.Windows.Service;

internal enum SourceIpcFrameError
{
    MalformedRequest,
    FrameTooLarge,
}

internal sealed class SourceIpcFrameException : Exception
{
    public SourceIpcFrameException(
        SourceIpcFrameError error,
        bool canWriteErrorResponse,
        string message,
        Exception? innerException = null)
        : base(message, innerException)
    {
        Error = error;
        CanWriteErrorResponse = canWriteErrorResponse;
    }

    public SourceIpcFrameError Error { get; }

    public bool CanWriteErrorResponse { get; }
}
