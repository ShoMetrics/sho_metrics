using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.Windows.AppLifecycle;

namespace ShoMetrics.Source.Windows.ControlPanel;

/// <summary>
/// Keeps the panel to a single window: a second launch hands its activation to
/// the running instance and surfaces that window instead of opening another.
/// </summary>
public partial class App
{
    private const string MainInstanceKey = "ShoMetrics.Source.Windows.ControlPanel.Main";

    /// <summary>SW_RESTORE: restores a minimized window to its previous size and position.</summary>
    private const int ShowWindowRestore = 9;

    private AppInstance? _mainInstance;

    /// <summary>
    /// Hands this launch to an already-running panel, or claims the main instance.
    /// </summary>
    /// <returns>
    /// Whether this process redirected and must stop starting up.
    /// </returns>
    /// <remarks>
    /// This follows the documented FindOrRegisterForKey / IsCurrent /
    /// RedirectActivationToAsync / terminate sequence, including terminating the
    /// redirected instance with Process.Kill:
    /// https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/applifecycle
    ///
    /// Microsoft recommends redirecting from a custom Main (with
    /// DISABLE_XAML_GENERATED_MAIN) so the check happens as early as possible,
    /// and documents OnLaunched as the simpler alternative. The only benefit the
    /// docs claim for Main is skipping throwaway work in an instance that is
    /// about to die. Here that work is a best-effort startup-log append
    /// (lock-free, never throws), the dispatcher capture, and
    /// InitializeComponent: none of it claims a resource or needs undoing, and
    /// MainWindow (with its gRPC client) is never constructed on this path. So
    /// Main would buy nothing but a slightly faster focus on a duplicate launch.
    ///
    /// It would also cost a failure mode this path does not have. Main runs
    /// before the dispatcher pumps, and the docs warn that awaiting
    /// RedirectActivationToAsync there blocks the STA and makes the redirect
    /// fail, so a Main implementation must marshal the call to a worker thread
    /// and wait on an event. OnLaunched is already on a pumping dispatcher, so
    /// the await below simply yields.
    ///
    /// Move the check into a custom Main only if startup before this point grows
    /// work with side effects, or if the focus latency of a duplicate launch is
    /// reported as a problem.
    ///
    /// The same docs note the redirect works as expected on x64; this project
    /// builds win-x64. Re-verify before adding an arm64 target.
    /// </remarks>
    private async Task<bool> TryRedirectActivationToRunningPanelAsync()
    {
        AppInstance mainInstance = AppInstance.FindOrRegisterForKey(MainInstanceKey);

        if (!mainInstance.IsCurrent)
        {
            AppActivationArguments activationArguments = AppInstance.GetCurrent().GetActivatedEventArgs();
            await mainInstance.RedirectActivationToAsync(activationArguments);
            ControlPanelStartupLog.Write("Redirected activation to the existing Control Panel instance");
            return true;
        }

        _mainInstance = mainInstance;
        // A redirect that lands between FindOrRegisterForKey and this subscription
        // is lost and the user has to click again. Closing that gap would require
        // handling redirects before XAML starts (the custom-Main variant above),
        // which is not worth it for a focus-only event.
        _mainInstance.Activated += OnMainInstanceActivated;
        return false;
    }

    private void OnMainInstanceActivated(object? sender, AppActivationArguments args)
    {
        // Redirected activation can arrive off the UI thread. Queue the existing
        // window activation so repeated launches focus it rather than create one.
        _dispatcherQueue.TryEnqueue(BringMainWindowToForeground);
    }

    /// <summary>
    /// Surfaces the already-running panel window for a redirected launch.
    /// </summary>
    /// <remarks>
    /// Observed: an earlier build called only <c>Window.Activate</c> here, and a
    /// repeated launch from the Stream Deck plugin left the panel behind other
    /// windows. Activate is therefore not sufficient to pull an existing window
    /// forward when the request originates in another process.
    ///
    /// Documented: SetForegroundWindow may be refused while another application
    /// holds the foreground lock, in which case Windows flashes the taskbar
    /// button instead of switching. That refusal is the platform-intended
    /// outcome, not a defect, so the return value only feeds diagnostics.
    ///
    /// These user32 entry points predate every Windows release this app
    /// supports; the panel already depends on the strictly newer
    /// GetDpiForWindow, so they add no platform floor.
    /// </remarks>
    private void BringMainWindowToForeground()
    {
        if (_window is null)
        {
            return;
        }

        nint windowHandle = WinRT.Interop.WindowNative.GetWindowHandle(_window);

        // Restore only when minimized. An unconditional restore would also pull
        // a maximized panel back down to its restored size.
        if (IsIconic(windowHandle))
        {
            ShowWindow(windowHandle, ShowWindowRestore);
        }

        _window.Activate();

        if (!SetForegroundWindow(windowHandle))
        {
            ControlPanelStartupLog.Write("Windows denied the foreground request; the taskbar button flashes instead");
        }
    }

    /// <summary>
    /// Captures the UI dispatcher while the constructor still runs on the UI thread.
    /// </summary>
    private static DispatcherQueue ResolveUiDispatcherQueue()
    {
        return DispatcherQueue.GetForCurrentThread()
            ?? throw new InvalidOperationException("Control Panel startup requires a UI dispatcher queue.");
    }

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool SetForegroundWindow(nint windowHandle);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool ShowWindow(nint windowHandle, int showCommand);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool IsIconic(nint windowHandle);
}
