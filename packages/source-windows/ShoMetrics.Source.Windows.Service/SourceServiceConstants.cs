namespace ShoMetrics.Source.Windows.Service;

internal static class SourceServiceConstants
{
    public const string SourceId = "windows-helper";
    public const string ProtocolVersion = "1";
    public const string PipeName = "ShoMetrics.Source.Windows.v1";
    public const string ServiceName = "ShoMetrics Source Windows";
    public const int MaximumFrameBytes = 1024 * 1024;
}
