using Microsoft.UI.Xaml;

namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class MainWindow : Window
{
    private const string SuccessStatusGlyph = "\uEC61"; // Segoe MDL2 Assets: CompletedSolid.
    private const string CautionStatusGlyph = "\uE7BA"; // Segoe MDL2 Assets: Important.
    private const string CriticalStatusGlyph = "\uEB90"; // Segoe MDL2 Assets: StatusErrorFull.
    private const string UnknownStatusGlyph = "\uE946"; // Segoe MDL2 Assets: Info.
    private const string ShoMetricsReleasesUrl = "https://github.com/ShoMetrics/sho_metrics/releases";
    private const string PawnIoInstallUrl = "https://pawnio.eu/";
    private const int MinimumWindowWidthDips = 900;
    private const int MinimumWindowHeightDips = 480;
    private const int StartupStatusRetryLimit = 6;
    private const int StatusRefreshTimeoutSeconds = 12;
    private const double NavigationMinimalWidthDips = 1008;
    private const double DiagnosticValueColumnWidthRatio = 0.62;
    private const string ServiceExecutableName = "ShoMetricsHelperService.exe";
    private const string ServiceStartCommand = "--start-service";
    private static readonly TimeSpan StartupStatusRetryInterval = TimeSpan.FromSeconds(3);

    private readonly HelperControlPanelStatusReader _statusReader = new();
    private readonly UpdateAppcastClient _updateAppcastClient = new();
    private readonly DispatcherTimer _checkedAtTimer = new();
    private readonly DispatcherTimer _startupStatusRetryTimer = new();
    private HelperControlPanelStatus? _currentStatus;
    private UpdateAppcastStatus _currentUpdateStatus = UpdateAppcastStatus.Initial(ControlPanelIdentity.Version);
    private bool? _isNavigationMinimal;
    private bool _hasStartedAutomaticUpdateCheck;
    private bool _isCheckingForUpdates;
    private bool _isRefreshingStatus;
    private int _startupStatusRetryCount;

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
        _startupStatusRetryTimer.Interval = StartupStatusRetryInterval;
        _startupStatusRetryTimer.Tick += OnStartupStatusRetryTimerTick;
        _ = RefreshStatusAsync(StatusRefreshReason.PanelStartupInitialTry);
        ControlPanelStartupLog.Write("MainWindow ctor exit");
    }

    private void OnClosed(object sender, WindowEventArgs args)
    {
        _checkedAtTimer.Stop();
        _startupStatusRetryTimer.Stop();
        _startupStatusRetryTimer.Tick -= OnStartupStatusRetryTimerTick;
        WarningDiagnosticsCard.SizeChanged -= OnDiagnosticValueCardSizeChanged;
        RootGrid.Loaded -= OnRootGridLoaded;
        RootGrid.SizeChanged -= OnRootGridSizeChanged;
        RootGrid.ActualThemeChanged -= OnRootGridActualThemeChanged;
        _statusReader.Dispose();
        _updateAppcastClient.Dispose();
    }
}
