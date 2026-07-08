using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class PawnIoDriverEvidenceTests
{
    [Fact]
    public void SuperIoSensorCountsAsEvidenceRegardlessOfValue()
    {
        // A SuperIO node exists only after a successful ring0 LPC probe, so its
        // presence is proof even when the individual sensor reads 0 (stopped fan).
        Assert.True(PawnIoDriverEvidence.IsDriverBackedSensorReading(
            FakeHardware.SuperIo(),
            FakeSensor.Voltage("Vcore", value: 0)));
    }

    [Fact]
    public void CpuTemperatureWithPositiveValueCountsAsEvidence()
    {
        Assert.True(PawnIoDriverEvidence.IsDriverBackedSensorReading(
            FakeHardware.Cpu(),
            FakeSensor.Temperature("Core (Tctl/Tdie)", value: 42)));
    }

    [Fact]
    public void CpuTemperatureAtZeroIsNotEvidence()
    {
        // 0 C is the sentinel LHM publishes when the ring0 read failed; a working
        // driver never reports a powered CPU at 0 C.
        Assert.False(PawnIoDriverEvidence.IsDriverBackedSensorReading(
            FakeHardware.Cpu(),
            FakeSensor.Temperature("Core (Tctl/Tdie)", value: 0)));
    }

    [Fact]
    public void CpuTemperatureWithoutValueIsNotEvidence()
    {
        // Intel writes null on a failed therm-status read.
        Assert.False(PawnIoDriverEvidence.IsDriverBackedSensorReading(
            FakeHardware.Cpu(),
            FakeSensor.Temperature("CPU Package", value: null)));
    }

    [Fact]
    public void CpuLoadIsNotEvidence()
    {
        // CPU load comes from performance counters with no driver dependency.
        Assert.False(PawnIoDriverEvidence.IsDriverBackedSensorReading(
            FakeHardware.Cpu(),
            FakeSensor.Load("CPU Total", value: 37)));
    }

    [Fact]
    public void CpuPowerIsNotEvidence()
    {
        // Package power is activated unconditionally in the LHM CPU constructor.
        Assert.False(PawnIoDriverEvidence.IsDriverBackedSensorReading(
            FakeHardware.Cpu(),
            FakeSensor.Power("Package", value: 65)));
    }

    [Fact]
    public void GpuTemperatureIsNotEvidence()
    {
        // GPU sensors come from NVML/ADL/DXGI and never use PawnIO.
        Assert.False(PawnIoDriverEvidence.IsDriverBackedSensorReading(
            FakeHardware.GpuNvidia(),
            FakeSensor.Temperature("GPU Core", value: 60)));
    }
}
