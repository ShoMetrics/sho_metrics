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
            // LHM 0.9.6 can crash the process from its NetworkChange callback
            // when an interface disappears during sleep/resume. Upstream fixed
            // this in PR #2308 (commit 44c1ceb), but no NuGet release contains
            // it yet. Keep LHM network disabled until the package is upgraded;
            // hub network widgets use the node-system source instead.
            IsNetworkEnabled = false,
            IsStorageEnabled = enableStorage,
        };
    }
}
