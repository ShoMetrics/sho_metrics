namespace ShoMetrics.Source.Windows.Ipc;

public static class SourceIpcConstants
{
    public const string PipeName = "ShoMetrics.Source.Windows.v1";
    public const string GrpcPipeName = "ShoMetrics.Source.Windows.Grpc.v1";
    public const string ServiceName = "ShoMetrics Source Windows";
    public const int MaximumFrameBytes = 1024 * 1024;
}
