namespace ShoMetrics.Source.Windows.Ipc;

public enum SourceIpcFrameError
{
    MalformedPayload,
    IncompleteFrame,
    FrameTooLarge,
}

public sealed class SourceIpcFrameException : Exception
{
    public SourceIpcFrameException(
        SourceIpcFrameError error,
        string message,
        Exception? innerException = null)
        : base(message, innerException)
    {
        Error = error;
    }

    public SourceIpcFrameError Error { get; }
}
