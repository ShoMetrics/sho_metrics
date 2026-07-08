using System.Runtime.InteropServices;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Contracts;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service.Tests;

public sealed class SourceProtocolMapperTests
{
    [Fact]
    public void BuildHealthResponseMapsHealthyPawnIoDiagnostic()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse(
            [],
            BuildPawnIoDiagnostic(PawnIoHealthVerdict.Ok, version: "1.2.3"));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        Assert.Equal(WindowsSourceServiceConstants.PawnIoDriverComponentId, status.Component);
        Assert.Equal(SourceComponentState.Ok, status.State);
        Assert.Equal("1.2.3", status.Version);
        Assert.Empty(response.Warnings);
    }

    [Fact]
    public void BuildHealthResponseMapsUnusableVerdictWithWarnings()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse(
            [],
            BuildPawnIoDiagnostic(
                PawnIoHealthVerdict.Unusable,
                warnings: ["PawnIO is installed but no driver-backed sensors were found."]));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        SourceWarning warning = Assert.Single(response.Warnings);
        Assert.Equal(SourceComponentState.Unusable, status.State);
        Assert.Equal("pawnio_warning", warning.Code);
        Assert.Equal("PawnIO is installed but no driver-backed sensors were found.", warning.Message);
    }

    [Fact]
    public void BuildHealthResponseMapsNotSupportedVerdict()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse(
            [],
            BuildPawnIoDiagnostic(
                PawnIoHealthVerdict.NotSupported,
                warnings: ["PawnIO deep sensors are not supported on this CPU architecture."]));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        Assert.Equal(SourceComponentState.NotSupported, status.State);
        SourceWarning warning = Assert.Single(response.Warnings);
        Assert.Equal("pawnio_warning", warning.Code);
    }

    [Fact]
    public void BuildHealthResponseMapsMissingPawnIoDiagnosticToUnknownComponent()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse([], pawnIoDiagnostic: null);

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        Assert.Equal(WindowsSourceServiceConstants.PawnIoDriverComponentId, status.Component);
        Assert.Equal(SourceComponentState.Unknown, status.State);
        Assert.False(status.HasVersion);
    }

    [Fact]
    public void BuildHealthResponseMapsNotInstalledVerdict()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse(
            [],
            BuildPawnIoDiagnostic(PawnIoHealthVerdict.NotInstalled));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        Assert.Equal(SourceComponentState.NotInstalled, status.State);
        Assert.Empty(response.Warnings);
    }

    [Fact]
    public void BuildHealthResponseMapsNotElevatedVerdict()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse(
            [],
            BuildPawnIoDiagnostic(PawnIoHealthVerdict.NotElevated));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        Assert.Equal(SourceComponentState.NotElevated, status.State);
    }

    private static PawnIoDiagnostic BuildPawnIoDiagnostic(
        PawnIoHealthVerdict verdict,
        string? version = null,
        IReadOnlyList<string>? warnings = null)
    {
        return new PawnIoDiagnostic
        {
            IsInstalled = verdict is not PawnIoHealthVerdict.NotInstalled,
            IsAdministrator = verdict is not PawnIoHealthVerdict.NotElevated,
            Version = version,
            CpuVendor = PawnIoCpuVendor.Intel,
            OsArchitecture = Architecture.X64,
            HasDriverBackedEvidence = verdict is PawnIoHealthVerdict.Ok,
            Verdict = verdict,
            MsrReads = [],
            Warnings = warnings ?? [],
        };
    }
}
