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
    Task<GetSourceHealthResponse> GetSourceHealthAsync(TimeSpan requestTimeout, CancellationToken cancellationToken);

    Task<ListMetricDescriptorsResponse> ListMetricDescriptorsAsync(TimeSpan requestTimeout, CancellationToken cancellationToken);

    Task<ReadMetricSnapshotResponse> ReadMetricSnapshotAsync(TimeSpan requestTimeout, CancellationToken cancellationToken);
}

internal sealed class HelperControlPanelSourceClient : IHelperControlPanelSourceClient
{
    private readonly GrpcChannel _channel;
    private readonly MetricSourceService.MetricSourceServiceClient _client;

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

    public async Task<GetSourceHealthResponse> GetSourceHealthAsync(
        TimeSpan requestTimeout,
        CancellationToken cancellationToken)
    {
        return await _client
            .GetSourceHealthAsync(new GetSourceHealthRequest(), BuildCallOptions(requestTimeout, cancellationToken))
            .ResponseAsync
            .ConfigureAwait(false);
    }

    public async Task<ListMetricDescriptorsResponse> ListMetricDescriptorsAsync(
        TimeSpan requestTimeout,
        CancellationToken cancellationToken)
    {
        return await _client
            .ListMetricDescriptorsAsync(new ListMetricDescriptorsRequest(), BuildCallOptions(requestTimeout, cancellationToken))
            .ResponseAsync
            .ConfigureAwait(false);
    }

    public async Task<ReadMetricSnapshotResponse> ReadMetricSnapshotAsync(
        TimeSpan requestTimeout,
        CancellationToken cancellationToken)
    {
        return await _client
            .ReadMetricSnapshotAsync(new ReadMetricSnapshotRequest(), BuildCallOptions(requestTimeout, cancellationToken))
            .ResponseAsync
            .ConfigureAwait(false);
    }

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
