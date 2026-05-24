using System.IO;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Ipc;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal sealed class HelperControlPanelStatusReader
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromMilliseconds(800);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(3);

    private readonly WindowsServiceStatusReader _serviceStatusReader = new();
    private readonly WindowsSourceIpcClient _ipcClient = new(new SourceIpcFrameCodec());

    public async Task<HelperControlPanelStatus> ReadAsync(CancellationToken cancellationToken)
    {
        DateTimeOffset checkedAt = DateTimeOffset.Now;
        WindowsServiceStatusKind serviceStatus = _serviceStatusReader.ReadStatus();

        try
        {
            // TODO: If the control panel starts refreshing automatically, replace
            // these separate diagnostic requests with one batch status RPC.
            GetSourceHealthResponse health = await ReadHealthAsync(cancellationToken).ConfigureAwait(false);
            ListMetricDescriptorsResponse descriptors = await ReadDescriptorsAsync(cancellationToken).ConfigureAwait(false);
            ReadMetricSnapshotResponse snapshot = await ReadSnapshotAsync(cancellationToken).ConfigureAwait(false);

            List<string> warningMessages = [
                .. FormatWarnings(health.Warnings),
                .. FormatWarnings(descriptors.Warnings),
                .. FormatWarnings(snapshot.Warnings),
            ];

            DateTimeOffset? sampleCapturedAt = snapshot.Snapshot?.CapturedAt?.ToDateTimeOffset();

            return new HelperControlPanelStatus
            {
                CheckedAt = checkedAt,
                ServiceStatusText = FormatServiceStatus(serviceStatus),
                ServiceInstallText = FormatServiceInstallStatus(serviceStatus),
                ServiceRuntimeText = FormatServiceRuntimeStatus(serviceStatus),
                ConnectionStatusText = "Connected",
                PawnIoDriverText = ResolvePawnIoDriverText(warningMessages),
                HelperVersionText = string.IsNullOrWhiteSpace(health.HelperVersion) ? "Unknown" : health.HelperVersion,
                ProtocolVersionText = string.IsNullOrWhiteSpace(health.ProtocolVersion) ? "Unknown" : health.ProtocolVersion,
                LastSampleText = HelperControlPanelStatus.FormatSampleAge(sampleCapturedAt, checkedAt),
                DescriptorCountText = descriptors.DescriptorSnapshot?.Descriptors.Count.ToString() ?? "0",
                WarningCountText = warningMessages.Count.ToString(),
                WarningDetailsText = warningMessages.Count == 0
                    ? "No warnings."
                    : string.Join(Environment.NewLine, warningMessages),
                ErrorText = "",
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
                ErrorText = FormatConnectionError(exception),
            };
        }
    }

    private async Task<GetSourceHealthResponse> ReadHealthAsync(CancellationToken cancellationToken)
    {
        SourceIpcResponse response = await SendAsync(
            new SourceIpcRequest
            {
                RequestId = CreateRequestId(),
                GetSourceHealth = new GetSourceHealthRequest(),
            },
            cancellationToken).ConfigureAwait(false);

        return response.GetSourceHealth ?? throw new InvalidOperationException("Windows source service did not return a health response.");
    }

    private async Task<ListMetricDescriptorsResponse> ReadDescriptorsAsync(CancellationToken cancellationToken)
    {
        SourceIpcResponse response = await SendAsync(
            new SourceIpcRequest
            {
                RequestId = CreateRequestId(),
                ListMetricDescriptors = new ListMetricDescriptorsRequest(),
            },
            cancellationToken).ConfigureAwait(false);

        return response.ListMetricDescriptors
            ?? throw new InvalidOperationException("Windows source service did not return a descriptor response.");
    }

    private async Task<ReadMetricSnapshotResponse> ReadSnapshotAsync(CancellationToken cancellationToken)
    {
        SourceIpcResponse response = await SendAsync(
            new SourceIpcRequest
            {
                RequestId = CreateRequestId(),
                ReadMetricSnapshot = new ReadMetricSnapshotRequest(),
            },
            cancellationToken).ConfigureAwait(false);

        return response.ReadMetricSnapshot
            ?? throw new InvalidOperationException("Windows source service did not return a snapshot response.");
    }

    private async Task<SourceIpcResponse> SendAsync(
        SourceIpcRequest request,
        CancellationToken cancellationToken)
    {
        SourceIpcResponse response = await _ipcClient
            .SendAsync(request, ConnectTimeout, RequestTimeout, cancellationToken)
            .ConfigureAwait(false);

        if (response.Error is not null)
        {
            throw new InvalidOperationException($"{response.Error.Code}: {response.Error.Message}");
        }

        return response;
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

    private static string CreateRequestId()
    {
        return Guid.NewGuid().ToString("N");
    }

    private static string FormatConnectionError(Exception exception)
    {
        return exception switch
        {
            OperationCanceledException => "Connection timed out. The helper service may be stopped or still starting.",
            IOException => $"IPC connection failed: {exception.Message}",
            _ => HelperControlPanelStatus.FormatException(exception),
        };
    }
}
