using System.Reflection;

namespace ShoMetrics.Source.Windows.Service;

internal static class WindowsSourceServiceIdentity
{
    public const string SourceId = "windows-helper";
    public const string ProtocolVersion = "1";

    public static readonly string HelperVersion = ResolveHelperVersion();

    private static string ResolveHelperVersion()
    {
        Assembly assembly = typeof(WindowsSourceServiceIdentity).Assembly;
        AssemblyInformationalVersionAttribute? informationalVersion =
            assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();

        return informationalVersion?.InformationalVersion ?? assembly.GetName().Version?.ToString() ?? "0.0.0";
    }
}
