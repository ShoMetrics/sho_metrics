using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal static class WindowsServiceStartCommandExitCodeFormatter
{
    /// <summary>
    /// Formats the fixed --start-service command exit code returned by ShoMetricsHelperService.exe.
    /// </summary>
    public static string Format(int exitCode)
    {
        return ((WindowsServiceStartExitCode)exitCode) switch
        {
            WindowsServiceStartExitCode.InvalidCommand => "ShoMetrics Helper service executable received an unsupported command. Reinstall ShoMetrics Helper.",
            WindowsServiceStartExitCode.AccessDenied => "Administrator permission is required to start the background service.",
            WindowsServiceStartExitCode.NotInstalled => "The background service is not installed. Reinstall ShoMetrics Helper.",
            WindowsServiceStartExitCode.Disabled => "The background service is disabled. Reinstall ShoMetrics Helper.",
            WindowsServiceStartExitCode.StartFailed => "The background service failed to start. Open logs for details.",
            WindowsServiceStartExitCode.StartTimedOut => "The background service did not finish starting in time. Open logs for details.",
            WindowsServiceStartExitCode.QueryFailed => "Could not read the background service state. Open logs for details.",
            _ => $"ShoMetrics Helper service start command failed. Exit code: {exitCode}.",
        };
    }
}
