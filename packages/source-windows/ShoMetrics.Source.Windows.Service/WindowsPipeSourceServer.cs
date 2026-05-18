using Microsoft.Extensions.Logging;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class WindowsPipeSourceServer(ILogger<WindowsPipeSourceServer> logger)
{
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        logger.LogWarning(
            "Named pipe server {PipeName} is not implemented yet. Continue with C# Step 4.",
            SourceServiceConstants.PipeName);

        await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken).ConfigureAwait(false);
    }
}
