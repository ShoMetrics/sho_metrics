using System.Reflection;

namespace ShoMetrics.Source.Windows.Service.Tests;

public sealed class WindowsSourceServiceIdentityTests
{
    [Fact]
    public void HelperVersionMatchesAssemblyInformationalVersion()
    {
        Assembly assembly = typeof(WindowsSourceServiceIdentity).Assembly;
        AssemblyInformationalVersionAttribute? informationalVersion =
            assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();

        Assert.NotNull(informationalVersion);
        Assert.Equal(informationalVersion.InformationalVersion, WindowsSourceServiceIdentity.HelperVersion);
        Assert.False(string.IsNullOrWhiteSpace(WindowsSourceServiceIdentity.HelperVersion));
        Assert.False(
            WindowsSourceServiceIdentity.HelperVersion.Contains('+', StringComparison.Ordinal),
            "User-facing helper version should not include a source revision suffix.");
    }
}
