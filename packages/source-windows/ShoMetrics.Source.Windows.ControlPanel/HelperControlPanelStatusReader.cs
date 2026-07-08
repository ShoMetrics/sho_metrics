using Grpc.Core;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal sealed class HelperControlPanelStatusReader : IDisposable
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromMilliseconds(800);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(3);

    private readonly IWindowsServiceStatusReader _serviceStatusReader;
    private readonly IHelperControlPanelSourceClient _sourceClient;

    /// <summary>
    /// Creates the default status reader for the local ShoMetrics Helper service.
    /// </summary>
    public HelperControlPanelStatusReader()
        : this(
            new WindowsServiceStatusReader(),
            new HelperControlPanelSourceClient(ConnectTimeout))
    {
    }

    internal HelperControlPanelStatusReader(
        IWindowsServiceStatusReader serviceStatusReader,
        IHelperControlPanelSourceClient sourceClient)
    {
        _serviceStatusReader = serviceStatusReader;
        _sourceClient = sourceClient;
    }

    /// <summary>
    /// Builds one normal-user Control Panel status snapshot from two sources:
    /// Windows service state from SCM and helper diagnostics from the read-only
    /// gRPC data plane. It does not probe drivers directly or perform repair.
    /// </summary>
    public async Task<HelperControlPanelStatus> ReadAsync(CancellationToken cancellationToken)
    {
        DateTimeOffset checkedAt = DateTimeOffset.Now;
        WindowsServiceStatusKind serviceStatus = _serviceStatusReader.ReadStatus();

        try
        {
            // TODO: If the control panel starts refreshing automatically, replace
            // these separate diagnostic requests with one batch status RPC.
            GetSourceHealthResponse health = await ReadHealthAsync(cancellationToken).ConfigureAwait(false);
            DiagnosticReadResult<ListMetricDescriptorsResponse> descriptors = await TryReadDiagnosticAsync(
                "Descriptor read failed",
                ReadDescriptorsAsync,
                cancellationToken).ConfigureAwait(false);
            DiagnosticReadResult<ReadMetricSnapshotResponse> snapshot = await TryReadDiagnosticAsync(
                "Snapshot read failed",
                ReadSnapshotAsync,
                cancellationToken).ConfigureAwait(false);

            List<string> warningMessages = [
                .. FormatWarnings(health.Warnings),
                .. FormatWarnings(descriptors.Response?.Warnings ?? []),
                .. FormatWarnings(snapshot.Response?.Warnings ?? []),
            ];
            List<string> errorMessages = [];
            if (descriptors.ErrorText is not null)
            {
                errorMessages.Add(descriptors.ErrorText);
            }

            if (snapshot.ErrorText is not null)
            {
                errorMessages.Add(snapshot.ErrorText);
            }

            DateTimeOffset? sampleCapturedAt = snapshot.Response?.Snapshot?.CapturedAt?.ToDateTimeOffset();
            ServiceTileText serviceTile = ResolveServiceTileText(serviceStatus, helperRequestException: null);
            PawnIoDriverTileText pawnIoDriverTile = ResolvePawnIoDriverTileText(
                health.ComponentStatuses,
                serviceStatus,
                helperRequestException: null);
            string lastSampleText = snapshot.Response is null
                ? "Unknown"
                : HelperControlPanelStatus.FormatSampleAge(sampleCapturedAt, checkedAt);
            string descriptorCountText = descriptors.Response is null
                ? "Unknown"
                : descriptors.Response.DescriptorSnapshot?.Descriptors.Count.ToString() ?? "0";

            return new HelperControlPanelStatus
            {
                CheckedAt = checkedAt,
                Service = BuildServicePanelStatus(
                    serviceTile,
                    serviceStatus,
                    connectionText: errorMessages.Count == 0 ? "Connected" : "Connected with errors"),
                PawnIoDriver = BuildPawnIoDriverPanelStatus(pawnIoDriverTile),
                Diagnostics = new HelperDiagnosticsPanelStatus
                {
                    HelperVersionText = string.IsNullOrWhiteSpace(health.HelperVersion) ? "Unknown" : health.HelperVersion,
                    ProtocolVersionText = string.IsNullOrWhiteSpace(health.ProtocolVersion) ? "Unknown" : health.ProtocolVersion,
                    LastSampleText = lastSampleText,
                    DescriptorCountText = descriptorCountText,
                    SensorDiagnosticsText = FormatSensorDiagnosticsText(lastSampleText, descriptorCountText),
                    WarningCountText = FormatWarningCount(warningMessages.Count),
                    DetailText = FormatDiagnosticsDetail(warningMessages.Count, errorMessages.Count),
                    Tone = ResolveDiagnosticsStatusTone(warningMessages.Count, errorMessages.Count),
                    HasDetails = HasDiagnosticsDetails(warningMessages.Count, errorMessages.Count),
                    WarningDetailsText = warningMessages.Count == 0
                        ? "No warnings."
                        : string.Join(Environment.NewLine, warningMessages),
                },
                ErrorText = string.Join(Environment.NewLine, errorMessages),
            };
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            ServiceTileText serviceTile = ResolveServiceTileText(serviceStatus, exception);
            PawnIoDriverTileText pawnIoDriverTile = ResolvePawnIoDriverTileText(
                [],
                serviceStatus,
                exception);

            return new HelperControlPanelStatus
            {
                CheckedAt = checkedAt,
                Service = BuildServicePanelStatus(
                    serviceTile,
                    serviceStatus,
                    connectionText: "Failed"),
                PawnIoDriver = BuildPawnIoDriverPanelStatus(pawnIoDriverTile),
                Diagnostics = new HelperDiagnosticsPanelStatus
                {
                    HelperVersionText = "Unknown",
                    ProtocolVersionText = "Unknown",
                    LastSampleText = "No sample",
                    DescriptorCountText = "Unknown",
                    SensorDiagnosticsText = FormatSensorDiagnosticsText("No sample", "Unknown"),
                    WarningCountText = "Unknown",
                    DetailText = "Could not read diagnostics.",
                    Tone = ControlPanelStatusTone.Unknown,
                    HasDetails = true,
                    WarningDetailsText = "No warnings.",
                },
                ErrorText = FormatHelperRequestError(exception),
            };
        }
    }

    private async Task<GetSourceHealthResponse> ReadHealthAsync(CancellationToken cancellationToken)
    {
        return await _sourceClient
            .GetSourceHealthAsync(RequestTimeout, cancellationToken)
            .ConfigureAwait(false);
    }

    private async Task<ListMetricDescriptorsResponse> ReadDescriptorsAsync(CancellationToken cancellationToken)
    {
        return await _sourceClient
            .ListMetricDescriptorsAsync(RequestTimeout, cancellationToken)
            .ConfigureAwait(false);
    }

    private async Task<ReadMetricSnapshotResponse> ReadSnapshotAsync(CancellationToken cancellationToken)
    {
        return await _sourceClient
            .ReadMetricSnapshotAsync(RequestTimeout, cancellationToken)
            .ConfigureAwait(false);
    }

    private static async Task<DiagnosticReadResult<TResponse>> TryReadDiagnosticAsync<TResponse>(
        string failurePrefix,
        Func<CancellationToken, Task<TResponse>> readAsync,
        CancellationToken cancellationToken)
        where TResponse : class
    {
        try
        {
            TResponse response = await readAsync(cancellationToken).ConfigureAwait(false);
            return new DiagnosticReadResult<TResponse>(response, ErrorText: null);
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            return new DiagnosticReadResult<TResponse>(
                Response: null,
                ErrorText: $"{failurePrefix}: {FormatHelperRequestError(exception)}");
        }
    }

    private static IEnumerable<string> FormatWarnings(IEnumerable<SourceWarning> warnings)
    {
        foreach (SourceWarning warning in warnings)
        {
            string code = string.IsNullOrWhiteSpace(warning.Code) ? "warning" : warning.Code;
            string message = string.IsNullOrWhiteSpace(warning.Message) ? "No message." : warning.Message;

            yield return $"{code}: {message}";
        }
    }

    private static string FormatServiceInstallStatus(WindowsServiceStatusKind serviceStatus)
    {
        return serviceStatus == WindowsServiceStatusKind.NotInstalled ? "Not installed" : "Installed";
    }

    private static string FormatServiceRuntimeStatus(WindowsServiceStatusKind serviceStatus)
    {
        return serviceStatus switch
        {
            WindowsServiceStatusKind.NotInstalled => "Not installed",
            WindowsServiceStatusKind.Running => "Running",
            WindowsServiceStatusKind.StartPending => "Starting",
            WindowsServiceStatusKind.StopPending => "Stopping",
            WindowsServiceStatusKind.Stopped => "Not running",
            WindowsServiceStatusKind.Paused => "Paused",
            WindowsServiceStatusKind.ContinuePending => "Continuing",
            WindowsServiceStatusKind.PausePending => "Pausing",
            WindowsServiceStatusKind.QueryFailed => "Unknown",
            _ => "Unknown",
        };
    }

    private static HelperServicePanelStatus BuildServicePanelStatus(
        ServiceTileText tileText,
        WindowsServiceStatusKind serviceStatus,
        string connectionText)
    {
        return new HelperServicePanelStatus
        {
            StatusText = tileText.StatusText,
            DetailText = tileText.DetailText,
            Tone = tileText.Tone,
            CanInstallShoMetricsHelper = tileText.CanInstallShoMetricsHelper,
            CanStartBackgroundService = tileText.CanStartBackgroundService,
            InstallText = FormatServiceInstallStatus(serviceStatus),
            RuntimeText = FormatServiceRuntimeStatus(serviceStatus),
            ConnectionText = connectionText,
        };
    }

    private static PawnIoDriverPanelStatus BuildPawnIoDriverPanelStatus(PawnIoDriverTileText tileText)
    {
        return new PawnIoDriverPanelStatus
        {
            StatusText = tileText.StatusText,
            DetailText = tileText.DetailText,
            Tone = tileText.Tone,
            CanInstallPawnIoDriver = tileText.CanInstallPawnIoDriver,
        };
    }

    private static ServiceTileText ResolveServiceTileText(
        WindowsServiceStatusKind serviceStatus,
        Exception? helperRequestException)
    {
        if (helperRequestException is RpcException { StatusCode: StatusCode.Unimplemented })
        {
            return new ServiceTileText(
                StatusText: "Update required",
                DetailText: "Update ShoMetrics Helper and Hub to the latest version.",
                Tone: ControlPanelStatusTone.Critical,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false);
        }

        return serviceStatus switch
        {
            WindowsServiceStatusKind.NotInstalled => new ServiceTileText(
                StatusText: "Not installed",
                DetailText: "Installation did not complete. Restart your PC or reinstall ShoMetrics Helper.",
                Tone: ControlPanelStatusTone.Critical,
                CanInstallShoMetricsHelper: true,
                CanStartBackgroundService: false),
            WindowsServiceStatusKind.Stopped => new ServiceTileText(
                StatusText: "Not started",
                DetailText: "The background service is not running.",
                Tone: ControlPanelStatusTone.Critical,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: true),
            WindowsServiceStatusKind.StartPending => new ServiceTileText(
                StatusText: "Starting",
                DetailText: "Waiting for ShoMetrics Helper to become available.",
                Tone: ControlPanelStatusTone.Caution,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false),
            WindowsServiceStatusKind.StopPending => new ServiceTileText(
                StatusText: "Stopping",
                DetailText: "Waiting for ShoMetrics Helper to stop.",
                Tone: ControlPanelStatusTone.Caution,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false),
            WindowsServiceStatusKind.Running when helperRequestException is null => new ServiceTileText(
                StatusText: "Connected",
                DetailText: "ShoMetrics Helper is running.",
                Tone: ControlPanelStatusTone.Success,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false),
            WindowsServiceStatusKind.Running => new ServiceTileText(
                StatusText: "Connection error",
                DetailText: "Could not connect to ShoMetrics Helper. Restart ShoMetrics Helper, then open logs if it keeps failing.",
                Tone: ControlPanelStatusTone.Critical,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false),
            WindowsServiceStatusKind.Paused => new ServiceTileText(
                StatusText: "Paused",
                DetailText: "Resume ShoMetrics Helper to check sensors and drivers.",
                Tone: ControlPanelStatusTone.Unknown,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false),
            WindowsServiceStatusKind.ContinuePending => new ServiceTileText(
                StatusText: "Starting",
                DetailText: "Waiting for ShoMetrics Helper to become available.",
                Tone: ControlPanelStatusTone.Caution,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false),
            WindowsServiceStatusKind.PausePending => new ServiceTileText(
                StatusText: "Pausing",
                DetailText: "Waiting for ShoMetrics Helper to pause.",
                Tone: ControlPanelStatusTone.Caution,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false),
            _ => new ServiceTileText(
                StatusText: "Unknown",
                DetailText: "Could not read ShoMetrics Helper status.",
                Tone: ControlPanelStatusTone.Unknown,
                CanInstallShoMetricsHelper: false,
                CanStartBackgroundService: false),
        };
    }

    private static PawnIoDriverTileText ResolvePawnIoDriverTileText(
        IEnumerable<SourceComponentStatus> componentStatuses,
        WindowsServiceStatusKind serviceStatus,
        Exception? helperRequestException)
    {
        // The Control Panel runs as a normal-user status surface. It does not
        // probe PawnIO directly; driver state is checked only when the service
        // is reachable enough to report SourceComponentStatus.
        if (helperRequestException is not null)
        {
            return new PawnIoDriverTileText(
                StatusText: "Not checked",
                DetailText: ResolvePawnIoNotCheckedDetailText(serviceStatus),
                Tone: ControlPanelStatusTone.Unknown,
                CanInstallPawnIoDriver: false);
        }

        SourceComponentStatus? pawnIoStatus = componentStatuses.FirstOrDefault(status =>
            string.Equals(
                status.Component,
                WindowsSourceServiceConstants.PawnIoDriverComponentId,
                StringComparison.Ordinal));

        if (pawnIoStatus is null)
        {
            return new PawnIoDriverTileText(
                StatusText: "Unknown",
                DetailText: "Update ShoMetrics Helper to the latest version if driver diagnostics are unavailable.",
                Tone: ControlPanelStatusTone.Unknown,
                CanInstallPawnIoDriver: false);
        }

        PawnIoDriverTileText tileText = pawnIoStatus.State switch
        {
            SourceComponentState.Ok => new PawnIoDriverTileText(
                StatusText: "Installed",
                DetailText: "Required for temperature and power sensors.",
                Tone: ControlPanelStatusTone.Success,
                CanInstallPawnIoDriver: false),
            SourceComponentState.NotInstalled => new PawnIoDriverTileText(
                StatusText: "Not installed",
                DetailText: "Install PawnIO to enable temperature and power sensors.",
                Tone: ControlPanelStatusTone.Critical,
                CanInstallPawnIoDriver: true),
            SourceComponentState.NotElevated => new PawnIoDriverTileText(
                StatusText: "Not elevated",
                DetailText: "Restart or reinstall ShoMetrics Helper to restore the privileges required for PawnIO.",
                Tone: ControlPanelStatusTone.Caution,
                CanInstallPawnIoDriver: false),
            SourceComponentState.Unusable => new PawnIoDriverTileText(
                StatusText: "Needs attention",
                DetailText: "PawnIO returned no sensor data. A restart may help, or your device may only be partially supported by ShoMetrics. Open logs for details.",
                Tone: ControlPanelStatusTone.Caution,
                CanInstallPawnIoDriver: false),
            SourceComponentState.NotSupported => new PawnIoDriverTileText(
                StatusText: "Not supported",
                DetailText: "Deep sensors are not available on this CPU architecture.",
                Tone: ControlPanelStatusTone.Unknown,
                CanInstallPawnIoDriver: false),
            SourceComponentState.Unknown => new PawnIoDriverTileText(
                StatusText: "Unknown",
                DetailText: "ShoMetrics Helper could not determine PawnIO status.",
                Tone: ControlPanelStatusTone.Unknown,
                CanInstallPawnIoDriver: false),
            SourceComponentState.Unspecified => new PawnIoDriverTileText(
                StatusText: "Unknown",
                DetailText: "ShoMetrics Helper reported an unexpected PawnIO status. Update ShoMetrics Helper.",
                Tone: ControlPanelStatusTone.Unknown,
                CanInstallPawnIoDriver: false),
            _ => new PawnIoDriverTileText(
                StatusText: "Unknown",
                DetailText: "ShoMetrics Helper could not determine PawnIO status.",
                Tone: ControlPanelStatusTone.Unknown,
                CanInstallPawnIoDriver: false),
        };

        return string.IsNullOrWhiteSpace(pawnIoStatus.Version) || !CanShowPawnIoVersion(pawnIoStatus.State)
            ? tileText
            : tileText with { StatusText = $"{tileText.StatusText} ({pawnIoStatus.Version})" };
    }

    private static bool CanShowPawnIoVersion(SourceComponentState state)
    {
        return state is SourceComponentState.Ok
            or SourceComponentState.NotElevated
            or SourceComponentState.Unusable;
    }

    private static string ResolvePawnIoNotCheckedDetailText(WindowsServiceStatusKind serviceStatus)
    {
        return serviceStatus switch
        {
            WindowsServiceStatusKind.NotInstalled =>
                "PawnIO status cannot be checked until ShoMetrics Helper is installed and running.",
            WindowsServiceStatusKind.Running =>
                "PawnIO status cannot be checked until the panel can connect to ShoMetrics Helper.",
            _ => "PawnIO status cannot be checked until ShoMetrics Helper is running.",
        };
    }

    private static string FormatSensorDiagnosticsText(string lastSampleText, string descriptorCountText)
    {
        return $"Last sample when checked: {lastSampleText}. Metrics discovered: {descriptorCountText}.";
    }

    private static string FormatWarningCount(int warningCount)
    {
        return warningCount switch
        {
            0 => "No warnings",
            1 => "1 warning",
            _ => $"{warningCount} warnings",
        };
    }

    private static string FormatDiagnosticsDetail(int warningCount, int errorCount)
    {
        if (errorCount > 0)
        {
            return "Some diagnostic reads failed. Copy diagnostics or open logs for support details.";
        }

        return warningCount == 0
            ? "No warnings were reported at the last refresh."
            : "Copy diagnostics or open logs for support details.";
    }

    private static ControlPanelStatusTone ResolveDiagnosticsStatusTone(int warningCount, int errorCount)
    {
        return warningCount == 0 && errorCount == 0
            ? ControlPanelStatusTone.Success
            : ControlPanelStatusTone.Caution;
    }

    private static bool HasDiagnosticsDetails(int warningCount, int errorCount)
    {
        return warningCount > 0 || errorCount > 0;
    }

    /// <summary>
    /// Releases the gRPC client and any disposable service status reader owned by this reader.
    /// </summary>
    public void Dispose()
    {
        _sourceClient.Dispose();
        (_serviceStatusReader as IDisposable)?.Dispose();
    }

    private static string FormatHelperRequestError(Exception exception)
    {
        return exception switch
        {
            RpcException rpcException => FormatGrpcError(rpcException),
            OperationCanceledException => "Connection timed out. ShoMetrics Helper may be stopped or still starting.",
            _ => HelperControlPanelStatus.FormatException(exception),
        };
    }

    private static string FormatGrpcError(RpcException exception)
    {
        string detail = string.IsNullOrWhiteSpace(exception.Status.Detail)
            ? exception.Message
            : exception.Status.Detail;

        return exception.StatusCode switch
        {
            StatusCode.Unavailable => $"Could not connect to ShoMetrics Helper: {detail}",
            StatusCode.DeadlineExceeded => $"ShoMetrics Helper did not respond in time: {detail}",
            StatusCode.Unimplemented => $"Update ShoMetrics Helper and Hub to the latest version: {detail}",
            StatusCode.FailedPrecondition => $"ShoMetrics Helper cannot complete this request yet: {detail}",
            StatusCode.InvalidArgument => $"Update ShoMetrics Helper and Hub to the latest version: {detail}",
            _ => $"ShoMetrics Helper request failed ({exception.StatusCode}): {detail}",
        };
    }

    private readonly record struct DiagnosticReadResult<TResponse>(
        TResponse? Response,
        string? ErrorText)
        where TResponse : class;

    private readonly record struct ServiceTileText(
        string StatusText,
        string DetailText,
        ControlPanelStatusTone Tone,
        bool CanInstallShoMetricsHelper,
        bool CanStartBackgroundService);

    private readonly record struct PawnIoDriverTileText(
        string StatusText,
        string DetailText,
        ControlPanelStatusTone Tone,
        bool CanInstallPawnIoDriver);
}
