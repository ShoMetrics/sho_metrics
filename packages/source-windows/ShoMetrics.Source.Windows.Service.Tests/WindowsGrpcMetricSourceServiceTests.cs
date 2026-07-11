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
        WindowsGrpcMetricSourceService service = CreateService(handler);

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
        WindowsGrpcMetricSourceService service = CreateService(handler);

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
        WindowsGrpcMetricSourceService service = CreateService(handler);

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
        WindowsGrpcMetricSourceService service = CreateService(handler);

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
        WindowsGrpcMetricSourceService service = CreateService(handler);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.ListMetricDescriptors(new ListMetricDescriptorsRequest(), new TestServerCallContext()));

        Assert.Equal(StatusCode.FailedPrecondition, exception.StatusCode);
    }

    [Fact]
    public async Task ReadMetricSnapshotMapsResourceExhaustedToResourceExhausted()
    {
        var handler = new FakeSourceRequestHandler
        {
            ReadMetricSnapshot = _ => throw new SourceRequestException(
                SourceRequestFailureKind.ResourceExhausted,
                "Read snapshot request was rate limited."),
        };
        WindowsGrpcMetricSourceService service = CreateService(handler);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.ReadMetricSnapshot(new ReadMetricSnapshotRequest(), new TestServerCallContext()));

        Assert.Equal(StatusCode.ResourceExhausted, exception.StatusCode);
    }

    [Fact]
    public async Task SetMetricRefreshDemandReturnsHandlerResponse()
    {
        var handler = new FakeSourceRequestHandler
        {
            SetMetricRefreshDemand = _ => Task.FromResult(new SetMetricRefreshDemandResponse
            {
                AcceptedGroupCount = 1,
                EffectiveMinimumIntervalMilliseconds = 1000,
                DemandTtlMilliseconds = 15000,
            }),
        };
        WindowsGrpcMetricSourceService service = CreateService(handler);

        SetMetricRefreshDemandResponse response = await service
            .SetMetricRefreshDemand(new SetMetricRefreshDemandRequest(), new TestServerCallContext());

        Assert.Equal(1u, response.AcceptedGroupCount);
        Assert.Equal(1000u, response.EffectiveMinimumIntervalMilliseconds);
        Assert.Equal(15000u, response.DemandTtlMilliseconds);
    }

    [Fact]
    public async Task SetMetricRefreshDemandAppliesServiceRateLimit()
    {
        WindowsGrpcMetricSourceService service = CreateService(new FakeSourceRequestHandler());

        await service.SetMetricRefreshDemand(new SetMetricRefreshDemandRequest(), new TestServerCallContext());
        await service.SetMetricRefreshDemand(new SetMetricRefreshDemandRequest(), new TestServerCallContext());

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.SetMetricRefreshDemand(new SetMetricRefreshDemandRequest(), new TestServerCallContext()));

        Assert.Equal(StatusCode.ResourceExhausted, exception.StatusCode);
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
        WindowsGrpcMetricSourceService service = CreateService(handler);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.GetSourceHealth(
                new GetSourceHealthRequest(),
                new TestServerCallContext(cancellationTokenSource.Token)));

        Assert.Equal(StatusCode.Cancelled, exception.StatusCode);
    }

    [Fact]
    public async Task GetSourceHealthRethrowsRpcException()
    {
        var expectedException = new RpcException(new Status(
            StatusCode.FailedPrecondition,
            "Source precondition failed."));
        var handler = new FakeSourceRequestHandler
        {
            GetSourceHealth = _ => throw expectedException,
        };
        WindowsGrpcMetricSourceService service = CreateService(handler);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.GetSourceHealth(new GetSourceHealthRequest(), new TestServerCallContext()));

        Assert.Same(expectedException, exception);
    }

    [Fact]
    public async Task GetSourceHealthMapsUnexpectedExceptionToInternal()
    {
        var handler = new FakeSourceRequestHandler
        {
            GetSourceHealth = _ => throw new InvalidOperationException("Unexpected handler failure."),
        };
        WindowsGrpcMetricSourceService service = CreateService(handler);

        RpcException exception = await Assert.ThrowsAsync<RpcException>(() =>
            service.GetSourceHealth(new GetSourceHealthRequest(), new TestServerCallContext()));

        Assert.Equal(StatusCode.Internal, exception.StatusCode);
    }

    [Theory]
    [InlineData(true, false, 0, 0, false, true)]   // A slow read always warns, even when empty.
    [InlineData(true, true, 0, 0, false, true)]    // Slow wins over every quiet exception.
    [InlineData(false, true, 5, 0, false, true)]   // Stale data that has readings is a real fault.
    [InlineData(false, true, 0, 3, true, true)]    // Requested metrics missing while demanded: a fault.
    [InlineData(false, true, 0, 3, false, false)]  // Requested metrics missing, nothing demands: idle, quiet.
    [InlineData(false, true, 0, 0, true, false)]   // Unfiltered diagnostic read: global snapshot age is not a freshness signal, quiet even with demand.
    [InlineData(false, true, 0, 0, false, false)]  // Unfiltered diagnostic read while idle: quiet.
    [InlineData(false, false, 0, 0, false, false)] // Fresh read never warns.
    public void ShouldWarnSnapshotSlowOrStaleKeepsIdleSnapshotsQuiet(
        bool isSlow,
        bool isStale,
        int metricCount,
        int unavailableMetricCount,
        bool hasActiveDemand,
        bool expectedWarn)
    {
        Assert.Equal(
            expectedWarn,
            WindowsGrpcMetricSourceService.ShouldWarnSnapshotSlowOrStale(
                isSlow,
                isStale,
                metricCount,
                unavailableMetricCount,
                hasActiveDemand));
    }

    private sealed class FakeSourceRequestHandler : ISourceRequestHandler
    {
        public Func<CancellationToken, Task<GetSourceHealthResponse>> GetSourceHealth { get; init; } =
            _ => Task.FromResult(new GetSourceHealthResponse());

        public Func<CancellationToken, Task<ListMetricDescriptorsResponse>> ListMetricDescriptors { get; init; } =
            _ => Task.FromResult(new ListMetricDescriptorsResponse());

        public Func<CancellationToken, Task<ReadMetricSnapshotResponse>> ReadMetricSnapshot { get; init; } =
            _ => Task.FromResult(new ReadMetricSnapshotResponse());

        public Func<CancellationToken, Task<SetMetricRefreshDemandResponse>> SetMetricRefreshDemand { get; init; } =
            _ => Task.FromResult(new SetMetricRefreshDemandResponse());

        public Func<bool> HasActiveMetricRefreshDemandResult { get; init; } = () => false;

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

        public Task<SetMetricRefreshDemandResponse> SetMetricRefreshDemandAsync(
            SetMetricRefreshDemandRequest request,
            CancellationToken cancellationToken)
        {
            return SetMetricRefreshDemand(cancellationToken);
        }

        public bool HasActiveMetricRefreshDemand()
        {
            return HasActiveMetricRefreshDemandResult();
        }
    }

    private static WindowsGrpcMetricSourceService CreateService(
        ISourceRequestHandler handler,
        TimeProvider? timeProvider = null)
    {
        TimeProvider resolvedTimeProvider = timeProvider ?? TimeProvider.System;

        return new WindowsGrpcMetricSourceService(
            handler,
            new SourceMethodRateLimiter(resolvedTimeProvider),
            NullLogger<WindowsGrpcMetricSourceService>.Instance);
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
