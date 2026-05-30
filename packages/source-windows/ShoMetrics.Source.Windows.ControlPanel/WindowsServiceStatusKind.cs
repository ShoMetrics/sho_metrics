namespace ShoMetrics.Source.Windows.ControlPanel;

// Normalized Windows Service Control Manager state for the ShoMetrics Helper
// Windows service.
// QueryFailed means the SCM query itself failed; NotInstalled means the service
// was queried successfully and does not exist.
internal enum WindowsServiceStatusKind
{
    Unknown,
    NotInstalled,
    Stopped,
    StartPending,
    StopPending,
    Running,
    ContinuePending,
    PausePending,
    Paused,
    QueryFailed,
}
