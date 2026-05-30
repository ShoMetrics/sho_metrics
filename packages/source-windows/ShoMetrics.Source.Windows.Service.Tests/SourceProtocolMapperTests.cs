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
            BuildPawnIoDiagnostic(isInstalled: true, isAdministrator: true, version: "1.2.3"));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        Assert.Equal(WindowsSourceServiceConstants.PawnIoDriverComponentId, status.Component);
        Assert.Equal(SourceComponentState.Ok, status.State);
        Assert.Equal("1.2.3", status.Version);
        Assert.Empty(response.Warnings);
    }

    [Fact]
    public void BuildHealthResponseMapsPawnIoWarningsToUnusableComponent()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse(
            [],
            BuildPawnIoDiagnostic(
                isInstalled: true,
                isAdministrator: true,
                warnings: ["All MSR reads returned zero."]));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        SourceWarning warning = Assert.Single(response.Warnings);
        Assert.Equal(SourceComponentState.Unusable, status.State);
        Assert.Equal("pawnio_warning", warning.Code);
        Assert.Equal("All MSR reads returned zero.", warning.Message);
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
    public void BuildHealthResponseMapsPawnIoNotInstalledBeforePrivileges()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse(
            [],
            BuildPawnIoDiagnostic(isInstalled: false, isAdministrator: false));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        Assert.Equal(SourceComponentState.NotInstalled, status.State);
    }

    [Fact]
    public void BuildHealthResponseMapsPawnIoNotElevated()
    {
        SourceProtocolMapper mapper = new();

        GetSourceHealthResponse response = mapper.BuildHealthResponse(
            [],
            BuildPawnIoDiagnostic(isInstalled: true, isAdministrator: false));

        SourceComponentStatus status = Assert.Single(response.ComponentStatuses);
        Assert.Equal(SourceComponentState.NotElevated, status.State);
    }

    private static PawnIoDiagnostic BuildPawnIoDiagnostic(
        bool isInstalled,
        bool isAdministrator,
        string? version = null,
        IReadOnlyList<string>? warnings = null)
    {
        return new PawnIoDiagnostic
        {
            IsInstalled = isInstalled,
            IsAdministrator = isAdministrator,
            Version = version,
            MsrReads = [],
            Warnings = warnings ?? [],
        };
    }
}
