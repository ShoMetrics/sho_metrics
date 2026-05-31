using System.Reflection;

namespace ShoMetrics.Source.Windows.ControlPanel.Tests;

public sealed class ControlPanelIdentityTests
{
    [Fact]
    public void VersionMatchesAssemblyInformationalVersion()
    {
        Assembly assembly = typeof(ControlPanelIdentity).Assembly;
        AssemblyInformationalVersionAttribute? informationalVersion =
            assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();

        Assert.NotNull(informationalVersion);
        Assert.Equal(informationalVersion.InformationalVersion, ControlPanelIdentity.Version);
        Assert.False(string.IsNullOrWhiteSpace(ControlPanelIdentity.Version));
        Assert.False(
            ControlPanelIdentity.Version.Contains('+', StringComparison.Ordinal),
            "User-facing Control Panel version should not include a source revision suffix.");
    }
}
