using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.Service;

internal readonly record struct WindowsSourceServiceHostOptions(
    ServiceExecutableMode Mode,
    string PipeName,
    WindowsPipeSecurityMode PipeSecurityMode)
{
    internal static WindowsSourceServiceHostOptions Production(ServiceExecutableMode mode)
    {
        // Product entry points always use the fixed pipe name and production ACL.
        // Pipe/security overrides live only in the separate integration test host.
        return new WindowsSourceServiceHostOptions(
            mode,
            WindowsSourceServiceConstants.GrpcPipeName,
            WindowsPipeSecurityMode.ProductionAcl);
    }
}
