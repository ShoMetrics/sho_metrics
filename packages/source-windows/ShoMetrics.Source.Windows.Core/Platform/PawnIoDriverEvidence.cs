namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Decides whether the descriptor catalog contains sensors that only appear when
/// the PawnIO ring0 driver is delivering data. This is the vendor- and
/// architecture-neutral health signal for the PawnIO component: if the driver is
/// producing the deep sensors the user installed it for, it is healthy, whatever
/// a vendor-specific register probe would report.
/// </summary>
public static class PawnIoDriverEvidence
{
    // Verified against the LibreHardwareMonitor source. Only sensors that are
    // gated on the ring0 driver count as evidence, and the catalog only contains
    // activated sensors:
    // - SuperIO hardware is enumerated only when the ring0 LPC probe succeeds.
    // - CPU Temperature sensors are ActivateSensor'd only after a successful
    //   driver/SMU read (Hardware/Cpu/Amd17Cpu.cs), so a CPU temperature
    //   descriptor means the driver actually delivered a temperature.
    // Do NOT widen this to any CPU descriptor (CPU load comes from performance
    // counters), to CPU power/clock (activated unconditionally in the LHM CPU
    // constructor), or to any GPU sensor (GPU data comes from NVML/ADL/DXGI and
    // never uses PawnIO). Any of those would make a machine with a broken driver
    // report as healthy.
    private const string SuperIoHardwareType = "SuperIO";
    private const string CpuHardwareType = "Cpu";

    public static bool HasDriverBackedSensors(HardwareMetricDescriptorSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        foreach (HardwareMetricDescriptor descriptor in snapshot.Descriptors)
        {
            if (descriptor.HardwareType.Equals(SuperIoHardwareType, StringComparison.Ordinal))
            {
                return true;
            }

            if (descriptor.HardwareType.Equals(CpuHardwareType, StringComparison.Ordinal)
                && descriptor.Unit == MetricUnit.Celsius)
            {
                return true;
            }
        }

        return false;
    }
}
