using System.Runtime.InteropServices;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Core.Tests;

public sealed class PawnIoDiagnosticsTests
{
    [Fact]
    public void AmdWithEvidenceIsOkAndNeverProbesMsr()
    {
        FakePawnIoEnvironment environment = new()
        {
            IsInstalled = true,
            IsAdministrator = true,
            CpuVendor = PawnIoCpuVendor.Amd,
            OsArchitecture = Architecture.X64,
        };

        PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read(environment, hasDriverBackedEvidence: true);

        Assert.Equal(PawnIoHealthVerdict.Ok, diagnostic.Verdict);
        Assert.Empty(diagnostic.Warnings);
        Assert.Empty(diagnostic.MsrReads);
        Assert.Equal(0, environment.MsrProbeCreatedCount);
    }

    [Fact]
    public void AmdWithoutEvidenceIsUnusableWithoutMsrDetail()
    {
        FakePawnIoEnvironment environment = new()
        {
            IsInstalled = true,
            IsAdministrator = true,
            CpuVendor = PawnIoCpuVendor.Amd,
            OsArchitecture = Architecture.X64,
        };

        PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read(environment, hasDriverBackedEvidence: false);

        Assert.Equal(PawnIoHealthVerdict.Unusable, diagnostic.Verdict);
        Assert.NotEmpty(diagnostic.Warnings);
        Assert.Empty(diagnostic.MsrReads);
        Assert.Equal(0, environment.MsrProbeCreatedCount);
    }

    [Fact]
    public void IntelWithoutEvidenceAddsMsrDetailAndDisposesProbe()
    {
        FakePawnIoEnvironment environment = new()
        {
            IsInstalled = true,
            IsAdministrator = true,
            CpuVendor = PawnIoCpuVendor.Intel,
            OsArchitecture = Architecture.X64,
            MsrProbe = FakeMsrProbe.AllZero(),
        };

        PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read(environment, hasDriverBackedEvidence: false);

        Assert.Equal(PawnIoHealthVerdict.Unusable, diagnostic.Verdict);
        Assert.Equal(4, diagnostic.MsrReads.Count);
        Assert.Equal(1, environment.MsrProbeCreatedCount);
        Assert.True(environment.LastMsrProbe!.IsDisposed);
        Assert.Contains(diagnostic.Warnings, warning => warning.Contains("MSR", StringComparison.Ordinal));
    }

    [Fact]
    public void IntelWithEvidenceIsOkEvenThoughMsrWouldWarn()
    {
        FakePawnIoEnvironment environment = new()
        {
            IsInstalled = true,
            IsAdministrator = true,
            CpuVendor = PawnIoCpuVendor.Intel,
            OsArchitecture = Architecture.X64,
            MsrProbe = FakeMsrProbe.AllZero(),
        };

        PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read(environment, hasDriverBackedEvidence: true);

        Assert.Equal(PawnIoHealthVerdict.Ok, diagnostic.Verdict);
        Assert.Empty(diagnostic.Warnings);
        Assert.Equal(0, environment.MsrProbeCreatedCount);
    }

    [Fact]
    public void NonX86IsNotSupportedAndNeverProbesMsr()
    {
        FakePawnIoEnvironment environment = new()
        {
            IsInstalled = true,
            IsAdministrator = true,
            CpuVendor = PawnIoCpuVendor.Unknown,
            OsArchitecture = Architecture.Arm64,
            MsrProbe = FakeMsrProbe.AllZero(),
        };

        PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read(environment, hasDriverBackedEvidence: false);

        Assert.Equal(PawnIoHealthVerdict.NotSupported, diagnostic.Verdict);
        Assert.Single(diagnostic.Warnings);
        Assert.Empty(diagnostic.MsrReads);
        Assert.Equal(0, environment.MsrProbeCreatedCount);
    }

    [Fact]
    public void NotInstalledHasNoWarnings()
    {
        FakePawnIoEnvironment environment = new()
        {
            IsInstalled = false,
            IsAdministrator = true,
            CpuVendor = PawnIoCpuVendor.Intel,
            OsArchitecture = Architecture.X64,
        };

        PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read(environment, hasDriverBackedEvidence: false);

        Assert.Equal(PawnIoHealthVerdict.NotInstalled, diagnostic.Verdict);
        Assert.Empty(diagnostic.Warnings);
        Assert.Equal(0, environment.MsrProbeCreatedCount);
    }

    [Fact]
    public void NotElevatedHasNoWarnings()
    {
        FakePawnIoEnvironment environment = new()
        {
            IsInstalled = true,
            IsAdministrator = false,
            CpuVendor = PawnIoCpuVendor.Intel,
            OsArchitecture = Architecture.X64,
        };

        PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read(environment, hasDriverBackedEvidence: false);

        Assert.Equal(PawnIoHealthVerdict.NotElevated, diagnostic.Verdict);
        Assert.Empty(diagnostic.Warnings);
        Assert.Equal(0, environment.MsrProbeCreatedCount);
    }

    private sealed class FakePawnIoEnvironment : IPawnIoEnvironment
    {
        public bool IsInstalled { get; init; }

        public string? Version { get; init; }

        public bool IsAdministrator { get; init; }

        public PawnIoCpuVendor CpuVendor { get; init; }

        public Architecture OsArchitecture { get; init; }

        public FakeMsrProbe? MsrProbe { get; init; }

        public int MsrProbeCreatedCount { get; private set; }

        public FakeMsrProbe? LastMsrProbe { get; private set; }

        public IMsrProbe CreateMsrProbe()
        {
            MsrProbeCreatedCount++;
            FakeMsrProbe probe = MsrProbe ?? FakeMsrProbe.AllZero();
            LastMsrProbe = probe;
            return probe;
        }
    }

    private sealed class FakeMsrProbe : IMsrProbe
    {
        private readonly uint _eax;
        private readonly uint _edx;
        private readonly bool _readReturns;

        private FakeMsrProbe(bool readReturns, uint eax, uint edx)
        {
            _readReturns = readReturns;
            _eax = eax;
            _edx = edx;
        }

        public bool IsDisposed { get; private set; }

        public static FakeMsrProbe AllZero()
        {
            return new FakeMsrProbe(readReturns: true, eax: 0, edx: 0);
        }

        public bool TryReadMsr(uint index, out uint eax, out uint edx)
        {
            eax = _eax;
            edx = _edx;
            return _readReturns;
        }

        public void Dispose()
        {
            IsDisposed = true;
        }
    }
}
