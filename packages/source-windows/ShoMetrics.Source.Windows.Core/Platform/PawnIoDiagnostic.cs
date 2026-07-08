using System.Runtime.InteropServices;

namespace ShoMetrics.Source.Windows.Core;

public sealed record PawnIoDiagnostic
{
    public required bool IsInstalled { get; init; }

    public required bool IsAdministrator { get; init; }

    public required string? Version { get; init; }

    public required PawnIoCpuVendor CpuVendor { get; init; }

    public required Architecture OsArchitecture { get; init; }

    /// <summary>
    /// True when the descriptor catalog contains sensors that only appear when
    /// the PawnIO ring0 driver is delivering data. This is the vendor- and
    /// architecture-neutral health signal, not a register probe result.
    /// </summary>
    public required bool HasDriverBackedEvidence { get; init; }

    public required PawnIoHealthVerdict Verdict { get; init; }

    public required IReadOnlyList<MsrReadDiagnostic> MsrReads { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }
}

public enum PawnIoCpuVendor
{
    Unknown,
    Intel,
    Amd,
    Other,
}

public enum PawnIoHealthVerdict
{
    Unknown,
    NotInstalled,
    NotElevated,

    /// <summary>
    /// PawnIO cannot be supported on this platform, for example a ring0 driver
    /// on a non-x86 CPU. Informational terminal state, not a fixable error.
    /// </summary>
    NotSupported,
    Ok,
    Unusable,
}

public sealed record MsrReadDiagnostic
{
    public required string Name { get; init; }

    public required uint Index { get; init; }

    public required bool ReadReturned { get; init; }

    public required uint Eax { get; init; }

    public required uint Edx { get; init; }
}
