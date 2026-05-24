namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class CoreAssemblySmokeTests
{
    [Fact]
    public void DescriptorSnapshotStoresCatalogFingerprint()
    {
        var snapshot = new HardwareMetricDescriptorSnapshot
        {
            DescriptorFingerprint = "catalog:fingerprint",
            Descriptors = [],
            Warnings = [],
        };

        Assert.Equal("catalog:fingerprint", snapshot.DescriptorFingerprint);
    }
}
