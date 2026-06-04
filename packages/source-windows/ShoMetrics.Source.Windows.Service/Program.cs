using Microsoft.Extensions.Hosting;
using ShoMetrics.Source.Windows.Contracts;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service;

internal static class Program
{
    /// <summary>
    /// Dispatches either the Windows Service host or a fixed maintenance command.
    /// </summary>
    public static async Task<int> Main(string[] args)
    {
        ServiceExecutableMode mode = ParseMode(args);

        return mode switch
        {
            ServiceExecutableMode.Help => WriteHelp(),
            ServiceExecutableMode.Version => WriteVersion(),
            ServiceExecutableMode.MetricSourceProbe => await MetricSourceComparisonProbe.RunAsync(args[1..]).ConfigureAwait(false),
            ServiceExecutableMode.StartWindowsService => (int)new WindowsServiceStartCommand().Start(),
            ServiceExecutableMode.InvalidStartWindowsServiceCommand => (int)WindowsServiceStartExitCode.InvalidCommand,
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
            "--start-service" when args.Length == 1 => ServiceExecutableMode.StartWindowsService,
            "--start-service" => ServiceExecutableMode.InvalidStartWindowsServiceCommand,
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
              ShoMetricsHelperService.exe
                                                               Run as a Windows Service.
              ShoMetricsHelperService.exe --dev-pipe Run the service host in console dev mode.
              ShoMetricsHelperService.exe --metric-source-probe [--duration-ms N] [--interval-ms N] [--probe-sources native,lhm-dll]
                                                               Run a metric source comparison probe.
              ShoMetricsHelperService.exe --start-service
                                                               Start the installed Windows Service, then exit.
              ShoMetricsHelperService.exe --help               Print this help.
              ShoMetricsHelperService.exe --version            Print the helper version.
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
