using System.Reflection;

namespace ShoMetrics.Source.Windows.Service;

internal static class SourceServiceConstants
{
    public const string SourceId = "windows-helper";
    public const string ProtocolVersion = "1";
    public const string PipeName = "ShoMetrics.Source.Windows.v1";
    public const string ServiceName = "ShoMetrics Source Windows";
    public const int MaximumFrameBytes = 1024 * 1024;

    public static readonly string HelperVersion = ResolveHelperVersion();

    private static string ResolveHelperVersion()
    {
        Assembly assembly = typeof(SourceServiceConstants).Assembly;
        AssemblyInformationalVersionAttribute? informationalVersion =
            assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();

        return informationalVersion?.InformationalVersion ?? assembly.GetName().Version?.ToString() ?? "0.0.0";
    }
}
