using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using Microsoft.UI.Xaml;

namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class App : Application
{
    private const string FirstChanceLogEnvironmentVariable = "SHOMETRICS_CONTROL_PANEL_FIRST_CHANCE_LOG";
    private const int MessageBoxIconError = 0x00000010;
    private const int MessageBoxOk = 0x00000000;

    private Window? _window;

    public App()
    {
        ControlPanelStartupLog.Write("App ctor enter");
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

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        ControlPanelStartupLog.Write("OnLaunched enter");

        try
        {
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
