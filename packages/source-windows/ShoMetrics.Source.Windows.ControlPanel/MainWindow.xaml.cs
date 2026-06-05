using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
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
    private const int MinimumWindowWidthDips = 900;
    private const int MinimumWindowHeightDips = 480;
    private const double NavigationMinimalWidthDips = 1008;
    private const double DiagnosticValueColumnWidthRatio = 0.62;
    private const string ServiceExecutableName = "ShoMetricsHelperService.exe";
    private const string ServiceStartCommand = "--start-service";

    private readonly HelperControlPanelStatusReader _statusReader = new();
    private readonly UpdateAppcastClient _updateAppcastClient = new();
    private readonly DispatcherTimer _checkedAtTimer = new();
    private HelperControlPanelStatus? _currentStatus;
    private UpdateAppcastStatus _currentUpdateStatus = UpdateAppcastStatus.Initial(ControlPanelIdentity.Version);
    private bool? _isNavigationMinimal;
    private bool _hasStartedAutomaticUpdateCheck;
    private bool _isCheckingForUpdates;

    /// <summary>
    /// Creates the normal-user status surface and wires lightweight service recovery actions.
    /// </summary>
    public MainWindow()
    {
        ControlPanelStartupLog.Write("MainWindow ctor enter");
        ControlPanelStartupLog.Write("InitializeComponent enter");
        InitializeComponent();
        ControlPanelStartupLog.Write("InitializeComponent exit");
        TryApplyMicaBackdrop();
        TrySetWindowSizeInDips(width: 1100, height: 720);
        TrySetMinimumWindowSizeInDips(width: MinimumWindowWidthDips, height: MinimumWindowHeightDips);
        TryConfigureCustomTitleBar();
        ApplyStatus(HelperControlPanelStatus.Initial());
        ApplyUpdateAppcastStatus(_currentUpdateStatus);
        WarningDiagnosticsCard.SizeChanged += OnDiagnosticValueCardSizeChanged;
        RootGrid.Loaded += OnRootGridLoaded;
        RootGrid.SizeChanged += OnRootGridSizeChanged;
        RootGrid.ActualThemeChanged += OnRootGridActualThemeChanged;
        Closed += OnClosed;
        _checkedAtTimer.Interval = TimeSpan.FromSeconds(1);
        _checkedAtTimer.Tick += OnCheckedAtTimerTick;
        _checkedAtTimer.Start();
        _ = RefreshStatusAsync();
        ControlPanelStartupLog.Write("MainWindow ctor exit");
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
        ApplyServicePrimaryAction(status.Service);
        ServiceInstallDetailButton.Visibility = serviceInstallVisibility;
        ServiceTileRecoveryText.Text = ResolveServiceRecoveryText(status.Service);
        ServiceTileRecoveryText.Visibility = status.Service.CanStartBackgroundService
            ? Visibility.Visible
            : Visibility.Collapsed;
        ServiceStatusText.Text = status.Service.StatusText;
        PawnIoDriverText.Text = status.PawnIoDriver.StatusText;
        PawnIoDriverDetailText.Text = status.PawnIoDriver.DetailText;
        PawnIoInstallButton.Visibility = status.PawnIoDriver.CanInstallPawnIoDriver
            ? Visibility.Visible
            : Visibility.Collapsed;
        ApplyStatusIcon(PawnIoDriverStatusIcon, status.PawnIoDriver.Tone);
        PanelVersionText.Text = ControlPanelIdentity.Version;
        HelperVersionText.Text = status.Diagnostics.HelperVersionText;
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
        UpdateDiagnosticValueTextWidth();
    }

    private void ApplyUpdateAppcastStatus(UpdateAppcastStatus status)
    {
        _currentUpdateStatus = status;

        UpdateVersionText.Text = status.CurrentVersionText;
        UpdateStatusText.Text = status.StatusText;
        UpdateDetailText.Text = status.DetailText;
        UpdateLastCheckedText.Text = status.CheckedAt is null
            ? "Last checked: Never"
            : $"Last checked: {status.CheckedAt.Value:g}";
        UpdateReleaseNotesButton.Visibility = status.HasReleaseNotes ? Visibility.Visible : Visibility.Collapsed;
        UpdateDownloadButton.Visibility = status.HasDownload ? Visibility.Visible : Visibility.Collapsed;
        UpdateStatusText.Foreground = status.Kind == UpdateAppcastStatusKind.CriticalUpdateAvailable
            ? ResolveThemeBrush("SystemFillColorCriticalBrush")
            : ResolveThemeBrush("TextFillColorSecondaryBrush");
    }

    private Visibility ResolveServicePrimaryActionVisibility(HelperServicePanelStatus serviceStatus)
    {
        return serviceStatus.CanInstallShoMetricsHelper || serviceStatus.CanStartBackgroundService
            ? Visibility.Visible
            : Visibility.Collapsed;
    }

    private string ResolveServicePrimaryActionText(HelperServicePanelStatus serviceStatus)
    {
        if (serviceStatus.CanInstallShoMetricsHelper)
        {
            return "Install";
        }

        if (!serviceStatus.CanStartBackgroundService)
        {
            return "";
        }

        return "Start";
    }

    private void ApplyServicePrimaryAction(HelperServicePanelStatus serviceStatus)
    {
        string actionText = ResolveServicePrimaryActionText(serviceStatus);
        ServicePrimaryActionButton.Visibility = ResolveServicePrimaryActionVisibility(serviceStatus);
        ServicePrimaryActionText.Text = actionText;
        ServicePrimaryActionAdminIcon.Visibility = serviceStatus.CanStartBackgroundService
            ? Visibility.Visible
            : Visibility.Collapsed;
        AutomationProperties.SetName(ServicePrimaryActionButton, actionText);
    }

    private string ResolveServiceRecoveryText(HelperServicePanelStatus serviceStatus)
    {
        if (!serviceStatus.CanStartBackgroundService)
        {
            return "";
        }

        return "Start the background service to restore sensor checks.";
    }

    private async Task StartBackgroundServiceAsync()
    {
        ServicePrimaryActionButton.IsEnabled = false;
        ErrorText.Text = "";

        try
        {
            await RunServiceStartCommandAsync().ConfigureAwait(true);
            await RefreshStatusAsync().ConfigureAwait(true);
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

    private async void OnRootGridLoaded(object sender, RoutedEventArgs args)
    {
        ApplyNavigationLayout(RootGrid.ActualWidth);
        await CheckForUpdatesAutomaticallyAsync().ConfigureAwait(true);
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

    private void OnRootGridSizeChanged(object sender, SizeChangedEventArgs args)
    {
        ApplyNavigationLayout(args.NewSize.Width);
    }

    private void ApplyNavigationLayout(double windowWidth)
    {
        if (windowWidth <= 0)
        {
            return;
        }

        // Windows responsive guidance treats 1008 effective pixels as the Large breakpoint.
        // Below that, collapse only the navigation pane; content keeps the same wide row layout.
        bool isNavigationMinimal = windowWidth < NavigationMinimalWidthDips;
        if (_isNavigationMinimal == isNavigationMinimal)
        {
            return;
        }

        _isNavigationMinimal = isNavigationMinimal;

        if (isNavigationMinimal)
        {
            Navigation.PaneDisplayMode = NavigationViewPaneDisplayMode.LeftMinimal;
            Navigation.IsPaneOpen = false;
            Navigation.IsPaneToggleButtonVisible = true;
            return;
        }

        Navigation.PaneDisplayMode = NavigationViewPaneDisplayMode.Left;
        Navigation.IsPaneOpen = true;
        Navigation.IsPaneToggleButtonVisible = false;
    }

    private void OnDiagnosticValueCardSizeChanged(object sender, SizeChangedEventArgs args)
    {
        UpdateDiagnosticValueTextWidth();
    }

    private void UpdateDiagnosticValueTextWidth()
    {
        if (WarningDiagnosticsCard.ActualWidth <= 0)
        {
            return;
        }

        // SettingsCard lays each row out independently. Diagnostics rows stretch
        // to the same card width, so use one measured row to give both values a
        // shared right column while capped descriptions leave a visible filler.
        double valueTextWidth = Math.Max(0, WarningDiagnosticsCard.ActualWidth * DiagnosticValueColumnWidthRatio);
        SensorDiagnosticsText.Width = valueTextWidth;
        WarningDetailsText.Width = valueTextWidth;
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
            ControlPanelStatusTone.Success => ResolveThemeBrush("SystemFillColorSuccessBrush"),
            ControlPanelStatusTone.Caution => ResolveThemeBrush("SystemFillColorCautionBrush"),
            ControlPanelStatusTone.Critical => ResolveThemeBrush("SystemFillColorCriticalBrush"),
            ControlPanelStatusTone.Unknown => ResolveThemeBrush("TextFillColorSecondaryBrush"),
            _ => ResolveThemeBrush("TextFillColorSecondaryBrush"),
        };
    }

    private Brush ResolveThemeBrush(string resourceKey)
    {
        if (Application.Current.Resources.TryGetValue(resourceKey, out object resource) &&
            resource is Brush brush)
        {
            return brush;
        }

        return new SolidColorBrush(ResolveSecondaryIconColor());
    }

    private global::Windows.UI.Color ResolvePrimaryTextColor()
    {
        return RootGrid.ActualTheme == ElementTheme.Dark ? Colors.White : Colors.Black;
    }

    private global::Windows.UI.Color ResolveSecondaryIconColor()
    {
        return RootGrid.ActualTheme == ElementTheme.Dark ? Colors.LightGray : Colors.DimGray;
    }

    private void TryApplyMicaBackdrop()
    {
        try
        {
            SystemBackdrop = new MicaBackdrop();
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("MicaBackdrop failed", exception);
        }
    }

    private void TrySetWindowSizeInDips(int width, int height)
    {
        try
        {
            SetWindowSizeInDips(width, height);
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("SetWindowSizeInDips failed", exception);
        }
    }

    private void TrySetMinimumWindowSizeInDips(int width, int height)
    {
        try
        {
            SetMinimumWindowSizeInDips(width, height);
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("SetMinimumWindowSizeInDips failed", exception);
        }
    }

    private void TryConfigureCustomTitleBar()
    {
        try
        {
            ConfigureCustomTitleBar();
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("ConfigureCustomTitleBar failed", exception);
        }
    }

    private void TryApplyTitleBarTheme()
    {
        try
        {
            ApplyTitleBarTheme();
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("ApplyTitleBarTheme failed", exception);
        }
    }

    private void ConfigureCustomTitleBar()
    {
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        TryApplyTitleBarTheme();
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
        TryApplyTitleBarTheme();

        if (_currentStatus is not null)
        {
            ApplyStatus(_currentStatus);
        }
    }

    private void OnClosed(object sender, WindowEventArgs args)
    {
        _checkedAtTimer.Stop();
        WarningDiagnosticsCard.SizeChanged -= OnDiagnosticValueCardSizeChanged;
        RootGrid.Loaded -= OnRootGridLoaded;
        RootGrid.SizeChanged -= OnRootGridSizeChanged;
        RootGrid.ActualThemeChanged -= OnRootGridActualThemeChanged;
        _statusReader.Dispose();
        _updateAppcastClient.Dispose();
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

    private void SetMinimumWindowSizeInDips(int width, int height)
    {
        nint windowHandle = WindowNative.GetWindowHandle(this);
        double scale = GetDpiForWindow(windowHandle) / 96.0;

        if (ResolveAppWindow().Presenter is OverlappedPresenter presenter)
        {
            presenter.PreferredMinimumWidth = ConvertDipToPhysicalPixel(width, scale);
            presenter.PreferredMinimumHeight = ConvertDipToPhysicalPixel(height, scale);
        }
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
