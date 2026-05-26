using Google.Protobuf.WellKnownTypes;
using Grpc.Core;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.ControlPanel.Tests;

public sealed class HelperControlPanelStatusReaderTests
{
    [Fact]
    public async Task ReadAsyncReturnsConnectedStatusFromGrpcResponses()
    {
        DateTimeOffset capturedAt = DateTimeOffset.UtcNow.AddSeconds(-2);
        var sourceClient = new FakeHelperControlPanelSourceClient
        {
            Health = new GetSourceHealthResponse
            {
                SourceId = "windows-helper",
                ProtocolVersion = "1",
                HelperVersion = "test-helper",
                Warnings =
                {
                    new SourceWarning
                    {
                        Code = "driver",
                        Message = "PawnIO driver warning.",
                    },
                },
            },
            Descriptors = new ListMetricDescriptorsResponse
            {
                DescriptorSnapshot = new MetricDescriptorSnapshot
                {
                    DescriptorFingerprint = "test-fingerprint",
                    Descriptors =
                    {
                        new MetricDescriptor
                        {
                            MetricId = "cpu.temp",
                            RawSensorIdentity = new RawSensorIdentity
                            {
                                SourceSensorId = "lhm.sensor:/cpu/temp",
                                HardwareId = "/cpu/0",
                                HardwareName = "CPU",
                                HardwareType = "Cpu",
                                SensorName = "CPU Package",
                                SourceSensorType = "Temperature",
                            },
                            PollingGroupId = "lhm:hardware:cpu",
                        },
                    },
                },
            },
            Snapshot = new ReadMetricSnapshotResponse
            {
                Snapshot = new MetricSnapshot
                {
                    CapturedAt = Timestamp.FromDateTimeOffset(capturedAt),
                },
            },
        };
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            sourceClient);

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Running", status.ServiceStatusText);
        Assert.Equal("Connected", status.ConnectionStatusText);
        Assert.Equal("Needs attention", status.PawnIoDriverText);
        Assert.Equal("test-helper", status.HelperVersionText);
        Assert.Equal("1", status.ProtocolVersionText);
        Assert.Equal("1", status.DescriptorCountText);
        Assert.Equal("1", status.WarningCountText);
        Assert.Contains("driver: PawnIO driver warning.", status.WarningDetailsText, StringComparison.Ordinal);
        Assert.NotEqual("No sample", status.LastSampleText);
    }

    [Fact]
    public async Task ReadAsyncReportsGrpcUnavailableWithoutHidingServiceStatus()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Stopped),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.Unavailable, "No such pipe."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Stopped", status.ServiceStatusText);
        Assert.Equal("Not running", status.ServiceRuntimeText);
        Assert.Equal("Failed", status.ConnectionStatusText);
        Assert.Contains("gRPC connection unavailable: No such pipe.", status.ErrorText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsUnsupportedHelperMethodAsUpdateHint()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.Unimplemented, "Unknown method."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Running", status.ServiceStatusText);
        Assert.Equal("Failed", status.ConnectionStatusText);
        Assert.Contains(
            "Helper does not support this Control Panel request: Unknown method.",
            status.ErrorText,
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncPreservesHealthAndDescriptorsWhenSnapshotFails()
    {
        var sourceClient = new FakeHelperControlPanelSourceClient
        {
            Health = new GetSourceHealthResponse
            {
                SourceId = "windows-helper",
                ProtocolVersion = "1",
                HelperVersion = "test-helper",
            },
            Descriptors = new ListMetricDescriptorsResponse
            {
                DescriptorSnapshot = new MetricDescriptorSnapshot
                {
                    DescriptorFingerprint = "test-fingerprint",
                    Descriptors =
                    {
                        new MetricDescriptor
                        {
                            MetricId = "cpu.temp",
                            RawSensorIdentity = new RawSensorIdentity
                            {
                                SourceSensorId = "lhm.sensor:/cpu/temp",
                                HardwareId = "/cpu/0",
                                HardwareName = "CPU",
                                HardwareType = "Cpu",
                                SensorName = "CPU Package",
                                SourceSensorType = "Temperature",
                            },
                            PollingGroupId = "lhm:hardware:cpu",
                        },
                    },
                },
            },
            SnapshotException = new RpcException(new Status(StatusCode.DeadlineExceeded, "Snapshot timed out.")),
        };
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            sourceClient);

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Connected with errors", status.ConnectionStatusText);
        Assert.Equal("test-helper", status.HelperVersionText);
        Assert.Equal("1", status.ProtocolVersionText);
        Assert.Equal("1", status.DescriptorCountText);
        Assert.Equal("Unknown", status.LastSampleText);
        Assert.Contains(
            "Snapshot read failed: gRPC request timed out: Snapshot timed out.",
            status.ErrorText,
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsGrpcDeadlineExceeded()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.DeadlineExceeded, "Request deadline exceeded."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Failed", status.ConnectionStatusText);
        Assert.Contains("gRPC request timed out: Request deadline exceeded.", status.ErrorText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsGrpcFailedPrecondition()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.FailedPrecondition, "Protocol precondition failed."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Failed", status.ConnectionStatusText);
        Assert.Contains("Helper precondition failed: Protocol precondition failed.", status.ErrorText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsGrpcInvalidArgument()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.InvalidArgument, "Invalid request shape."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Failed", status.ConnectionStatusText);
        Assert.Contains(
            "Control Panel sent an invalid helper request: Invalid request shape.",
            status.ErrorText,
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsOperationCanceledAsTimeoutWhenCallerDidNotCancel()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(new OperationCanceledException()));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Failed", status.ConnectionStatusText);
        Assert.Contains(
            "Connection timed out. The helper service may be stopped or still starting.",
            status.ErrorText,
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsGenericException()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(new InvalidOperationException("Unexpected failure.")));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Failed", status.ConnectionStatusText);
        Assert.Contains("InvalidOperationException: Unexpected failure.", status.ErrorText, StringComparison.Ordinal);
    }

    [Fact]
    public void DisposeDisposesReaderDependencies()
    {
        var serviceStatusReader = new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running);
        var sourceClient = new FakeHelperControlPanelSourceClient();
        var reader = new HelperControlPanelStatusReader(serviceStatusReader, sourceClient);

        reader.Dispose();

        Assert.Equal(1, serviceStatusReader.DisposeCallCount);
        Assert.Equal(1, sourceClient.DisposeCallCount);
    }

    private sealed class FakeWindowsServiceStatusReader(
        WindowsServiceStatusKind status) : IWindowsServiceStatusReader, IDisposable
    {
        public int DisposeCallCount { get; private set; }

        public WindowsServiceStatusKind ReadStatus()
        {
            return status;
        }

        public void Dispose()
        {
            DisposeCallCount += 1;
        }
    }

    private sealed class FakeHelperControlPanelSourceClient : IHelperControlPanelSourceClient
    {
        public GetSourceHealthResponse Health { get; init; } = new();

        public ListMetricDescriptorsResponse Descriptors { get; init; } = new();

        public ReadMetricSnapshotResponse Snapshot { get; init; } = new();

        public Exception? HealthException { get; init; }

        public Exception? DescriptorsException { get; init; }

        public Exception? SnapshotException { get; init; }

        public int DisposeCallCount { get; private set; }

        public static FakeHelperControlPanelSourceClient Throwing(Exception exception)
        {
            return new FakeHelperControlPanelSourceClient
            {
                HealthException = exception,
                DescriptorsException = exception,
                SnapshotException = exception,
            };
        }

        public Task<GetSourceHealthResponse> GetSourceHealthAsync(
            TimeSpan requestTimeout,
            CancellationToken cancellationToken)
        {
            ThrowIfConfigured(HealthException);
            return Task.FromResult(Health);
        }

        public Task<ListMetricDescriptorsResponse> ListMetricDescriptorsAsync(
            TimeSpan requestTimeout,
            CancellationToken cancellationToken)
        {
            ThrowIfConfigured(DescriptorsException);
            return Task.FromResult(Descriptors);
        }

        public Task<ReadMetricSnapshotResponse> ReadMetricSnapshotAsync(
            TimeSpan requestTimeout,
            CancellationToken cancellationToken)
        {
            ThrowIfConfigured(SnapshotException);
            return Task.FromResult(Snapshot);
        }

        public void Dispose()
        {
            DisposeCallCount += 1;
        }

        private static void ThrowIfConfigured(Exception? exception)
        {
            if (exception is not null)
            {
                throw exception;
            }
        }
    }
}
