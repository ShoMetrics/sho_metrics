using System.Runtime.InteropServices;
using System.Runtime.Intrinsics.X86;
using System.Security.Principal;
using System.Text;
using LibreHardwareMonitor.PawnIo;

namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// A single Intel MSR read through the PawnIO ring0 module. Used only to enrich
/// the explanation on Intel machines that show no driver-backed sensors; it is a
/// substitution seam so the diagnostic logic can be tested without ring0 access.
/// </summary>
public interface IMsrProbe : IDisposable
{
    bool TryReadMsr(uint index, out uint eax, out uint edx);
}

/// <summary>
/// Ambient facts about PawnIO installation, privileges, and the host CPU that the
/// diagnostic reads. Wrapped behind an interface so tests can drive every vendor
/// and architecture path without real hardware.
/// </summary>
public interface IPawnIoEnvironment
{
    bool IsInstalled { get; }

    string? Version { get; }

    bool IsAdministrator { get; }

    PawnIoCpuVendor CpuVendor { get; }

    Architecture OsArchitecture { get; }

    IMsrProbe CreateMsrProbe();
}

public sealed class PawnIoEnvironment : IPawnIoEnvironment
{
    public bool IsInstalled => global::LibreHardwareMonitor.PawnIo.PawnIo.IsInstalled;

    public string? Version => global::LibreHardwareMonitor.PawnIo.PawnIo.Version?.ToString();

    // The kernel driver matches the OS bitness, so gate on the OS architecture
    // rather than the process architecture: an x64-emulated helper on an ARM64
    // host still cannot load a ring0 x86 driver.
    public Architecture OsArchitecture => RuntimeInformation.OSArchitecture;

    public bool IsAdministrator
    {
        get
        {
            if (!OperatingSystem.IsWindows())
            {
                return false;
            }

            using WindowsIdentity identity = WindowsIdentity.GetCurrent();
            WindowsPrincipal principal = new(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
    }

    public PawnIoCpuVendor CpuVendor => ReadCpuVendor();

    public IMsrProbe CreateMsrProbe()
    {
        return new IntelMsrProbe();
    }

    private static PawnIoCpuVendor ReadCpuVendor()
    {
        if (!X86Base.IsSupported)
        {
            return PawnIoCpuVendor.Unknown;
        }

        (int _, int ebx, int ecx, int edx) = X86Base.CpuId(0, 0);
        Span<byte> vendorBytes = stackalloc byte[12];
        BitConverter.TryWriteBytes(vendorBytes[..4], ebx);
        BitConverter.TryWriteBytes(vendorBytes[4..8], edx);
        BitConverter.TryWriteBytes(vendorBytes[8..], ecx);
        string vendor = Encoding.ASCII.GetString(vendorBytes);

        return vendor switch
        {
            "GenuineIntel" => PawnIoCpuVendor.Intel,
            "AuthenticAMD" => PawnIoCpuVendor.Amd,
            _ => PawnIoCpuVendor.Other,
        };
    }
}

internal sealed class IntelMsrProbe : IMsrProbe
{
    private readonly IntelMsr _intelMsr = new();

    public bool TryReadMsr(uint index, out uint eax, out uint edx)
    {
        return _intelMsr.ReadMsr(index, out eax, out edx);
    }

    public void Dispose()
    {
        _intelMsr.Close();
    }
}
