using Grpc.Core;
using Microsoft.Extensions.Logging.Abstractions;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Service.Tests;

public sealed class WindowsGrpcMetricSourceServiceTests
{
    [Fact]
    public async Task GetSourceHealthReturnsHandlerResponse()
    {
        var handler = new FakeSourceRequestHandler
        {
            GetSourceHealth = _ => Task.FromResult(new GetSourceHealthResponse
            {
                SourceId = "windows-helper",
                ProtocolVersion = "1",
                HelperVersion = "test",
            }),
        };
        var service = new WindowsGrpcMetricSourceService(
            handler,
            NullLogger<WindowsGrpcMetricSourceService>.Instance);

        GetSourceHealthResponse response = await service
            .GetSourceHealth(new GetSourceHealthRequest(), new TestServerCallContext());

        Assert.Equal("windows-helper", response.SourceId);
        Assert.Equal("1", response.ProtocolVersion);
        Assert.Equal("test", response.HelperVersion);
    }

    [Fact]
    public async Task ReadMetricSnapshotMapsSourceUnavailableToUnavailable()
    {
        var handler = new FakeSourceRequestHandler
        {
            ReadMetricSnapshot = _ => throw new SourceRequestException(
                SourceRequestFailureKind.SourceUnavailable,
                "Windows source reader is unavailable."),
        };
        var service = new WindowsGrpcMetricSourceService(
            handler,
            NullLogger<WindowsGrpcMetricSourceService>.Instance);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.ReadMetricSnapshot(new ReadMetricSnapshotRequest(), new TestServerCallContext()));

        Assert.Equal(StatusCode.Unavailable, exception.StatusCode);
    }

    [Fact]
    public async Task ListMetricDescriptorsMapsTimeoutToDeadlineExceeded()
    {
        var handler = new FakeSourceRequestHandler
        {
            ListMetricDescriptors = _ => throw new SourceRequestException(
                SourceRequestFailureKind.Timeout,
                "Descriptor read timed out."),
        };
        var service = new WindowsGrpcMetricSourceService(
            handler,
            NullLogger<WindowsGrpcMetricSourceService>.Instance);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.ListMetricDescriptors(new ListMetricDescriptorsRequest(), new TestServerCallContext()));

        Assert.Equal(StatusCode.DeadlineExceeded, exception.StatusCode);
    }

    [Fact]
    public async Task ReadMetricSnapshotMapsInvalidArgumentToInvalidArgument()
    {
        var handler = new FakeSourceRequestHandler
        {
            ReadMetricSnapshot = _ => throw new SourceRequestException(
                SourceRequestFailureKind.InvalidArgument,
                "Read snapshot request is invalid."),
        };
        var service = new WindowsGrpcMetricSourceService(
            handler,
            NullLogger<WindowsGrpcMetricSourceService>.Instance);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.ReadMetricSnapshot(new ReadMetricSnapshotRequest(), new TestServerCallContext()));

        Assert.Equal(StatusCode.InvalidArgument, exception.StatusCode);
    }

    [Fact]
    public async Task ListMetricDescriptorsMapsFailedPreconditionToFailedPrecondition()
    {
        var handler = new FakeSourceRequestHandler
        {
            ListMetricDescriptors = _ => throw new SourceRequestException(
                SourceRequestFailureKind.FailedPrecondition,
                "Descriptor request precondition is missing."),
        };
        var service = new WindowsGrpcMetricSourceService(
            handler,
            NullLogger<WindowsGrpcMetricSourceService>.Instance);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.ListMetricDescriptors(new ListMetricDescriptorsRequest(), new TestServerCallContext()));

        Assert.Equal(StatusCode.FailedPrecondition, exception.StatusCode);
    }

    [Fact]
    public async Task GetSourceHealthMapsClientCancellationToCancelled()
    {
        using var cancellationTokenSource = new CancellationTokenSource();
        await cancellationTokenSource.CancelAsync();

        var handler = new FakeSourceRequestHandler
        {
            GetSourceHealth = cancellationToken => throw new OperationCanceledException(cancellationToken),
        };
        var service = new WindowsGrpcMetricSourceService(
            handler,
            NullLogger<WindowsGrpcMetricSourceService>.Instance);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.GetSourceHealth(
                new GetSourceHealthRequest(),
                new TestServerCallContext(cancellationTokenSource.Token)));

        Assert.Equal(StatusCode.Cancelled, exception.StatusCode);
    }

    private sealed class FakeSourceRequestHandler : ISourceRequestHandler
    {
        public Func<CancellationToken, Task<GetSourceHealthResponse>> GetSourceHealth { get; init; } =
            _ => Task.FromResult(new GetSourceHealthResponse());

        public Func<CancellationToken, Task<ListMetricDescriptorsResponse>> ListMetricDescriptors { get; init; } =
            _ => Task.FromResult(new ListMetricDescriptorsResponse());

        public Func<CancellationToken, Task<ReadMetricSnapshotResponse>> ReadMetricSnapshot { get; init; } =
            _ => Task.FromResult(new ReadMetricSnapshotResponse());

        public Task<GetSourceHealthResponse> GetSourceHealthAsync(
            GetSourceHealthRequest request,
            CancellationToken cancellationToken)
        {
            return GetSourceHealth(cancellationToken);
        }

        public Task<ListMetricDescriptorsResponse> ListMetricDescriptorsAsync(
            ListMetricDescriptorsRequest request,
            CancellationToken cancellationToken)
        {
            return ListMetricDescriptors(cancellationToken);
        }

        public Task<ReadMetricSnapshotResponse> ReadMetricSnapshotAsync(
            ReadMetricSnapshotRequest request,
            CancellationToken cancellationToken)
        {
            return ReadMetricSnapshot(cancellationToken);
        }
    }

    private sealed class TestServerCallContext(CancellationToken cancellationToken = default) : ServerCallContext
    {
        private readonly Metadata _requestHeaders = [];
        private readonly Metadata _responseTrailers = [];
        private readonly Dictionary<object, object> _userState = [];
        private readonly AuthContext _authContext = new("", []);
        private Status _status;
        private WriteOptions? _writeOptions;

        protected override string MethodCore => "test";

        protected override string HostCore => "localhost";

        protected override string PeerCore => "test";

        protected override DateTime DeadlineCore => DateTime.UtcNow.AddMinutes(1);

        protected override Metadata RequestHeadersCore => _requestHeaders;

        protected override CancellationToken CancellationTokenCore => cancellationToken;

        protected override Metadata ResponseTrailersCore => _responseTrailers;

        protected override Status StatusCore
        {
            get => _status;
            set => _status = value;
        }

        protected override WriteOptions? WriteOptionsCore
        {
            get => _writeOptions;
            set => _writeOptions = value;
        }

        protected override AuthContext AuthContextCore => _authContext;

        protected override IDictionary<object, object> UserStateCore => _userState;

        protected override Task WriteResponseHeadersAsyncCore(Metadata responseHeaders)
        {
            return Task.CompletedTask;
        }

        protected override ContextPropagationToken CreatePropagationTokenCore(ContextPropagationOptions? options)
        {
            throw new NotSupportedException();
        }
    }
}
