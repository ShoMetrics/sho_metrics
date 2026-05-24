using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ShoMetrics.Source.Windows.Ipc;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class WindowsSourceWorker(
    WindowsPipeSourceServer pipeSourceServer,
    ILogger<WindowsSourceWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "Starting ShoMetrics Windows source worker for source {SourceId} and protocol {ProtocolVersion}.",
            WindowsSourceServiceIdentity.SourceId,
            WindowsSourceServiceIdentity.ProtocolVersion);

        try
        {
            await pipeSourceServer.RunAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            logger.LogInformation("Stopping ShoMetrics Windows source worker.");
        }
    }
}
