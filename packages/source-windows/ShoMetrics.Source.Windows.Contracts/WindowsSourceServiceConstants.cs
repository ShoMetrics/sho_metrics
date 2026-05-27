namespace ShoMetrics.Source.Windows.Contracts;

public static class WindowsSourceServiceConstants
{
    public const string GrpcPipeName = "ShoMetrics.Source.Windows.Grpc.v1";
    public const string ServiceName = "ShoMetrics Source Windows";
    public const int MaximumGrpcMessageBytes = 1024 * 1024;
}
