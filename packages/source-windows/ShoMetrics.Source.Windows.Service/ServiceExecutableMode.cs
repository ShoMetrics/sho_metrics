namespace ShoMetrics.Source.Windows.Service;

internal enum ServiceExecutableMode
{
    Invalid,
    WindowsService,
    DevPipe,
    MetricSourceProbe,
    Help,
    Version,
}
