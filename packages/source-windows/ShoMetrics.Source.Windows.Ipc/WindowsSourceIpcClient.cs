using System.IO.Pipes;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Ipc;

public sealed class WindowsSourceIpcClient(SourceIpcFrameCodec frameCodec)
{
    public async Task<SourceIpcResponse> SendAsync(
        SourceIpcRequest request,
        TimeSpan connectTimeout,
        TimeSpan requestTimeout,
        CancellationToken cancellationToken)
    {
        await using var pipeClientStream = new NamedPipeClientStream(
            ".",
            SourceIpcConstants.PipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);

        using CancellationTokenSource requestCancellationTokenSource =
            CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        requestCancellationTokenSource.CancelAfter(requestTimeout);

        using CancellationTokenSource connectCancellationTokenSource =
            CancellationTokenSource.CreateLinkedTokenSource(requestCancellationTokenSource.Token);
        connectCancellationTokenSource.CancelAfter(connectTimeout);

        await pipeClientStream.ConnectAsync(connectCancellationTokenSource.Token).ConfigureAwait(false);
        await frameCodec.WriteRequestAsync(pipeClientStream, request, requestCancellationTokenSource.Token).ConfigureAwait(false);

        SourceIpcResponse? response = await frameCodec
            .ReadResponseAsync(pipeClientStream, requestCancellationTokenSource.Token)
            .ConfigureAwait(false);

        if (response is null)
        {
            throw new IOException("Windows source service closed the IPC connection without a response.");
        }

        return response;
    }
}
