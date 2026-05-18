using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

internal static class LibreHardwareComputerFactory
{
    internal static Computer Create()
    {
        return new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsMotherboardEnabled = true,
            IsNetworkEnabled = true,
            IsStorageEnabled = true,
        };
    }
}
