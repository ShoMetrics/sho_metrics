using Grpc.Core;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal sealed class HelperControlPanelStatusReader : IDisposable
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromMilliseconds(800);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(3);

    private readonly IWindowsServiceStatusReader _serviceStatusReader;
    private readonly IHelperControlPanelSourceClient _sourceClient;

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

            return new HelperControlPanelStatus
            {
                CheckedAt = checkedAt,
                ServiceStatusText = FormatServiceStatus(serviceStatus),
                ServiceInstallText = FormatServiceInstallStatus(serviceStatus),
                ServiceRuntimeText = FormatServiceRuntimeStatus(serviceStatus),
                ConnectionStatusText = errorMessages.Count == 0 ? "Connected" : "Connected with errors",
                PawnIoDriverText = ResolvePawnIoDriverText(warningMessages),
                HelperVersionText = string.IsNullOrWhiteSpace(health.HelperVersion) ? "Unknown" : health.HelperVersion,
                ProtocolVersionText = string.IsNullOrWhiteSpace(health.ProtocolVersion) ? "Unknown" : health.ProtocolVersion,
                LastSampleText = snapshot.Response is null
                    ? "Unknown"
                    : HelperControlPanelStatus.FormatSampleAge(sampleCapturedAt, checkedAt),
                DescriptorCountText = descriptors.Response is null
                    ? "Unknown"
                    : descriptors.Response.DescriptorSnapshot?.Descriptors.Count.ToString() ?? "0",
                WarningCountText = warningMessages.Count.ToString(),
                WarningDetailsText = warningMessages.Count == 0
                    ? "No warnings."
                    : string.Join(Environment.NewLine, warningMessages),
                ErrorText = string.Join(Environment.NewLine, errorMessages),
            };
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            return new HelperControlPanelStatus
            {
                CheckedAt = checkedAt,
                ServiceStatusText = FormatServiceStatus(serviceStatus),
                ServiceInstallText = FormatServiceInstallStatus(serviceStatus),
                ServiceRuntimeText = FormatServiceRuntimeStatus(serviceStatus),
                ConnectionStatusText = "Failed",
                PawnIoDriverText = "Unknown",
                HelperVersionText = "Unknown",
                ProtocolVersionText = "Unknown",
                LastSampleText = "No sample",
                DescriptorCountText = "Unknown",
                WarningCountText = "Unknown",
                WarningDetailsText = "No warnings.",
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

    private static string FormatServiceStatus(WindowsServiceStatusKind serviceStatus)
    {
        return serviceStatus switch
        {
            WindowsServiceStatusKind.NotInstalled => "Not installed",
            WindowsServiceStatusKind.Stopped => "Stopped",
            WindowsServiceStatusKind.StartPending => "Starting",
            WindowsServiceStatusKind.StopPending => "Stopping",
            WindowsServiceStatusKind.Running => "Running",
            WindowsServiceStatusKind.ContinuePending => "Continuing",
            WindowsServiceStatusKind.PausePending => "Pausing",
            WindowsServiceStatusKind.Paused => "Paused",
            WindowsServiceStatusKind.QueryFailed => "Unknown",
            _ => "Unknown",
        };
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

    private static string ResolvePawnIoDriverText(IReadOnlyCollection<string> warningMessages)
    {
        foreach (string warningMessage in warningMessages)
        {
            if (warningMessage.Contains("PawnIO", StringComparison.OrdinalIgnoreCase)
                || warningMessage.Contains("MSR", StringComparison.OrdinalIgnoreCase))
            {
                return "Needs attention";
            }
        }

        // The current IPC contract does not expose explicit driver state yet.
        // Keep this honest instead of guessing from LHM data availability.
        return "Unknown";
    }

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
            OperationCanceledException => "Connection timed out. The helper service may be stopped or still starting.",
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
            StatusCode.Unavailable => $"gRPC connection unavailable: {detail}",
            StatusCode.DeadlineExceeded => $"gRPC request timed out: {detail}",
            StatusCode.Unimplemented => $"Helper does not support this Control Panel request: {detail}",
            StatusCode.FailedPrecondition => $"Helper precondition failed: {detail}",
            StatusCode.InvalidArgument => $"Control Panel sent an invalid helper request: {detail}",
            _ => $"gRPC {exception.StatusCode}: {detail}",
        };
    }

    private readonly record struct DiagnosticReadResult<TResponse>(
        TResponse? Response,
        string? ErrorText)
        where TResponse : class;
}
