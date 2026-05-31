using Microsoft.Extensions.Hosting;
using ShoMetrics.Source.Windows.Service;

namespace ShoMetrics.Source.Windows.IntegrationTestHost;

internal static class Program
{
    private static readonly TimeSpan StopTimeout = TimeSpan.FromSeconds(5);

    public static Task<int> Main(string[] args)
    {
        if (!TryParsePipeName(args, out string pipeName))
        {
            return Task.FromResult(WriteInvalidArguments(args));
        }

        // This test-only executable shares the real service host to prevent config drift
        // while keeping pipe-name and pipe-security knobs out of the shipped service CLI.
        var hostOptions = new WindowsSourceServiceHostOptions(
            ServiceExecutableMode.DevPipe,
            pipeName,
            WindowsPipeSecurityMode.UnsafeCurrentUserOnly);

        return WindowsSourceServiceHost.RunWithLoggingAsync(
            [],
            hostOptions,
            RunUntilStandardInputClosesAsync);
    }

    private static bool TryParsePipeName(string[] args, out string pipeName)
    {
        if (args.Length == 2
            && args[0].Equals("--pipe-name", StringComparison.Ordinal)
            && !string.IsNullOrWhiteSpace(args[1]))
        {
            pipeName = args[1];
            return true;
        }

        pipeName = "";
        return false;
    }

    private static async Task RunUntilStandardInputClosesAsync(IHost host)
    {
        await host.StartAsync().ConfigureAwait(false);

        try
        {
            await WaitForStandardInputCloseAsync().ConfigureAwait(false);
        }
        finally
        {
            using CancellationTokenSource stopCancellationTokenSource = new(StopTimeout);
            await host.StopAsync(stopCancellationTokenSource.Token).ConfigureAwait(false);
        }
    }

    private static async Task WaitForStandardInputCloseAsync()
    {
        // The parent test closes stdin as the shutdown signal, so the production
        // service does not need a test-only exit flag.
        char[] buffer = new char[1];
        while (await Console.In.ReadAsync(buffer.AsMemory(0, 1)).ConfigureAwait(false) > 0)
        {
        }
    }

    private static int WriteInvalidArguments(string[] args)
    {
        Console.Error.WriteLine($"Unknown arguments: {string.Join(" ", args)}");
        Console.Error.WriteLine(
            "Usage: ShoMetrics.Source.Windows.IntegrationTestHost.exe --pipe-name NAME");

        return 1;
    }
}
