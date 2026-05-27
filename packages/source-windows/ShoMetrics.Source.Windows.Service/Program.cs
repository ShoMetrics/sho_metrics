using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Connections.Features;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.AspNetCore.Server.Kestrel.Transport.NamedPipes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;
using Serilog.Events;
using ShoMetrics.Source.Windows.Core;
using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.Service;

internal static class Program
{
    private const long LogFileSizeLimitBytes = 10 * 1024 * 1024;
    private const int RetainedLogFileCountLimit = 14;
    private const string LogOutputTemplate =
        "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {SourceContext} {Message:lj}{NewLine}{Exception}";

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

    private static async Task<int> RunHostAsync(string[] args, ServiceExecutableMode mode)
    {
        Log.Logger = CreateBootstrapLogger(mode);

        try
        {
            using IHost host = Host.CreateDefaultBuilder(args)
                .UseWindowsService(options => options.ServiceName = WindowsSourceServiceConstants.ServiceName)
                .UseSerilog((_, _, loggerConfiguration) => ConfigureSerilog(loggerConfiguration, mode))
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    ConfigureGrpcNamedPipeHost(webBuilder);
                })
                .ConfigureServices(services =>
                {
                    services.AddGrpc(options =>
                    {
                        options.MaxReceiveMessageSize = WindowsSourceServiceConstants.MaximumGrpcMessageBytes;
                        options.MaxSendMessageSize = WindowsSourceServiceConstants.MaximumGrpcMessageBytes;
                    });
                    services.AddSingleton(TimeProvider.System);
                    services.AddSingleton<LibreHardwareMonitorSession>();
                    services.AddSingleton<WindowsPipeClientVerifier>();
                    services.AddSingleton<SourceProtocolMapper>();
                    services.AddSingleton<SourceMethodRateLimiter>();
                    services.AddSingleton<SourceRequestHandler>();
                    services.AddSingleton<ISourceRequestHandler>(provider =>
                        provider.GetRequiredService<SourceRequestHandler>());
                    services.AddHostedService<WindowsMetricSnapshotWorker>();
                })
                .Build();

            Log.Information(
                "Starting ShoMetrics Windows source gRPC service for source {SourceId}, protocol {ProtocolVersion}, and pipe {PipeName}.",
                WindowsSourceServiceIdentity.SourceId,
                WindowsSourceServiceIdentity.ProtocolVersion,
                WindowsSourceServiceConstants.GrpcPipeName);

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

    private static void ConfigureGrpcNamedPipeHost(IWebHostBuilder webBuilder)
    {
        webBuilder.UseNamedPipes(options =>
        {
            // Kestrel's named-pipe transport defaults to same user + same
            // elevation. The service can run elevated/LocalSystem while the
            // Stream Deck plugin runs as the interactive user, so access is
            // intentionally controlled by the explicit pipe ACL instead.
            options.CurrentUserOnly = false;
            options.PipeSecurity = WindowsPipeSecurity.CreatePipeSecurity();
        });

        webBuilder.ConfigureKestrel(options =>
        {
            options.ListenNamedPipe(WindowsSourceServiceConstants.GrpcPipeName, listenOptions =>
            {
                listenOptions.Protocols = HttpProtocols.Http2;
            });
        });

        webBuilder.Configure(app =>
        {
            app.Use(VerifyNamedPipeClientAsync);
            app.UseRouting();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapGrpcService<WindowsGrpcMetricSourceService>();
            });
        });
    }

    private static async Task VerifyNamedPipeClientAsync(HttpContext context, Func<Task> next)
    {
        IConnectionNamedPipeFeature? namedPipeFeature = context.Features.Get<IConnectionNamedPipeFeature>();
        if (namedPipeFeature is not null)
        {
            WindowsPipeClientVerifier pipeClientVerifier =
                context.RequestServices.GetRequiredService<WindowsPipeClientVerifier>();

            if (!pipeClientVerifier.IsLocalClient(namedPipeFeature.NamedPipe))
            {
                Log.Warning(
                    "Rejected remote gRPC named pipe client for {PipeName}.",
                    WindowsSourceServiceConstants.GrpcPipeName);

                context.Response.StatusCode = StatusCodes.Status403Forbidden;

                return;
            }
        }

        await next().ConfigureAwait(false);
    }

    private static ILogger CreateBootstrapLogger(ServiceExecutableMode mode)
    {
        LogEventLevel minimumLevel = ResolveMinimumLogLevel(mode);

        return new LoggerConfiguration()
            .MinimumLevel.Is(minimumLevel)
            .WriteTo.File(
                WindowsSourceServicePaths.ResolveLogFilePath(),
                restrictedToMinimumLevel: minimumLevel,
                outputTemplate: LogOutputTemplate,
                rollingInterval: RollingInterval.Day,
                rollOnFileSizeLimit: true,
                fileSizeLimitBytes: LogFileSizeLimitBytes,
                retainedFileCountLimit: RetainedLogFileCountLimit)
            .WriteTo.Console()
            .CreateLogger();
    }

    private static void ConfigureSerilog(LoggerConfiguration loggerConfiguration, ServiceExecutableMode mode)
    {
        LogEventLevel minimumLevel = ResolveMinimumLogLevel(mode);

        loggerConfiguration
            .MinimumLevel.Is(minimumLevel)
            .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
            .MinimumLevel.Override("System", LogEventLevel.Warning)
            .Enrich.FromLogContext()
            .WriteTo.File(
                WindowsSourceServicePaths.ResolveLogFilePath(),
                restrictedToMinimumLevel: minimumLevel,
                outputTemplate: LogOutputTemplate,
                rollingInterval: RollingInterval.Day,
                rollOnFileSizeLimit: true,
                fileSizeLimitBytes: LogFileSizeLimitBytes,
                retainedFileCountLimit: RetainedLogFileCountLimit);

        if (mode == ServiceExecutableMode.WindowsService)
        {
            loggerConfiguration.WriteTo.EventLog(
                WindowsSourceServiceConstants.ServiceName,
                logName: "Application",
                manageEventSource: true,
                restrictedToMinimumLevel: LogEventLevel.Warning);
        }

        if (mode == ServiceExecutableMode.DevPipe)
        {
            loggerConfiguration.WriteTo.Console(outputTemplate: LogOutputTemplate);
        }
    }

    private static LogEventLevel ResolveMinimumLogLevel(ServiceExecutableMode mode)
    {
        return mode == ServiceExecutableMode.DevPipe
            ? LogEventLevel.Debug
            : LogEventLevel.Information;
    }

    private static int WriteHelp()
    {
        Console.Out.WriteLine(
            """
            ShoMetrics Windows Source Service

            Usage:
              ShoMetrics.Source.Windows.Service.exe            Run as a Windows Service.
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
