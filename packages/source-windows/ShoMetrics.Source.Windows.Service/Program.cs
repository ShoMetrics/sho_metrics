using Microsoft.Extensions.Hosting;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        ServiceExecutableMode mode = ParseMode(args);

        return mode switch
        {
            ServiceExecutableMode.Help => WriteHelp(),
            ServiceExecutableMode.Version => WriteVersion(),
            ServiceExecutableMode.MetricSourceProbe => await MetricSourceComparisonProbe.RunAsync(args[1..]).ConfigureAwait(false),
            ServiceExecutableMode.DevPipe => await RunHostAsync(args, mode).ConfigureAwait(false),
            ServiceExecutableMode.WindowsService => await RunHostAsync(args, mode).ConfigureAwait(false),
            ServiceExecutableMode.Invalid => WriteInvalidArguments(args),
            _ => WriteInvalidArguments(args),
        };
    }

    private static ServiceExecutableMode ParseMode(string[] args)
    {
        if (args.Length == 0)
        {
            return ServiceExecutableMode.WindowsService;
        }

        return args[0] switch
        {
            "--dev-pipe" when args.Length == 1 => ServiceExecutableMode.DevPipe,
            "--metric-source-probe" => ServiceExecutableMode.MetricSourceProbe,
            "--help" or "-h" when args.Length == 1 => ServiceExecutableMode.Help,
            "--version" when args.Length == 1 => ServiceExecutableMode.Version,
            _ => ServiceExecutableMode.Invalid,
        };
    }

    private static Task<int> RunHostAsync(string[] args, ServiceExecutableMode mode)
    {
        WindowsSourceServiceHostOptions hostOptions = WindowsSourceServiceHostOptions.Production(mode);
        string[] hostArgs = mode == ServiceExecutableMode.DevPipe ? [] : args;

        return WindowsSourceServiceHost.RunWithLoggingAsync(
            hostArgs,
            hostOptions,
            static host => host.RunAsync());
    }

    private static int WriteHelp()
    {
        Console.Out.WriteLine(
            """
            ShoMetrics Windows Source Service

            Usage:
              ShoMetrics.Source.Windows.Service.exe
                                                               Run as a Windows Service.
              ShoMetrics.Source.Windows.Service.exe --dev-pipe Run the service host in console dev mode.
              ShoMetrics.Source.Windows.Service.exe --metric-source-probe [--duration-ms N] [--interval-ms N] [--probe-sources native,lhm-dll]
                                                               Run a metric source comparison probe.
              ShoMetrics.Source.Windows.Service.exe --help     Print this help.
              ShoMetrics.Source.Windows.Service.exe --version  Print the helper version.
            """);

        return 0;
    }

    private static int WriteVersion()
    {
        Console.Out.WriteLine(WindowsSourceServiceIdentity.HelperVersion);

        return 0;
    }

    private static int WriteInvalidArguments(string[] args)
    {
        Console.Error.WriteLine($"Unknown arguments: {string.Join(" ", args)}");
        Console.Error.WriteLine("Run with --help for supported modes.");

        return 1;
    }
}
