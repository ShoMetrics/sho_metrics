using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using ShoMetrics.Source.Windows.Contracts;
using Windows.ApplicationModel.DataTransfer;
using Windows.Graphics;
using WinRT.Interop;

namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class MainWindow : Window
{
    private const string SuccessStatusGlyph = "\uEC61"; // Segoe MDL2 Assets: CompletedSolid.
    private const string CautionStatusGlyph = "\uE7BA"; // Segoe MDL2 Assets: Important.
    private const string CriticalStatusGlyph = "\uEB90"; // Segoe MDL2 Assets: StatusErrorFull.
    private const string UnknownStatusGlyph = "\uE946"; // Segoe MDL2 Assets: Info.
    private const string ShoMetricsReleasesUrl = "https://github.com/edwardez/sho_metrics/releases";
    private const string PawnIoInstallUrl = "https://pawnio.eu/";

    private readonly HelperControlPanelStatusReader _statusReader = new();
    private readonly DispatcherTimer _checkedAtTimer = new();
    private HelperControlPanelStatus? _currentStatus;

    public MainWindow()
    {
        InitializeComponent();
        SystemBackdrop = new MicaBackdrop();
        SetWindowSizeInDips(width: 1100, height: 720);
        ConfigureCustomTitleBar();
        ApplyStatus(HelperControlPanelStatus.Initial());
        RootGrid.ActualThemeChanged += OnRootGridActualThemeChanged;
        Closed += OnClosed;
        _checkedAtTimer.Interval = TimeSpan.FromSeconds(1);
        _checkedAtTimer.Tick += OnCheckedAtTimerTick;
        _checkedAtTimer.Start();
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

    private void OnInstallPawnIoClicked(object sender, RoutedEventArgs args)
    {
        OpenUrl(PawnIoInstallUrl);
    }

    private void OnInstallShoMetricsClicked(object sender, RoutedEventArgs args)
    {
        OpenUrl(ShoMetricsReleasesUrl);
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

        ServiceTileStatusText.Text = status.Service.StatusText;
        ServiceTileDetailText.Text = status.Service.DetailText;
        ServiceInstallDetailText.Text = status.Service.InstallText;
        ServiceRuntimeDetailText.Text = status.Service.RuntimeText;
        ConnectionDetailText.Text = status.Service.ConnectionText;
        ApplyStatusIcon(ServiceTileStatusIcon, status.Service.Tone);
        Visibility serviceInstallVisibility = status.Service.CanInstallShoMetricsHelper
            ? Visibility.Visible
            : Visibility.Collapsed;
        ServiceInstallButton.Visibility = serviceInstallVisibility;
        ServiceInstallDetailButton.Visibility = serviceInstallVisibility;
        ServiceStatusText.Text = status.Service.StatusText;
        PawnIoDriverText.Text = status.PawnIoDriver.StatusText;
        PawnIoDriverDetailText.Text = status.PawnIoDriver.DetailText;
        PawnIoInstallButton.Visibility = status.PawnIoDriver.CanInstallPawnIoDriver
            ? Visibility.Visible
            : Visibility.Collapsed;
        ApplyStatusIcon(PawnIoDriverStatusIcon, status.PawnIoDriver.Tone);
        VersionText.Text = status.Diagnostics.HelperVersionText;
        ProtocolText.Text = status.Diagnostics.ProtocolVersionText;
        SensorDiagnosticsText.Text = status.Diagnostics.SensorDiagnosticsText;
        WarningCountText.Text = status.Diagnostics.WarningCountText;
        WarningCountSummaryText.Text = status.Diagnostics.WarningCountText;
        DiagnosticsDetailText.Text = status.Diagnostics.DetailText;
        DiagnosticsSummaryDetailText.Text = status.Diagnostics.DetailText;
        WarningDetailsText.Text = status.Diagnostics.WarningDetailsText;
        ApplyStatusIcon(DiagnosticsStatusIcon, status.Diagnostics.Tone);
        ApplyStatusIcon(DiagnosticsSummaryStatusIcon, status.Diagnostics.Tone);
        DiagnosticsSummaryCard.Visibility = status.Diagnostics.HasDetails ? Visibility.Collapsed : Visibility.Visible;
        DiagnosticsDetailsExpander.Visibility = status.Diagnostics.HasDetails ? Visibility.Visible : Visibility.Collapsed;
        ErrorText.Text = status.ErrorText;
        LogFolderText.Text = WindowsSourceServicePaths.ResolveLogDirectoryPath();
        UpdateCheckedAtText(DateTimeOffset.Now);
    }

    private void OnCheckedAtTimerTick(object? sender, object args)
    {
        UpdateCheckedAtText(DateTimeOffset.Now);
    }

    private void UpdateCheckedAtText(DateTimeOffset now)
    {
        if (_currentStatus is null)
        {
            CheckedAtItem.Content = "Not checked";
            return;
        }

        CheckedAtItem.Content = $"Last checked: {FormatCheckedAge(_currentStatus.CheckedAt, now)}";
    }

    private void ApplyStatusIcon(FontIcon icon, ControlPanelStatusTone tone)
    {
        icon.Glyph = tone switch
        {
            ControlPanelStatusTone.Success => SuccessStatusGlyph,
            ControlPanelStatusTone.Caution => CautionStatusGlyph,
            ControlPanelStatusTone.Critical => CriticalStatusGlyph,
            ControlPanelStatusTone.Unknown => UnknownStatusGlyph,
            _ => UnknownStatusGlyph,
        };

        icon.Foreground = tone switch
        {
            ControlPanelStatusTone.Success => CreateStatusIconBrush(Colors.ForestGreen),
            ControlPanelStatusTone.Caution => CreateStatusIconBrush(Colors.Goldenrod),
            ControlPanelStatusTone.Critical => CreateStatusIconBrush(Colors.Firebrick),
            ControlPanelStatusTone.Unknown => CreateStatusIconBrush(ResolveSecondaryIconColor()),
            _ => CreateStatusIconBrush(ResolveSecondaryIconColor()),
        };
    }

    private static SolidColorBrush CreateStatusIconBrush(global::Windows.UI.Color color)
    {
        return new SolidColorBrush(color);
    }

    private global::Windows.UI.Color ResolvePrimaryTextColor()
    {
        return RootGrid.ActualTheme == ElementTheme.Dark ? Colors.White : Colors.Black;
    }

    private global::Windows.UI.Color ResolveSecondaryIconColor()
    {
        return RootGrid.ActualTheme == ElementTheme.Dark ? Colors.LightGray : Colors.DimGray;
    }

    private void ConfigureCustomTitleBar()
    {
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        ApplyTitleBarTheme();
    }

    private void ApplyTitleBarTheme()
    {
        AppWindowTitleBar titleBar = ResolveAppWindow().TitleBar;

        titleBar.ButtonBackgroundColor = Colors.Transparent;
        titleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
        titleBar.ButtonForegroundColor = ResolvePrimaryTextColor();
        titleBar.ButtonInactiveForegroundColor = ResolveSecondaryIconColor();
    }

    private void OnRootGridActualThemeChanged(FrameworkElement sender, object args)
    {
        ApplyTitleBarTheme();

        if (_currentStatus is not null)
        {
            ApplyStatus(_currentStatus);
        }
    }

    private void OnClosed(object sender, WindowEventArgs args)
    {
        _checkedAtTimer.Stop();
        RootGrid.ActualThemeChanged -= OnRootGridActualThemeChanged;
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
        AppWindow appWindow = ResolveAppWindow();
        appWindow.Resize(new SizeInt32(
            ConvertDipToPhysicalPixel(width, scale),
            ConvertDipToPhysicalPixel(height, scale)));
    }

    private AppWindow ResolveAppWindow()
    {
        nint windowHandle = WindowNative.GetWindowHandle(this);
        WindowId windowId = Win32Interop.GetWindowIdFromWindow(windowHandle);
        return AppWindow.GetFromWindowId(windowId);
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
