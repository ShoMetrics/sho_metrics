using System.Globalization;

namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class MainWindow
{
    private enum StatusRefreshReason
    {
        PanelStartupInitialTry,
        PanelStartupRetry,
        Manual,
        ServiceStart,
    }

    private async Task RefreshStatusAsync(StatusRefreshReason reason)
    {
        if (_isRefreshingStatus)
        {
            ControlPanelStartupLog.Write($"Status refresh skipped because another refresh is active: reason={FormatStatusRefreshReason(reason)}");
            return;
        }

        _isRefreshingStatus = true;
        RefreshButton.IsEnabled = false;
        ErrorText.Text = "";
        ControlPanelStartupLog.Write($"Status refresh started: reason={FormatStatusRefreshReason(reason)}");

        try
        {
            // The status read currently performs up to three sequential gRPC
            // calls with 3s per-call deadlines. Keep this outer UI timeout
            // above that total so cold installer launches do not cancel a
            // still-progressing first read.
            using var cancellationTokenSource = new CancellationTokenSource(TimeSpan.FromSeconds(StatusRefreshTimeoutSeconds));
            HelperControlPanelStatus status = await _statusReader
                .ReadAsync(cancellationTokenSource.Token)
                .ConfigureAwait(true);

            ApplyStatus(status);
            ControlPanelStartupLog.Write(FormatStatusRefreshLog(reason, status));
            UpdateStartupStatusRetry(reason, status);
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException($"Status refresh failed: reason={FormatStatusRefreshReason(reason)}", exception);
            ApplyStatus(HelperControlPanelStatus.FromUnexpectedError(exception));
        }
        finally
        {
            _isRefreshingStatus = false;
            RefreshButton.IsEnabled = true;
        }
    }

    private async Task CheckForUpdatesAsync()
    {
        if (_isCheckingForUpdates)
        {
            return;
        }

        _isCheckingForUpdates = true;
        UpdateCheckButton.IsEnabled = false;
        ApplyUpdateAppcastStatus(UpdateAppcastStatus.Checking(ControlPanelIdentity.Version));

        try
        {
            using var cancellationTokenSource = new CancellationTokenSource(TimeSpan.FromSeconds(8));
            UpdateAppcastStatus updateStatus = await _updateAppcastClient
                .CheckAsync(ControlPanelIdentity.Version, cancellationTokenSource.Token)
                .ConfigureAwait(true);
            ApplyUpdateAppcastStatus(updateStatus);
        }
        catch (OperationCanceledException)
        {
            ApplyUpdateAppcastStatus(UpdateAppcastStatus.Failed(ControlPanelIdentity.Version, DateTimeOffset.Now));
        }
        finally
        {
            _isCheckingForUpdates = false;
            UpdateCheckButton.IsEnabled = true;
        }
    }

    private async Task CheckForUpdatesAutomaticallyAsync()
    {
        if (_hasStartedAutomaticUpdateCheck)
        {
            return;
        }

        // This is intentionally process-local. It avoids background/tray startup
        // network traffic without introducing a persisted Control Panel state file
        // before the update reminder policy is fully defined.
        _hasStartedAutomaticUpdateCheck = true;
        await CheckForUpdatesAsync().ConfigureAwait(true);
    }

    private async void OnStartupStatusRetryTimerTick(object? sender, object args)
    {
        _startupStatusRetryCount++;
        if (_startupStatusRetryCount > StartupStatusRetryLimit)
        {
            StopStartupStatusRetry("retry limit reached");
            return;
        }

        await RefreshStatusAsync(StatusRefreshReason.PanelStartupRetry).ConfigureAwait(true);
    }

    private void UpdateStartupStatusRetry(StatusRefreshReason reason, HelperControlPanelStatus status)
    {
        if (!ShouldRetryStartupStatus(status))
        {
            StopStartupStatusRetry("status recovered");
            return;
        }

        if (reason is not StatusRefreshReason.PanelStartupInitialTry and not StatusRefreshReason.PanelStartupRetry)
        {
            return;
        }

        if (_startupStatusRetryCount >= StartupStatusRetryLimit)
        {
            StopStartupStatusRetry("retry limit reached");
            return;
        }

        if (_startupStatusRetryTimer.IsEnabled)
        {
            return;
        }

        // Installer-launched panels can beat the service's first pipe bind.
        // Retry only during startup so the panel does not become a background poller.
        ControlPanelStartupLog.Write("Startup status retry started");
        _startupStatusRetryTimer.Start();
    }

    private void StopStartupStatusRetry(string reason)
    {
        if (!_startupStatusRetryTimer.IsEnabled)
        {
            return;
        }

        _startupStatusRetryTimer.Stop();
        ControlPanelStartupLog.Write($"Startup status retry stopped: reason={reason}");
    }

    private static bool ShouldRetryStartupStatus(HelperControlPanelStatus status)
    {
        return status.Service.ConnectionText == "Failed"
            && status.Service.RuntimeText is "Running" or "Starting" or "Continuing";
    }

    private static string FormatStatusRefreshLog(StatusRefreshReason reason, HelperControlPanelStatus status)
    {
        string hasErrorText = string.IsNullOrWhiteSpace(status.ErrorText) ? "false" : "true";
        string reasonText = FormatStatusRefreshReason(reason);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"Status refresh completed: reason={reasonText}, checkedAt={status.CheckedAt:O}, serviceStatus={status.Service.StatusText}, serviceRuntime={status.Service.RuntimeText}, connection={status.Service.ConnectionText}, diagnostics={status.Diagnostics.WarningCountText}, hasErrorText={hasErrorText}");
    }

    private static string FormatStatusRefreshReason(StatusRefreshReason reason)
    {
        return reason switch
        {
            StatusRefreshReason.PanelStartupInitialTry => "startup",
            StatusRefreshReason.PanelStartupRetry => "startup-retry",
            StatusRefreshReason.Manual => "manual",
            StatusRefreshReason.ServiceStart => "service-start",
            _ => "unknown",
        };
    }
}
