using System.IO.Pipes;
using Microsoft.Extensions.Logging;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class WindowsPipeSourceServer(
    WindowsPipeSecurity pipeSecurity,
    WindowsPipeClientVerifier pipeClientVerifier,
    SourceIpcFrameCodec frameCodec,
    SourceProtocolMapper protocolMapper,
    SourceRequestHandler requestHandler,
    ILogger<WindowsPipeSourceServer> logger)
{
    private static readonly TimeSpan ShutdownTimeout = TimeSpan.FromSeconds(5);

    private readonly Lock _activeClientTaskLock = new();
    private readonly HashSet<Task> _activeClientTasks = [];

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Binding named pipe server {PipeName}.", SourceServiceConstants.PipeName);

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                NamedPipeServerStream pipeServerStream = CreatePipeServerStream();

                try
                {
                    await pipeServerStream.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
                }
                catch
                {
                    await pipeServerStream.DisposeAsync().ConfigureAwait(false);
                    throw;
                }

                TrackClientTask(HandleClientConnectionAsync(pipeServerStream, cancellationToken));
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            logger.LogInformation("Named pipe server {PipeName} is stopping.", SourceServiceConstants.PipeName);
        }
        finally
        {
            await WaitForActiveClientTasksAsync().ConfigureAwait(false);
        }
    }

    private NamedPipeServerStream CreatePipeServerStream()
    {
        return NamedPipeServerStreamAcl.Create(
            SourceServiceConstants.PipeName,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            inBufferSize: 0,
            outBufferSize: 0,
            pipeSecurity.CreatePipeSecurity());
    }

    private async Task HandleClientConnectionAsync(NamedPipeServerStream pipeServerStream, CancellationToken cancellationToken)
    {
        await using (pipeServerStream.ConfigureAwait(false))
        {
            try
            {
                if (!pipeClientVerifier.IsLocalClient(pipeServerStream))
                {
                    logger.LogWarning("Rejected remote named pipe client for {PipeName}.", SourceServiceConstants.PipeName);

                    return;
                }

                logger.LogDebug("Accepted local named pipe client for {PipeName}.", SourceServiceConstants.PipeName);

                await HandleRequestLoopAsync(pipeServerStream, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
            {
                logger.LogWarning(exception, "Named pipe client handling failed for {PipeName}.", SourceServiceConstants.PipeName);
            }
        }
    }

    private async Task HandleRequestLoopAsync(NamedPipeServerStream pipeServerStream, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            SourceIpcRequest? request;

            try
            {
                request = await frameCodec.ReadRequestAsync(pipeServerStream, cancellationToken).ConfigureAwait(false);
            }
            catch (SourceIpcFrameException exception)
            {
                await HandleFrameExceptionAsync(pipeServerStream, exception, cancellationToken).ConfigureAwait(false);

                return;
            }

            if (request is null)
            {
                logger.LogDebug("Named pipe client disconnected from {PipeName}.", SourceServiceConstants.PipeName);

                return;
            }

            SourceIpcResponse response = await requestHandler.HandleAsync(request, cancellationToken).ConfigureAwait(false);

            await frameCodec.WriteResponseAsync(pipeServerStream, response, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task HandleFrameExceptionAsync(
        NamedPipeServerStream pipeServerStream,
        SourceIpcFrameException exception,
        CancellationToken cancellationToken)
    {
        logger.LogWarning(
            exception,
            "Rejected invalid Source IPC frame {FrameError} on {PipeName}.",
            exception.Error,
            SourceServiceConstants.PipeName);

        if (!exception.CanWriteErrorResponse)
        {
            return;
        }

        SourceIpcResponse response = protocolMapper.BuildFrameErrorResponse(exception);

        await frameCodec.WriteResponseAsync(pipeServerStream, response, cancellationToken).ConfigureAwait(false);
    }

    private void TrackClientTask(Task clientTask)
    {
        lock (_activeClientTaskLock)
        {
            _activeClientTasks.Add(clientTask);
        }

        _ = clientTask.ContinueWith(
            completedTask =>
            {
                lock (_activeClientTaskLock)
                {
                    _activeClientTasks.Remove(completedTask);
                }
            },
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
    }

    private async Task WaitForActiveClientTasksAsync()
    {
        Task[] activeClientTasks;

        lock (_activeClientTaskLock)
        {
            activeClientTasks = [.. _activeClientTasks];
        }

        if (activeClientTasks.Length == 0)
        {
            return;
        }

        logger.LogInformation("Waiting for {ClientCount} named pipe client task(s) to stop.", activeClientTasks.Length);

        Task allClientsStoppedTask = Task.WhenAll(activeClientTasks);
        Task timeoutTask = Task.Delay(ShutdownTimeout);
        Task completedTask = await Task.WhenAny(allClientsStoppedTask, timeoutTask).ConfigureAwait(false);

        if (completedTask == timeoutTask)
        {
            logger.LogWarning("Timed out while waiting for named pipe client task shutdown.");
        }
    }
}
