namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class MainWindow
{
    private async Task RefreshStatusAsync()
    {
        RefreshButton.IsEnabled = false;
        ErrorText.Text = "";

        try
        {
            using var cancellationTokenSource = new CancellationTokenSource(TimeSpan.FromSeconds(8));
            HelperControlPanelStatus status = await _statusReader
                .ReadAsync(cancellationTokenSource.Token)
                .ConfigureAwait(true);

            ApplyStatus(status);
        }
        catch (Exception exception)
        {
            ApplyStatus(HelperControlPanelStatus.FromUnexpectedError(exception));
        }
        finally
        {
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
}
