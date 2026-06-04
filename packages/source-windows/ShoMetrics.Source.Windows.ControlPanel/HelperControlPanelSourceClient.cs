using System.IO.Pipes;
using System.Net;
using System.Net.Http;
using System.Security.Principal;
using Grpc.Core;
using Grpc.Net.Client;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal interface IHelperControlPanelSourceClient : IDisposable
{
    /// <summary>
    /// Reads helper health and component status, including PawnIO diagnostics.
    /// </summary>
    Task<GetSourceHealthResponse> GetSourceHealthAsync(TimeSpan requestTimeout, CancellationToken cancellationToken);

    /// <summary>
    /// Reads the current metric descriptor catalog for support diagnostics.
    /// </summary>
    Task<ListMetricDescriptorsResponse> ListMetricDescriptorsAsync(TimeSpan requestTimeout, CancellationToken cancellationToken);

    /// <summary>
    /// Reads one metric snapshot so the panel can report sample freshness.
    /// </summary>
    Task<ReadMetricSnapshotResponse> ReadMetricSnapshotAsync(TimeSpan requestTimeout, CancellationToken cancellationToken);
}

internal sealed class HelperControlPanelSourceClient : IHelperControlPanelSourceClient
{
    private readonly GrpcChannel _channel;
    private readonly MetricSourceService.MetricSourceServiceClient _client;

    /// <summary>
    /// Creates the read-only gRPC client used by the panel status surface.
    /// </summary>
    public HelperControlPanelSourceClient(TimeSpan connectTimeout)
    {
        var connectionFactory = new NamedPipeGrpcConnectionFactory(WindowsSourceServiceConstants.GrpcPipeName);
        var httpHandler = new SocketsHttpHandler
        {
            ConnectCallback = connectionFactory.ConnectAsync,
            ConnectTimeout = connectTimeout,
        };

        _channel = GrpcChannel.ForAddress("http://localhost", new GrpcChannelOptions
        {
            HttpHandler = httpHandler,
            MaxReceiveMessageSize = WindowsSourceServiceConstants.MaximumGrpcMessageBytes,
            MaxSendMessageSize = WindowsSourceServiceConstants.MaximumGrpcMessageBytes,
        });
        _client = new MetricSourceService.MetricSourceServiceClient(_channel);
    }

    /// <inheritdoc />
    public async Task<GetSourceHealthResponse> GetSourceHealthAsync(
        TimeSpan requestTimeout,
        CancellationToken cancellationToken)
    {
        return await _client
            .GetSourceHealthAsync(new GetSourceHealthRequest(), BuildCallOptions(requestTimeout, cancellationToken))
            .ResponseAsync
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<ListMetricDescriptorsResponse> ListMetricDescriptorsAsync(
        TimeSpan requestTimeout,
        CancellationToken cancellationToken)
    {
        return await _client
            .ListMetricDescriptorsAsync(new ListMetricDescriptorsRequest(), BuildCallOptions(requestTimeout, cancellationToken))
            .ResponseAsync
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<ReadMetricSnapshotResponse> ReadMetricSnapshotAsync(
        TimeSpan requestTimeout,
        CancellationToken cancellationToken)
    {
        return await _client
            .ReadMetricSnapshotAsync(new ReadMetricSnapshotRequest(), BuildCallOptions(requestTimeout, cancellationToken))
            .ResponseAsync
            .ConfigureAwait(false);
    }

    /// <summary>
    /// Closes the gRPC channel owned by this status client.
    /// </summary>
    public void Dispose()
    {
        _channel.Dispose();
    }

    private static CallOptions BuildCallOptions(TimeSpan requestTimeout, CancellationToken cancellationToken)
    {
        return new CallOptions(
            deadline: DateTime.UtcNow + requestTimeout,
            cancellationToken: cancellationToken);
    }

    private sealed class NamedPipeGrpcConnectionFactory(string pipeName)
    {
        /// <summary>
        /// Connects gRPC to the helper through a Windows named pipe instead of TCP.
        /// </summary>
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

            try
            {
                await pipeStream.ConnectAsync(cancellationToken).ConfigureAwait(false);
                return pipeStream;
            }
            catch
            {
                pipeStream.Dispose();
                throw;
            }
        }
    }
}
