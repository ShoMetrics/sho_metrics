using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class PawnIoDriverEvidenceTests
{
    [Fact]
    public void SuperIoDescriptorCountsAsEvidence()
    {
        HardwareMetricDescriptorSnapshot snapshot = BuildSnapshot(
            Descriptor(hardwareType: "SuperIO", unit: MetricUnit.RevolutionsPerMinute));

        Assert.True(PawnIoDriverEvidence.HasDriverBackedSensors(snapshot));
    }

    [Fact]
    public void CpuTemperatureDescriptorCountsAsEvidence()
    {
        HardwareMetricDescriptorSnapshot snapshot = BuildSnapshot(
            Descriptor(hardwareType: "Cpu", unit: MetricUnit.Celsius));

        Assert.True(PawnIoDriverEvidence.HasDriverBackedSensors(snapshot));
    }

    [Fact]
    public void CpuLoadDescriptorIsNotEvidence()
    {
        // CPU load comes from performance counters with no driver dependency.
        HardwareMetricDescriptorSnapshot snapshot = BuildSnapshot(
            Descriptor(hardwareType: "Cpu", unit: MetricUnit.Percent));

        Assert.False(PawnIoDriverEvidence.HasDriverBackedSensors(snapshot));
    }

    [Fact]
    public void GpuTemperatureDescriptorIsNotEvidence()
    {
        // GPU sensors come from NVML/ADL/DXGI and never use PawnIO.
        HardwareMetricDescriptorSnapshot snapshot = BuildSnapshot(
            Descriptor(hardwareType: "GpuNvidia", unit: MetricUnit.Celsius));

        Assert.False(PawnIoDriverEvidence.HasDriverBackedSensors(snapshot));
    }

    [Fact]
    public void EmptyCatalogIsNotEvidence()
    {
        HardwareMetricDescriptorSnapshot snapshot = BuildSnapshot();

        Assert.False(PawnIoDriverEvidence.HasDriverBackedSensors(snapshot));
    }

    private static HardwareMetricDescriptorSnapshot BuildSnapshot(params HardwareMetricDescriptor[] descriptors)
    {
        return new HardwareMetricDescriptorSnapshot
        {
            DescriptorFingerprint = "test",
            Descriptors = descriptors,
            Warnings = [],
        };
    }

    private static HardwareMetricDescriptor Descriptor(string hardwareType, MetricUnit unit)
    {
        return new HardwareMetricDescriptor
        {
            MetricId = $"{hardwareType}.metric",
            SourceSensorId = "sensor",
            PollingGroupId = "group",
            HardwareId = "hardware",
            HardwareName = hardwareType,
            HardwareType = hardwareType,
            SensorName = "sensor",
            SourceSensorType = "Temperature",
            ValueKind = MetricValueKind.Scalar,
            Unit = unit,
            MetricIdKind = MetricIdKind.SourceSensor,
        };
    }
}
