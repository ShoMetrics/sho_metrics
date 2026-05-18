using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;
using Serilog.Events;
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

        if (args.Length != 1)
        {
            return ServiceExecutableMode.Invalid;
        }

        return args[0] switch
        {
            "--dev-pipe" => ServiceExecutableMode.DevPipe,
            "--help" or "-h" => ServiceExecutableMode.Help,
            "--version" => ServiceExecutableMode.Version,
            _ => ServiceExecutableMode.Invalid,
        };
    }

    private static async Task<int> RunHostAsync(string[] args, ServiceExecutableMode mode)
    {
        Log.Logger = CreateBootstrapLogger();

        try
        {
            using IHost host = Host.CreateDefaultBuilder(args)
                .UseWindowsService(options => options.ServiceName = SourceServiceConstants.ServiceName)
                .UseSerilog((_, _, loggerConfiguration) => ConfigureSerilog(loggerConfiguration, mode))
                .ConfigureServices(services =>
                {
                    services.AddSingleton<WindowsPipeSecurity>();
                    services.AddSingleton<WindowsPipeClientVerifier>();
                    services.AddSingleton<SourceIpcFrameCodec>();
                    services.AddSingleton<SourceProtocolMapper>();
                    services.AddSingleton<SourceRequestHandler>();
                    services.AddSingleton<LibreHardwareMonitorSession>();
                    services.AddSingleton<WindowsPipeSourceServer>();
                    services.AddHostedService<WindowsSourceWorker>();
                })
                .Build();

            await host.RunAsync().ConfigureAwait(false);

            return 0;
        }
        catch (Exception exception)
        {
            Log.Fatal(exception, "ShoMetrics Windows service host failed.");

            return 1;
        }
        finally
        {
            await Log.CloseAndFlushAsync().ConfigureAwait(false);
        }
    }

    private static ILogger CreateBootstrapLogger()
    {
        return new LoggerConfiguration()
            .MinimumLevel.Debug()
            .WriteTo.Console()
            .CreateLogger();
    }

    private static void ConfigureSerilog(LoggerConfiguration loggerConfiguration, ServiceExecutableMode mode)
    {
        loggerConfiguration
            .MinimumLevel.Debug()
            .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
            .MinimumLevel.Override("System", LogEventLevel.Warning);

        if (mode == ServiceExecutableMode.DevPipe)
        {
            loggerConfiguration.WriteTo.Console();
        }

        // File and Event Log sinks are added in C# Step 10 with the service logging policy.
    }

    private static int WriteHelp()
    {
        Console.Out.WriteLine(
            """
            ShoMetrics Windows Source Service

            Usage:
              ShoMetrics.Source.Windows.Service.exe            Run as a Windows Service.
              ShoMetrics.Source.Windows.Service.exe --dev-pipe Run the service host in console dev mode.
              ShoMetrics.Source.Windows.Service.exe --help     Print this help.
              ShoMetrics.Source.Windows.Service.exe --version  Print the helper version.
            """);

        return 0;
    }

    private static int WriteVersion()
    {
        Console.Out.WriteLine(SourceServiceConstants.HelperVersion);

        return 0;
    }

    private static int WriteInvalidArguments(string[] args)
    {
        Console.Error.WriteLine($"Unknown arguments: {string.Join(" ", args)}");
        Console.Error.WriteLine("Run with --help for supported modes.");

        return 1;
    }
}
