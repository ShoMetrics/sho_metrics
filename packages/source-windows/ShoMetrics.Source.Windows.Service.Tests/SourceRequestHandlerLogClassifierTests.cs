namespace ShoMetrics.Source.Windows.Service.Tests;

public sealed class SourceRequestHandlerLogClassifierTests
{
    [Theory]
    [InlineData("lhm:hardware:/intelcpu/0", "cpu")]
    [InlineData("lhm:hardware:/amdcpu/0", "cpu")]
    [InlineData("lhm:hardware:/gpu-nvidia/0", "gpu")]
    [InlineData("lhm:hardware:/gpu-intel-integrated/pci-0", "gpu")]
    [InlineData("lhm:hardware:/GPU-NVIDIA/0", "gpu")]
    [InlineData("lhm:hardware:/ram", "ram")]
    [InlineData("lhm:hardware:/nvme/0", "storage")]
    [InlineData("lhm:hardware:/hdd/0", "storage")]
    [InlineData("lhm:hardware:/nic/{adapter-id}", "network")]
    [InlineData("lhm:hardware:/mainboard", "motherboard")]
    [InlineData("lhm:hardware:/lpc/nct6701d/0", "motherboard")]
    [InlineData("windows-native:aggregate:disk", "disk")]
    [InlineData("lhm:aggregate:network", "network")]
    [InlineData("unknown:shape", "other")]
    public void ClassifyDemandPollingGroupForLogUsesRealLhmPollingGroupShapes(
        string pollingGroupId,
        string expectedKind)
    {
        Assert.Equal(expectedKind, SourceRequestHandler.ClassifyDemandPollingGroupForLog(pollingGroupId));
    }
}
