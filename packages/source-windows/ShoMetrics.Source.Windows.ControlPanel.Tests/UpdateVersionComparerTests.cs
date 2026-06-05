namespace ShoMetrics.Source.Windows.ControlPanel.Tests;

public sealed class UpdateVersionComparerTests
{
    [Theory]
    [InlineData("0.2.0", "0.1.9")]
    [InlineData("1.0.0", "1.0.0-beta.1")]
    [InlineData("1.0.0-beta.2", "1.0.0-beta.1")]
    [InlineData("v1.0.1+build.5", "1.0.0")]
    public void CompareTreatsLeftVersionAsNewer(string left, string right)
    {
        Assert.True(UpdateVersionComparer.Compare(left, right) > 0);
    }

    [Theory]
    [InlineData("0.1.0", "0.1")]
    [InlineData("v1.0.0+build.1", "1.0.0+build.2")]
    public void CompareTreatsVersionsAsEquivalent(string left, string right)
    {
        Assert.Equal(0, UpdateVersionComparer.Compare(left, right));
    }

    [Theory]
    [InlineData("")]
    [InlineData("v")]
    [InlineData("1.bad.0")]
    [InlineData("1..0")]
    [InlineData("1.0.0-")]
    public void TryCompareRejectsMalformedVersions(string malformedVersion)
    {
        Assert.False(UpdateVersionComparer.TryCompare(malformedVersion, "0.1.0", out _));
    }
}
