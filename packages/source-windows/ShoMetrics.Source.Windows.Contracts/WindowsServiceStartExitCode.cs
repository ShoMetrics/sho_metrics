namespace ShoMetrics.Source.Windows.Contracts;

/// <summary>
/// Exit codes returned by ShoMetricsHelperService.exe --start-service.
/// </summary>
public enum WindowsServiceStartExitCode
{
    Success = 0,
    InvalidCommand = 2,
    AccessDenied = 3,
    NotInstalled = 4,
    Disabled = 5,
    StartFailed = 6,
    StartTimedOut = 7,
    QueryFailed = 8,
}
