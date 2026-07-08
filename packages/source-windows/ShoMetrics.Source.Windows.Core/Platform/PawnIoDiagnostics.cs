using System.Runtime.InteropServices;

namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Produces the PawnIO health diagnostic. The verdict is driven by whether the
/// descriptor catalog actually contains driver-backed sensors, not by probing
/// vendor-specific registers, so it behaves correctly on Intel, AMD, and non-x86
/// hosts alike. A register probe runs only to explain an Intel machine that shows
/// no driver-backed sensors, and never as the verdict itself.
/// </summary>
public static class PawnIoDiagnostics
{
    private const uint Ia32ThermStatusMsr = 0x019C;
    private const uint Ia32PackageThermStatus = 0x1B1;
    private const uint Ia32TemperatureTarget = 0x01A2;
    private const uint MsrRaplPowerUnit = 0x606;

    private const string NotSupportedWarning =
        "PawnIO deep sensors are not supported on this CPU architecture.";

    private const string UnusableWarning =
        "PawnIO is installed but returned no sensor data, which can mean a restart is pending or that your device is only partially supported by ShoMetrics. Open logs for details.";

    private const string IntelMsrZeroWarning =
        "Intel MSR reads returned zero: the PawnIO module failed to load, or your device is only partially supported by ShoMetrics. Open logs for details.";

    public static PawnIoDiagnostic Read(IPawnIoEnvironment environment, bool hasDriverBackedEvidence)
    {
        ArgumentNullException.ThrowIfNull(environment);

        bool isInstalled = environment.IsInstalled;
        bool isAdministrator = environment.IsAdministrator;
        PawnIoCpuVendor cpuVendor = environment.CpuVendor;
        Architecture osArchitecture = environment.OsArchitecture;

        List<string> warnings = [];
        List<MsrReadDiagnostic> msrReads = [];
        PawnIoHealthVerdict verdict = Evaluate(
            environment,
            isInstalled,
            isAdministrator,
            cpuVendor,
            osArchitecture,
            hasDriverBackedEvidence,
            warnings,
            msrReads);

        return new PawnIoDiagnostic
        {
            IsInstalled = isInstalled,
            IsAdministrator = isAdministrator,
            Version = environment.Version,
            CpuVendor = cpuVendor,
            OsArchitecture = osArchitecture,
            HasDriverBackedEvidence = hasDriverBackedEvidence,
            Verdict = verdict,
            MsrReads = msrReads,
            Warnings = warnings,
        };
    }

    private static PawnIoHealthVerdict Evaluate(
        IPawnIoEnvironment environment,
        bool isInstalled,
        bool isAdministrator,
        PawnIoCpuVendor cpuVendor,
        Architecture osArchitecture,
        bool hasDriverBackedEvidence,
        List<string> warnings,
        List<MsrReadDiagnostic> msrReads)
    {
        if (!isInstalled)
        {
            return PawnIoHealthVerdict.NotInstalled;
        }

        if (!isAdministrator)
        {
            return PawnIoHealthVerdict.NotElevated;
        }

        if (!IsX86Architecture(osArchitecture))
        {
            warnings.Add(NotSupportedWarning);
            return PawnIoHealthVerdict.NotSupported;
        }

        if (hasDriverBackedEvidence)
        {
            // The driver is delivering the deep sensors the user installed it
            // for. Report OK even if an Intel register probe would have warned;
            // the observed outcome is the authority.
            return PawnIoHealthVerdict.Ok;
        }

        warnings.Add(UnusableWarning);

        // The Intel MSR probe loads an Intel-only PawnIO module that legitimately
        // returns nothing on AMD or other vendors, so run it only on Intel and
        // only to explain the unusable verdict, never to decide it.
        if (cpuVendor == PawnIoCpuVendor.Intel)
        {
            AddIntelMsrDetail(environment, warnings, msrReads);
        }

        return PawnIoHealthVerdict.Unusable;
    }

    private static void AddIntelMsrDetail(
        IPawnIoEnvironment environment,
        List<string> warnings,
        List<MsrReadDiagnostic> msrReads)
    {
        using IMsrProbe probe = environment.CreateMsrProbe();
        msrReads.Add(ReadMsr(probe, "IA32_THERM_STATUS_MSR", Ia32ThermStatusMsr));
        msrReads.Add(ReadMsr(probe, "IA32_PACKAGE_THERM_STATUS", Ia32PackageThermStatus));
        msrReads.Add(ReadMsr(probe, "IA32_TEMPERATURE_TARGET", Ia32TemperatureTarget));
        msrReads.Add(ReadMsr(probe, "MSR_RAPL_POWER_UNIT", MsrRaplPowerUnit));

        if (msrReads.All(read => read.ReadReturned && read.Eax == 0 && read.Edx == 0))
        {
            warnings.Add(IntelMsrZeroWarning);
        }
    }

    private static bool IsX86Architecture(Architecture architecture)
    {
        return architecture is Architecture.X86 or Architecture.X64;
    }

    private static MsrReadDiagnostic ReadMsr(IMsrProbe probe, string name, uint index)
    {
        bool readReturned = probe.TryReadMsr(index, out uint eax, out uint edx);
        return new MsrReadDiagnostic
        {
            Name = name,
            Index = index,
            ReadReturned = readReturned,
            Eax = eax,
            Edx = edx,
        };
    }
}
