using System.Reflection;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal static class ControlPanelIdentity
{
    public static readonly string Version = ResolveVersion();

    // TODO: If another shipped Source Windows binary needs this same assembly
    // version resolver, move the helper into a shared project instead of
    // copying a third copy.
    private static string ResolveVersion()
    {
        Assembly assembly = typeof(ControlPanelIdentity).Assembly;
        AssemblyInformationalVersionAttribute? informationalVersion =
            assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();

        return informationalVersion?.InformationalVersion ?? assembly.GetName().Version?.ToString() ?? "0.0.0";
    }
}
