namespace ShoMetrics.Source.Windows.Contracts;

public static class WindowsSourceServiceConstants
{
    public const string GrpcPipeName = "ShoMetrics.Source.Windows.Grpc.v1";

    // Exact helper-owned component id used in SourceComponentStatus. Consumers
    // may compare this whole value, but must not parse driver/component ids by
    // prefix or substring.
    public const string PawnIoDriverComponentId = "driver:pawnio";

    public const string ServiceName = "ShoMetrics Helper";
    public const int MaximumGrpcMessageBytes = 1024 * 1024;
}
