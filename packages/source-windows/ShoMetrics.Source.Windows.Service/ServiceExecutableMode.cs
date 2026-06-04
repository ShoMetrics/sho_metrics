namespace ShoMetrics.Source.Windows.Service;

internal enum ServiceExecutableMode
{
    Invalid,
    WindowsService,
    DevPipe,
    MetricSourceProbe,
    StartWindowsService,
    InvalidStartWindowsServiceCommand,
    Help,
    Version,
}
