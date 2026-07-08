using LibreHardwareMonitor.Hardware;

namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Decides whether a live LHM sensor is one that only carries data when the
/// PawnIO ring0 driver is actually working. This is the vendor- and
/// architecture-neutral health signal for the PawnIO component: if the driver is
/// delivering the deep sensors the user installed it for, it is healthy, whatever
/// a vendor-specific register probe would report.
/// </summary>
public static class PawnIoDriverEvidence
{
    // Verified against the LibreHardwareMonitor source. Paths below are relative to
    // the LibreHardwareMonitorLib project root (/LibreHardwareMonitor).
    //
    // SuperIO: the SuperIO hardware node is enumerated only after a successful
    // ring0 LPC probe. Every LpcIo port/register read goes through the PawnIO
    // module (PawnIo/LpcIO.cs), and PawnIo.Execute returns all-zero on an unloaded
    // module (PawnIo/PawnIo.cs), so without a working driver the chip id reads back
    // as 0, matches no known SuperIO, and no node is created. Its mere presence
    // therefore proves the driver works, whatever the value of any single SuperIO
    // sensor (a stopped fan legitimately reads 0).
    //
    // CPU temperature: read through the ring0 driver (Intel MSR / AMD SMU), but
    // presence alone is NOT proof. Amd17Cpu.UpdateSensors (Hardware/Cpu/Amd17Cpu.cs)
    // calls ActivateSensor on the temperature sensor unconditionally, and
    // PawnIo.Execute returns all-zero (never throws) on an unloaded module
    // (PawnIo/PawnIo.cs), so a broken driver still surfaces a CPU temperature sensor
    // reading 0 C. Require a physically valid value: a powered CPU is never at 0 C,
    // and 0 is exactly the failed-read sentinel. IntelCpu.Update
    // (Hardware/Cpu/IntelCpu.cs) instead writes null on a failed therm-status read,
    // which also fails this check.
    // DIVERGENCE: this drops a genuine sub-zero reading (LN2 overclocking); that is
    // an accepted trade to stop every broken-driver machine from reading a fake 0 C.
    //
    // Do NOT count CPU load (performance counters, no driver), CPU power/clock
    // (activated unconditionally in the LHM CPU constructor), or any GPU sensor
    // (NVML/ADL/DXGI, never PawnIO): each would report a broken driver as healthy.
    public static bool IsDriverBackedSensorReading(IHardware hardware, ISensor sensor)
    {
        ArgumentNullException.ThrowIfNull(hardware);
        ArgumentNullException.ThrowIfNull(sensor);

        if (hardware.HardwareType == HardwareType.SuperIO)
        {
            return true;
        }

        return hardware.HardwareType == HardwareType.Cpu
            && sensor.SensorType == SensorType.Temperature
            && sensor.Value is float value
            && value > 0f;
    }
}
