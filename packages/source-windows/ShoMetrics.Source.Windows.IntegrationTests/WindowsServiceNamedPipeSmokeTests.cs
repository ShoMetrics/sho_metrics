using System.Diagnostics;
using System.Globalization;
using System.IO.Pipes;
using System.Net;
using System.Net.Http;
using System.Security.Principal;
using Grpc.Core;
using Grpc.Net.Client;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.IntegrationTests;

public sealed class WindowsServiceNamedPipeSmokeTests
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromMilliseconds(750);
    private static readonly TimeSpan StartupRetryDelay = TimeSpan.FromMilliseconds(100);

    [Fact]
    public async Task DevPipeProcessAcceptsHealthRpcAndStopsCleanly()
    {
        string pipeName = $"ShoMetrics.Source.Windows.IntegrationTests.{Guid.NewGuid():N}";
        ServiceProcess serviceProcess = ServiceProcess.Start(pipeName);

        try
        {
            GetSourceHealthResponse response = await WaitForHealthAsync(pipeName, serviceProcess);

            Assert.Equal("windows-helper", response.SourceId);
            Assert.Equal("1", response.ProtocolVersion);
            Assert.False(string.IsNullOrWhiteSpace(response.HelperVersion));

            await serviceProcess.StopAsync();
            Assert.Equal(0, serviceProcess.ExitCode);
        }
        finally
        {
            await serviceProcess.DisposeAsync();
        }
    }

    private static async Task<GetSourceHealthResponse> WaitForHealthAsync(
        string pipeName,
        ServiceProcess serviceProcess)
    {
        DateTimeOffset startupDeadline = DateTimeOffset.UtcNow + StartupTimeout;
        Exception? lastException = null;

        while (DateTimeOffset.UtcNow < startupDeadline)
        {
            if (serviceProcess.HasExited)
            {
                throw new InvalidOperationException(
                    $"Service process exited before accepting a health RPC. {serviceProcess.DescribeDiagnostics()}");
            }

            try
            {
                using GrpcChannel channel = CreateChannel(pipeName);
                var client = new MetricSourceService.MetricSourceServiceClient(channel);
                using CancellationTokenSource requestCancellationTokenSource = new(RequestTimeout);

                return await client
                    .GetSourceHealthAsync(
                        new GetSourceHealthRequest(),
                        new CallOptions(
                            deadline: DateTime.UtcNow + RequestTimeout,
                            cancellationToken: requestCancellationTokenSource.Token))
                    .ResponseAsync
                    .ConfigureAwait(false);
            }
            catch (Exception exception) when (IsTransientStartupException(exception))
            {
                lastException = exception;
                await Task.Delay(StartupRetryDelay).ConfigureAwait(false);
            }
        }

        throw new TimeoutException(
            $"Service did not accept a health RPC before the startup timeout. "
            + $"lastError={FormatException(lastException)} {serviceProcess.DescribeDiagnostics()}");
    }

    private static GrpcChannel CreateChannel(string pipeName)
    {
        NamedPipeGrpcConnectionFactory connectionFactory = new(pipeName, ConnectTimeout);
        var httpHandler = new SocketsHttpHandler
        {
            ConnectCallback = connectionFactory.ConnectAsync,
            ConnectTimeout = ConnectTimeout,
        };

        return GrpcChannel.ForAddress("http://localhost", new GrpcChannelOptions
        {
            HttpHandler = httpHandler,
        });
    }

    private static bool IsTransientStartupException(Exception exception)
    {
        return exception switch
        {
            RpcException rpcException => IsTransientStartupRpcException(rpcException),
            OperationCanceledException => true,
            IOException => true,
            HttpRequestException => true,
            TimeoutException => true,
            _ => false,
        };
    }

    private static bool IsTransientStartupRpcException(RpcException exception)
    {
        if (IsTransientStartupStatus(exception.StatusCode))
        {
            return true;
        }

        return exception.StatusCode == StatusCode.Internal
            && exception.InnerException is HttpRequestException;
    }

    private static bool IsTransientStartupStatus(StatusCode statusCode)
    {
        return statusCode is StatusCode.Unavailable
            or StatusCode.DeadlineExceeded
            or StatusCode.Cancelled;
    }

    private static string FormatException(Exception? exception)
    {
        return exception is null
            ? "none"
            : $"{exception.GetType().Name}: {exception.Message}";
    }

    private sealed class NamedPipeGrpcConnectionFactory(string pipeName, TimeSpan connectTimeout)
    {
        public async ValueTask<Stream> ConnectAsync(
            SocketsHttpConnectionContext _,
            CancellationToken cancellationToken)
        {
            var pipeStream = new NamedPipeClientStream(
                serverName: ".",
                pipeName: pipeName,
                direction: PipeDirection.InOut,
                options: PipeOptions.WriteThrough | PipeOptions.Asynchronous,
                impersonationLevel: TokenImpersonationLevel.Anonymous);

            using CancellationTokenSource timeoutCancellationTokenSource =
                CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCancellationTokenSource.CancelAfter(connectTimeout);

            try
            {
                await pipeStream.ConnectAsync(timeoutCancellationTokenSource.Token).ConfigureAwait(false);
                return pipeStream;
            }
            catch
            {
                pipeStream.Dispose();
                throw;
            }
        }
    }

    private sealed class ServiceProcess : IAsyncDisposable
    {
        private static readonly TimeSpan GracefulShutdownTimeout = TimeSpan.FromSeconds(10);
        private static readonly TimeSpan KillTimeout = TimeSpan.FromSeconds(5);
        private readonly Process _process;
        private readonly FileStream _standardOutputFile;
        private readonly FileStream _standardErrorFile;
        private readonly Task _standardOutputCopyTask;
        private readonly Task _standardErrorCopyTask;
        private bool _isDisposed;
        private bool _stopRequested;

        private ServiceProcess(
            Process process,
            string diagnosticsDirectory,
            string standardOutputPath,
            string standardErrorPath,
            FileStream standardOutputFile,
            FileStream standardErrorFile,
            Task standardOutputCopyTask,
            Task standardErrorCopyTask)
        {
            _process = process;
            DiagnosticsDirectory = diagnosticsDirectory;
            StandardOutputPath = standardOutputPath;
            StandardErrorPath = standardErrorPath;
            _standardOutputFile = standardOutputFile;
            _standardErrorFile = standardErrorFile;
            _standardOutputCopyTask = standardOutputCopyTask;
            _standardErrorCopyTask = standardErrorCopyTask;
        }

        public string DiagnosticsDirectory { get; }

        public string StandardOutputPath { get; }

        public string StandardErrorPath { get; }

        public bool HasExited => _process.HasExited;

        public int? ExitCode => _process.HasExited ? _process.ExitCode : null;

        public static ServiceProcess Start(string pipeName)
        {
            ServiceExecutableCommand executable = ResolveServiceExecutable();
            string diagnosticsDirectory = CreateDiagnosticsDirectory();
            string standardOutputPath = Path.Combine(diagnosticsDirectory, "service.stdout.log");
            string standardErrorPath = Path.Combine(diagnosticsDirectory, "service.stderr.log");
            FileStream standardOutputFile = CreateLogFile(standardOutputPath);
            FileStream standardErrorFile = CreateLogFile(standardErrorPath);

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = executable.FileName,
                    WorkingDirectory = executable.WorkingDirectory,
                    UseShellExecute = false,
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };

                foreach (string executableArgument in executable.Arguments)
                {
                    startInfo.ArgumentList.Add(executableArgument);
                }

                startInfo.ArgumentList.Add("--pipe-name");
                startInfo.ArgumentList.Add(pipeName);

                var process = new Process
                {
                    StartInfo = startInfo,
                };

                if (!process.Start())
                {
                    throw new InvalidOperationException("Service process did not start.");
                }

                Task standardOutputCopyTask = process.StandardOutput.BaseStream.CopyToAsync(standardOutputFile);
                Task standardErrorCopyTask = process.StandardError.BaseStream.CopyToAsync(standardErrorFile);

                return new ServiceProcess(
                    process,
                    diagnosticsDirectory,
                    standardOutputPath,
                    standardErrorPath,
                    standardOutputFile,
                    standardErrorFile,
                    standardOutputCopyTask,
                    standardErrorCopyTask);
            }
            catch
            {
                standardOutputFile.Dispose();
                standardErrorFile.Dispose();
                throw;
            }
        }

        public async Task StopAsync()
        {
            if (_stopRequested)
            {
                return;
            }

            _stopRequested = true;
            TryCloseStandardInput();

            if (_process.HasExited)
            {
                await CompleteOutputCaptureAsync().ConfigureAwait(false);
                return;
            }

            using CancellationTokenSource gracefulShutdownCancellationTokenSource =
                new(GracefulShutdownTimeout);

            try
            {
                await _process.WaitForExitAsync(gracefulShutdownCancellationTokenSource.Token)
                    .ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                TryKillProcessTree();
                throw new TimeoutException(
                    $"Service process did not exit after stdin closed. {DescribeDiagnostics()}");
            }

            await CompleteOutputCaptureAsync().ConfigureAwait(false);
        }

        public async ValueTask DisposeAsync()
        {
            if (_isDisposed)
            {
                return;
            }

            _isDisposed = true;

            try
            {
                if (!_process.HasExited)
                {
                    TryKillProcessTree();
                    using CancellationTokenSource killCancellationTokenSource = new(KillTimeout);
                    await _process.WaitForExitAsync(killCancellationTokenSource.Token).ConfigureAwait(false);
                }

                await CompleteOutputCaptureAsync().ConfigureAwait(false);
            }
            finally
            {
                _standardOutputFile.Dispose();
                _standardErrorFile.Dispose();
                _process.Dispose();
            }
        }

        public string DescribeDiagnostics()
        {
            return string.Create(
                CultureInfo.InvariantCulture,
                $"exitCode={ExitCode?.ToString(CultureInfo.InvariantCulture) ?? "running"} "
                + $"diagnosticsDirectory={DiagnosticsDirectory} stdout={StandardOutputPath} stderr={StandardErrorPath}");
        }

        private static ServiceExecutableCommand ResolveServiceExecutable()
        {
            string outputDirectory = AppContext.BaseDirectory;
            string executablePath = Path.Combine(
                outputDirectory,
                "ShoMetrics.Source.Windows.IntegrationTestHost.exe");

            // Local and CI test layouts can expose either the apphost exe or the dll
            // beside the test assembly, depending on how the project was built.
            if (File.Exists(executablePath))
            {
                return new ServiceExecutableCommand(
                    executablePath,
                    [],
                    Path.GetDirectoryName(executablePath) ?? outputDirectory);
            }

            string serviceAssemblyPath = Path.Combine(
                outputDirectory,
                "ShoMetrics.Source.Windows.IntegrationTestHost.dll");
            if (File.Exists(serviceAssemblyPath))
            {
                return new ServiceExecutableCommand(
                    "dotnet",
                    [serviceAssemblyPath],
                    Path.GetDirectoryName(serviceAssemblyPath) ?? outputDirectory);
            }

            throw new FileNotFoundException(
                $"Could not find ShoMetrics.Source.Windows.IntegrationTestHost output beside integration tests. directory={outputDirectory}");
        }

        private static string CreateDiagnosticsDirectory()
        {
            string rootDirectory =
                Environment.GetEnvironmentVariable("SHOMETRICS_SOURCE_WINDOWS_TEST_ARTIFACT_DIR")
                ?? Path.Combine(Path.GetTempPath(), "ShoMetrics.Source.Windows.IntegrationTests");
            string directoryName = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmssfff", CultureInfo.InvariantCulture)
                + "-"
                + Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture);
            string diagnosticsDirectory = Path.Combine(rootDirectory, directoryName);
            Directory.CreateDirectory(diagnosticsDirectory);
            return diagnosticsDirectory;
        }

        private static FileStream CreateLogFile(string path)
        {
            return new FileStream(
                path,
                FileMode.Create,
                FileAccess.Write,
                FileShare.ReadWrite,
                bufferSize: 4096,
                FileOptions.Asynchronous);
        }

        private void TryCloseStandardInput()
        {
            try
            {
                _process.StandardInput.Close();
            }
            catch (Exception exception) when (exception is InvalidOperationException or IOException)
            {
            }
        }

        private void TryKillProcessTree()
        {
            try
            {
                _process.Kill(entireProcessTree: true);
            }
            catch (Exception exception) when (exception is InvalidOperationException or NotSupportedException)
            {
            }
        }

        private async Task CompleteOutputCaptureAsync()
        {
            try
            {
                await Task.WhenAll(_standardOutputCopyTask, _standardErrorCopyTask).ConfigureAwait(false);
            }
            catch (Exception exception) when (
                exception is IOException
                or ObjectDisposedException
                or OperationCanceledException
                or InvalidOperationException)
            {
                // Output files are diagnostics only; RPC assertions and process exit
                // decide the smoke test result.
            }
        }
    }

    private sealed record ServiceExecutableCommand(
        string FileName,
        IReadOnlyList<string> Arguments,
        string WorkingDirectory);
}
