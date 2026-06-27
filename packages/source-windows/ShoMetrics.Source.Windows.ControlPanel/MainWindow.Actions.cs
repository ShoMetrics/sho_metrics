using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using Microsoft.UI.Xaml;
using ShoMetrics.Source.Windows.Contracts;
using Windows.ApplicationModel.DataTransfer;

namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class MainWindow
{
    private async void OnRefreshClicked(object sender, RoutedEventArgs args)
    {
        await RefreshStatusAsync(StatusRefreshReason.Manual).ConfigureAwait(true);
    }

    private void OnCopyDiagnosticsClicked(object sender, RoutedEventArgs args)
    {
        if (_currentStatus is null)
        {
            return;
        }

        try
        {
            var dataPackage = new DataPackage();
            dataPackage.SetText(_currentStatus.ToDiagnosticText());
            Clipboard.SetContent(dataPackage);
        }
        catch (Exception exception)
        {
            ErrorText.Text = HelperControlPanelStatus.FormatException(exception);
        }
    }

    private void OnOpenLogsClicked(object sender, RoutedEventArgs args)
    {
        try
        {
            string logDirectoryPath = WindowsSourceServicePaths.ResolveLogDirectoryPath();
            Directory.CreateDirectory(logDirectoryPath);

            Process.Start(new ProcessStartInfo
            {
                FileName = logDirectoryPath,
                UseShellExecute = true,
            });
        }
        catch (Exception exception)
        {
            ErrorText.Text = HelperControlPanelStatus.FormatException(exception);
        }
    }

    private void OnInstallPawnIoClicked(object sender, RoutedEventArgs args)
    {
        OpenUrl(PawnIoInstallUrl);
    }

    private void OnInstallShoMetricsClicked(object sender, RoutedEventArgs args)
    {
        OpenUrl(ShoMetricsReleasesUrl);
    }

    private async void OnCheckForUpdatesClicked(object sender, RoutedEventArgs args)
    {
        await CheckForUpdatesAsync().ConfigureAwait(true);
    }

    private void OnOpenUpdateReleaseNotesClicked(object sender, RoutedEventArgs args)
    {
        if (_currentUpdateStatus.ReleaseNotesUri is not null)
        {
            OpenUrl(_currentUpdateStatus.ReleaseNotesUri.AbsoluteUri);
        }
    }

    private void OnOpenUpdateDownloadClicked(object sender, RoutedEventArgs args)
    {
        if (_currentUpdateStatus.DownloadUri is not null)
        {
            OpenUrl(_currentUpdateStatus.DownloadUri.AbsoluteUri);
        }
    }

    private async void OnServicePrimaryActionClicked(object sender, RoutedEventArgs args)
    {
        if (_currentStatus is null)
        {
            return;
        }

        if (_currentStatus.Service.CanInstallShoMetricsHelper)
        {
            OpenUrl(ShoMetricsReleasesUrl);
            return;
        }

        if (!_currentStatus.Service.CanStartBackgroundService)
        {
            return;
        }

        await StartBackgroundServiceAsync().ConfigureAwait(true);
    }

    private void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true,
            });
        }
        catch (Exception exception)
        {
            ErrorText.Text = HelperControlPanelStatus.FormatException(exception);
        }
    }

    private async Task StartBackgroundServiceAsync()
    {
        ServicePrimaryActionButton.IsEnabled = false;
        ErrorText.Text = "";

        try
        {
            await RunServiceStartCommandAsync().ConfigureAwait(true);
            await RefreshStatusAsync(StatusRefreshReason.ServiceStart).ConfigureAwait(true);
        }
        catch (Win32Exception exception) when (exception.NativeErrorCode == 1223)
        {
            ErrorText.Text = "Service start was canceled.";
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            ErrorText.Text = HelperControlPanelStatus.FormatException(exception);
        }
        catch (OperationCanceledException)
        {
            ErrorText.Text = "Service start did not finish in time. Open logs for details.";
        }
        finally
        {
            ServicePrimaryActionButton.IsEnabled = true;
        }
    }

    private async Task RunServiceStartCommandAsync()
    {
        string serviceExecutablePath = ResolveServiceExecutablePath();
        if (!File.Exists(serviceExecutablePath))
        {
            throw new FileNotFoundException("ShoMetrics Helper service executable was not found. Reinstall ShoMetrics Helper.", serviceExecutablePath);
        }

        // Keep the elevated boundary narrow: the service executable only accepts
        // this fixed maintenance command and does not parse arbitrary forwarded
        // Control Panel arguments.
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = serviceExecutablePath,
            Arguments = ServiceStartCommand,
            WorkingDirectory = Path.GetDirectoryName(serviceExecutablePath),
            UseShellExecute = true,
            Verb = "runas",
        }) ?? throw new InvalidOperationException("ShoMetrics Helper service start command did not run.");

        using var cancellationTokenSource = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        await process.WaitForExitAsync(cancellationTokenSource.Token).ConfigureAwait(true);

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(WindowsServiceStartCommandExitCodeFormatter.Format(process.ExitCode));
        }
    }

    private static string ResolveServiceExecutablePath()
    {
        return Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "Service",
            ServiceExecutableName));
    }
}
