namespace ShoMetrics.Source.Windows.ControlPanel;

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
