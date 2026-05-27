using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

internal static class LibreHardwareComputerFactory
{
    internal static Computer Create()
    {
        return Create(enableStorage: false);
    }

    internal static Computer CreateForDiagnosticProbe()
    {
        return Create(enableStorage: true);
    }

    private static Computer Create(bool enableStorage)
    {
        return new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsMotherboardEnabled = true,
            IsNetworkEnabled = true,
            IsStorageEnabled = enableStorage,
        };
    }
}
