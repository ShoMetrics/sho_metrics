using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using ShoMetrics.Source.Windows.Ipc;
using Windows.ApplicationModel.DataTransfer;
using Windows.Graphics;
using WinRT.Interop;

namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class MainWindow : Window
{
    private readonly HelperControlPanelStatusReader _statusReader = new();
    private HelperControlPanelStatus? _currentStatus;

    public MainWindow()
    {
        InitializeComponent();
        SystemBackdrop = new MicaBackdrop();
        SetWindowSizeInDips(width: 1100, height: 720);
        ApplyStatus(HelperControlPanelStatus.Initial());
        Closed += OnClosed;
        _ = RefreshStatusAsync();
    }

    private async void OnRefreshClicked(object sender, RoutedEventArgs args)
    {
        await RefreshStatusAsync().ConfigureAwait(true);
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

    private void ApplyStatus(HelperControlPanelStatus status)
    {
        _currentStatus = status;

        ServiceStatusText.Text = status.ServiceStatusText;
        ServiceInstallText.Text = status.ServiceInstallText;
        ServiceRuntimeText.Text = status.ServiceRuntimeText;
        ConnectionStatusText.Text = status.ConnectionStatusText;
        PawnIoDriverText.Text = status.PawnIoDriverText;
        VersionText.Text = status.HelperVersionText;
        ProtocolText.Text = status.ProtocolVersionText;
        LastSampleText.Text = status.LastSampleText;
        DescriptorCountText.Text = status.DescriptorCountText;
        WarningCountText.Text = status.WarningCountText;
        WarningDetailsText.Text = status.WarningDetailsText;
        ErrorText.Text = status.ErrorText;
        LogFolderText.Text = WindowsSourceServicePaths.ResolveLogDirectoryPath();
        CheckedAtItem.Content = $"Checked {FormatCheckedAge(status.CheckedAt, DateTimeOffset.Now)}";
    }

    private void OnClosed(object sender, WindowEventArgs args)
    {
        _statusReader.Dispose();
    }

    private void OnNavigationSelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem { Tag: string selectedPage })
        {
            return;
        }

        StatusPage.Visibility = selectedPage == "status" ? Visibility.Visible : Visibility.Collapsed;
        AboutPage.Visibility = selectedPage == "about" ? Visibility.Visible : Visibility.Collapsed;
    }

    private void SetWindowSizeInDips(int width, int height)
    {
        nint windowHandle = WindowNative.GetWindowHandle(this);
        double scale = GetDpiForWindow(windowHandle) / 96.0;
        WindowId windowId = Win32Interop.GetWindowIdFromWindow(windowHandle);
        AppWindow appWindow = AppWindow.GetFromWindowId(windowId);
        appWindow.Resize(new SizeInt32(
            ConvertDipToPhysicalPixel(width, scale),
            ConvertDipToPhysicalPixel(height, scale)));
    }

    private static int ConvertDipToPhysicalPixel(int value, double scale)
    {
        return Math.Max(1, (int)Math.Round(value * scale));
    }

    [LibraryImport("user32.dll")]
    private static partial uint GetDpiForWindow(nint windowHandle);

    private static string FormatCheckedAge(DateTimeOffset timestamp, DateTimeOffset now)
    {
        TimeSpan age = now - timestamp;

        if (age < TimeSpan.Zero)
        {
            age = TimeSpan.Zero;
        }

        if (age.TotalSeconds < 1)
        {
            return "just now";
        }

        if (age.TotalMinutes < 1)
        {
            return $"{Math.Floor(age.TotalSeconds)}s ago";
        }

        return $"{Math.Floor(age.TotalMinutes)}m {age.Seconds}s ago";
    }
}
