using System.Security.Principal;
using LibreHardwareMonitor.PawnIo;

namespace ShoMetrics.Source.Windows.Core;

public sealed record PawnIoDiagnostic
{
    public required bool IsInstalled { get; init; }

    public required bool IsAdministrator { get; init; }

    public required string? Version { get; init; }

    public required IReadOnlyList<MsrReadDiagnostic> MsrReads { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }
}

public sealed record MsrReadDiagnostic
{
    public required string Name { get; init; }

    public required uint Index { get; init; }

    public required bool ReadReturned { get; init; }

    public required uint Eax { get; init; }

    public required uint Edx { get; init; }
}

public static class PawnIoDiagnostics
{
    private const uint Ia32ThermStatusMsr = 0x019C;
    private const uint Ia32PackageThermStatus = 0x1B1;
    private const uint Ia32TemperatureTarget = 0x01A2;
    private const uint MsrRaplPowerUnit = 0x606;

    public static PawnIoDiagnostic Read()
    {
        List<string> warnings = [];
        List<MsrReadDiagnostic> msrReads = [];

        IntelMsr intelMsr = new();
        try
        {
            msrReads.Add(ReadMsr(intelMsr, "IA32_THERM_STATUS_MSR", Ia32ThermStatusMsr));
            msrReads.Add(ReadMsr(intelMsr, "IA32_PACKAGE_THERM_STATUS", Ia32PackageThermStatus));
            msrReads.Add(ReadMsr(intelMsr, "IA32_TEMPERATURE_TARGET", Ia32TemperatureTarget));
            msrReads.Add(ReadMsr(intelMsr, "MSR_RAPL_POWER_UNIT", MsrRaplPowerUnit));
        }
        finally
        {
            intelMsr.Close();
        }

        bool isAdministrator = IsAdministrator();

        if (msrReads.All(read => read.ReadReturned && read.Eax == 0 && read.Edx == 0))
        {
            string reason = isAdministrator
                ? "PawnIO module load or execution likely failed silently."
                : "run this helper from an elevated administrator process to read MSR-backed CPU metrics.";
            warnings.Add($"All MSR reads returned zero; {reason}");
        }

        if (msrReads.Any(read => read.Name.Contains("THERM", StringComparison.Ordinal)
            && (read.Eax & 0x80000000) == 0))
        {
            warnings.Add("Thermal status valid bit is not set, so LibreHardwareMonitor will report CPU temperatures as null.");
        }

        return new PawnIoDiagnostic
        {
            IsInstalled = global::LibreHardwareMonitor.PawnIo.PawnIo.IsInstalled,
            IsAdministrator = isAdministrator,
            Version = global::LibreHardwareMonitor.PawnIo.PawnIo.Version?.ToString(),
            MsrReads = msrReads,
            Warnings = warnings,
        };
    }

    private static bool IsAdministrator()
    {
        if (!OperatingSystem.IsWindows())
        {
            return false;
        }

        using WindowsIdentity identity = WindowsIdentity.GetCurrent();
        WindowsPrincipal principal = new(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static MsrReadDiagnostic ReadMsr(IntelMsr intelMsr, string name, uint index)
    {
        bool readReturned = intelMsr.ReadMsr(index, out uint eax, out uint edx);
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
