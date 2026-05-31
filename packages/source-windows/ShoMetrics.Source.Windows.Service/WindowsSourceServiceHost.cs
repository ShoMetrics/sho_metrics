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
using ShoMetrics.Source.Windows.Contracts;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service;

internal static class WindowsSourceServiceHost
{
    private const long LogFileSizeLimitBytes = 10 * 1024 * 1024;
    private const int RetainedLogFileCountLimit = 14;
    private const string LogOutputTemplate =
        "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {SourceContext} {Message:lj}{NewLine}{Exception}";

    internal static IHost Build(string[] args, WindowsSourceServiceHostOptions options)
    {
        return Host.CreateDefaultBuilder(args)
            .UseWindowsService(windowsServiceOptions =>
                windowsServiceOptions.ServiceName = WindowsSourceServiceConstants.ServiceName)
            .UseSerilog((_, _, loggerConfiguration) => ConfigureSerilog(loggerConfiguration, options.Mode))
            .ConfigureWebHostDefaults(webBuilder =>
            {
                ConfigureGrpcNamedPipeHost(webBuilder, options);
            })
            .ConfigureServices(services =>
            {
                services.AddGrpc(grpcOptions =>
                {
                    grpcOptions.MaxReceiveMessageSize = WindowsSourceServiceConstants.MaximumGrpcMessageBytes;
                    grpcOptions.MaxSendMessageSize = WindowsSourceServiceConstants.MaximumGrpcMessageBytes;
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
    }

    internal static async Task<int> RunWithLoggingAsync(
        string[] args,
        WindowsSourceServiceHostOptions options,
        Func<IHost, Task> runHostAsync)
    {
        Log.Logger = CreateBootstrapLogger(options.Mode);

        try
        {
            using IHost host = Build(args, options);
            LogStarting(options);

            await runHostAsync(host).ConfigureAwait(false);

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

    private static void LogStarting(WindowsSourceServiceHostOptions options)
    {
        Log.Information(
            "Starting ShoMetrics Windows source gRPC service for source {SourceId}, protocol {ProtocolVersion}, and pipe {PipeName}.",
            WindowsSourceServiceIdentity.SourceId,
            WindowsSourceServiceIdentity.ProtocolVersion,
            options.PipeName);
    }

    private static void ConfigureGrpcNamedPipeHost(
        IWebHostBuilder webBuilder,
        WindowsSourceServiceHostOptions options)
    {
        webBuilder.UseNamedPipes(pipeOptions =>
        {
            if (options.PipeSecurityMode == WindowsPipeSecurityMode.UnsafeCurrentUserOnly)
            {
                pipeOptions.CurrentUserOnly = true;
                return;
            }

            // Kestrel's named-pipe transport defaults to same user + same
            // elevation. The service can run elevated/LocalSystem while the
            // Stream Deck plugin runs as the interactive user, so access is
            // intentionally controlled by the explicit pipe ACL instead.
            pipeOptions.CurrentUserOnly = false;
            pipeOptions.PipeSecurity = WindowsPipeSecurity.CreatePipeSecurity();
        });

        webBuilder.ConfigureKestrel(kestrelOptions =>
        {
            kestrelOptions.ListenNamedPipe(options.PipeName, listenOptions =>
            {
                listenOptions.Protocols = HttpProtocols.Http2;
            });
        });

        webBuilder.Configure(app =>
        {
            app.Use((context, next) => VerifyNamedPipeClientAsync(context, next, options.PipeName));
            app.UseRouting();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapGrpcService<WindowsGrpcMetricSourceService>();
            });
        });
    }

    private static async Task VerifyNamedPipeClientAsync(HttpContext context, Func<Task> next, string pipeName)
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
                    pipeName);

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
            // Dev builds keep gRPC debug logs except the server call handler's
            // per-message read/write traces, which add volume without source
            // operation context.
            .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
            .MinimumLevel.Override("System", LogEventLevel.Warning)
            .MinimumLevel.Override("Grpc.AspNetCore.Server.ServerCallHandler", LogEventLevel.Warning)
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
}
