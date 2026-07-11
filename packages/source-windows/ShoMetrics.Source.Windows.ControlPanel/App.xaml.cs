using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace ShoMetrics.Source.Windows.ControlPanel;

/// <summary>
/// Entry point of the Control Panel. Owns app startup and startup-failure
/// diagnostics only.
/// </summary>
/// <remarks>
/// Keep this file thin. Every launch path runs through it, so it is the first
/// place a crash or hang is investigated, and unrelated code here makes that
/// harder.
///
/// New app-wide behavior belongs in its own <c>App.*.cs</c> partial (the same
/// split MainWindow uses), exposing one named seam that <c>OnLaunched</c> or
/// the constructor calls. Only add code here when it is part of starting the
/// app or reporting a startup failure.
/// </remarks>
public partial class App : Application
{
    private const string FirstChanceLogEnvironmentVariable = "SHOMETRICS_CONTROL_PANEL_FIRST_CHANCE_LOG";
    private const int MessageBoxIconError = 0x00000010;
    private const int MessageBoxOk = 0x00000000;

    private readonly DispatcherQueue _dispatcherQueue;
    private Window? _window;

    /// <summary>
    /// Initializes the WinUI app and installs startup diagnostics before loading the main window.
    /// </summary>
    public App()
    {
        ControlPanelStartupLog.Write("App ctor enter");
        // Redirected launches raise their activation off the UI thread, so the
        // dispatcher has to be captured here while the UI thread still owns us.
        _dispatcherQueue = ResolveUiDispatcherQueue();
        // FirstChanceException is useful for XAML loader forensics, but far too
        // noisy for normal runs. Enable it only when diagnosing startup crashes.
        if (IsFirstChanceExceptionLoggingEnabled())
        {
            AppDomain.CurrentDomain.FirstChanceException += OnFirstChanceException;
        }

        try
        {
            InitializeComponent();
            UnhandledException += OnUnhandledException;
            ControlPanelStartupLog.Write("App ctor exit");
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("App InitializeComponent failed", exception);
            ShowFatalStartupDialog();
            throw;
        }
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        ControlPanelStartupLog.Write("OnLaunched enter");

        try
        {
            if (await TryRedirectActivationToRunningPanelAsync())
            {
                // This process handed its activation to the running panel and owns
                // no window. It must terminate rather than fall through into XAML
                // startup, which would leave a second, windowless panel process.
                System.Diagnostics.Process.GetCurrentProcess().Kill();
                return;
            }

            _window = new MainWindow();
            ControlPanelStartupLog.Write("MainWindow created");
            _window.Activate();
            ControlPanelStartupLog.Write("MainWindow activated");
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("OnLaunched failed", exception);
            ShowFatalStartupDialog();
            throw;
        }
    }

    private static void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs args)
    {
        ControlPanelStartupLog.WriteException("Unhandled XAML exception", args.Exception);
    }

    private static void OnFirstChanceException(object? sender, FirstChanceExceptionEventArgs args)
    {
        Exception exception = args.Exception;
        string exceptionType = exception.GetType().FullName ?? "";
        string stackTrace = exception.StackTrace ?? "";

        if (!exceptionType.Contains("Xaml", StringComparison.OrdinalIgnoreCase) &&
            !stackTrace.Contains("Microsoft.UI.Xaml", StringComparison.OrdinalIgnoreCase) &&
            !stackTrace.Contains("WinRT", StringComparison.OrdinalIgnoreCase) &&
            !stackTrace.Contains("ShoMetrics", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        ControlPanelStartupLog.WriteException("FirstChanceException", exception);
    }

    private static bool IsFirstChanceExceptionLoggingEnabled()
    {
        string? value = Environment.GetEnvironmentVariable(FirstChanceLogEnvironmentVariable);
        return string.Equals(value, "1", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "true", StringComparison.OrdinalIgnoreCase);
    }

    private static void ShowFatalStartupDialog()
    {
        // XAML may be unavailable during startup failure. Use a native dialog so
        // users still get a visible pointer to the diagnostic log.
        string message =
            "ShoMetrics Control Panel could not open." + Environment.NewLine + Environment.NewLine +
            "A startup log was written to:" + Environment.NewLine +
            ControlPanelStartupLog.LogFilePath;

        MessageBox(
            windowHandle: 0,
            text: message,
            caption: "ShoMetrics Control Panel",
            type: MessageBoxOk | MessageBoxIconError);
    }

    [LibraryImport("user32.dll", EntryPoint = "MessageBoxW", StringMarshalling = StringMarshalling.Utf16)]
    private static partial int MessageBox(nint windowHandle, string text, string caption, uint type);
}
