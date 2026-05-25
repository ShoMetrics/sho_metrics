using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class LibreHardwareComputerFactoryTests
{
    [Fact]
    public void CreateDisablesStorageByDefault()
    {
        Computer computer = LibreHardwareComputerFactory.Create();

        Assert.True(computer.IsCpuEnabled);
        Assert.True(computer.IsGpuEnabled);
        Assert.True(computer.IsMemoryEnabled);
        Assert.True(computer.IsMotherboardEnabled);
        Assert.True(computer.IsNetworkEnabled);
        Assert.False(computer.IsStorageEnabled);
    }

    [Fact]
    public void CreateForDiagnosticProbeEnablesStorage()
    {
        Computer computer = LibreHardwareComputerFactory.CreateForDiagnosticProbe();

        Assert.True(computer.IsStorageEnabled);
    }
}
