using Google.Protobuf.WellKnownTypes;
using Grpc.Core;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Contracts;

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
                ComponentStatuses =
                {
                    new SourceComponentStatus
                    {
                        Component = WindowsSourceServiceConstants.PawnIoDriverComponentId,
                        State = SourceComponentState.Unusable,
                        Version = "1.2.3",
                    },
                },
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
                DescriptorSnapshot = new HelperMetricDescriptorSnapshot
                {
                    DescriptorFingerprint = "test-fingerprint",
                    Descriptors =
                    {
                        new HelperMetricDescriptor
                        {
                            Descriptor_ = new MetricDescriptor
                            {
                                MetricId = "cpu.temp",
                                PollingGroupId = "lhm:hardware:cpu",
                            },
                            RawSensorIdentity = new RawSensorIdentity
                            {
                                SourceSensorId = "lhm.sensor:/cpu/temp",
                                HardwareId = "/cpu/0",
                                HardwareName = "CPU",
                                HardwareType = "Cpu",
                                SensorName = "CPU Package",
                                SourceSensorType = "Temperature",
                            },
                        },
                    },
                },
            },
            Snapshot = new ReadMetricSnapshotResponse
            {
                Snapshot = new MetricSnapshot
                {
                    CapturedAt = Timestamp.FromDateTimeOffset(capturedAt),
                    Metrics = { { "cpu.temp", new MetricValue { Scalar = 42 } } },
                },
            },
        };
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            sourceClient);

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Connected", status.Service.StatusText);
        Assert.Equal("ShoMetrics Helper is running.", status.Service.DetailText);
        Assert.Equal("Connected", status.Service.ConnectionText);
        Assert.Equal("Needs attention (1.2.3)", status.PawnIoDriver.StatusText);
        Assert.Equal("PawnIO returned no sensor data. A restart may help, or your device may only be partially supported by ShoMetrics. Open logs for details.", status.PawnIoDriver.DetailText);
        Assert.Equal("test-helper", status.Diagnostics.HelperVersionText);
        Assert.Equal("1", status.Diagnostics.ProtocolVersionText);
        Assert.Equal("1 (Cpu:1)", status.Diagnostics.DescriptorCountText);
        Assert.Equal("1 warning", status.Diagnostics.WarningCountText);
        Assert.Contains("Last sample when checked:", status.Diagnostics.SensorDiagnosticsText, StringComparison.Ordinal);
        Assert.Contains("Metrics discovered: 1 (Cpu:1).", status.Diagnostics.SensorDiagnosticsText, StringComparison.Ordinal);
        Assert.Contains("driver: PawnIO driver warning.", status.Diagnostics.WarningDetailsText, StringComparison.Ordinal);
        Assert.NotEqual("No sample", status.Diagnostics.LastSampleText);
    }

    [Fact]
    public async Task ReadAsyncReportsEmptySnapshotWithoutClaimingDemandState()
    {
        // The panel reads the service's global snapshot, which today stays
        // empty with an aging CapturedAt even while widgets actively sample
        // (per-group demand refresh does not currently republish it), and
        // demand state is deliberately kept off the wire. The replacement text
        // must therefore stay true in both the idle and the active case: no
        // aging timestamp, and no claim about whether widgets are requesting
        // metrics.
        DateTimeOffset capturedAt = DateTimeOffset.UtcNow.AddMinutes(-8);
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
                DescriptorSnapshot = new HelperMetricDescriptorSnapshot
                {
                    DescriptorFingerprint = "test-fingerprint",
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

        Assert.Equal(
            "No sample data in this diagnostic snapshot. This view does not track live widget sampling.",
            status.Diagnostics.LastSampleText);
        Assert.StartsWith(
            "No sample data in this diagnostic snapshot.",
            status.Diagnostics.SensorDiagnosticsText,
            StringComparison.Ordinal);
        Assert.DoesNotContain("ago", status.Diagnostics.SensorDiagnosticsText, StringComparison.Ordinal);
        Assert.DoesNotContain("Last sample when checked:", status.Diagnostics.SensorDiagnosticsText, StringComparison.Ordinal);
        // Demand state is deliberately not exposed over the wire (KISS), so any
        // wording that asserts it would be a guess that is wrong in the active
        // case. This pins the earlier regression from coming back.
        Assert.DoesNotContain("No active widgets", status.Diagnostics.SensorDiagnosticsText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncBucketsDescriptorCountByHardwareType()
    {
        // The breakdown uses the same vocabulary and format as the helper's
        // startup "descriptor catalog built" log line so support can diff the
        // two. An expected-but-missing bucket (SuperIO enumeration failure) is
        // visible as absence from this list.
        var sourceClient = new FakeHelperControlPanelSourceClient
        {
            Descriptors = new ListMetricDescriptorsResponse
            {
                DescriptorSnapshot = new HelperMetricDescriptorSnapshot
                {
                    DescriptorFingerprint = "test-fingerprint",
                    Descriptors =
                    {
                        BuildDescriptor("cpu.temp", "Cpu"),
                        BuildDescriptor("cpu.load", "Cpu"),
                        BuildDescriptor("gpu.temp", "GpuNvidia"),
                        BuildDescriptor("disk.total.read", hardwareType: ""),
                    },
                },
            },
        };
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            sourceClient);

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("4 ((native):1,Cpu:2,GpuNvidia:1)", status.Diagnostics.DescriptorCountText);
    }

    private static HelperMetricDescriptor BuildDescriptor(string metricId, string hardwareType)
    {
        return new HelperMetricDescriptor
        {
            Descriptor_ = new MetricDescriptor
            {
                MetricId = metricId,
                PollingGroupId = "test-group",
            },
            RawSensorIdentity = new RawSensorIdentity
            {
                SourceSensorId = $"test:{metricId}",
                HardwareType = hardwareType,
            },
        };
    }

    [Fact]
    public async Task ReadAsyncAggregatesWarningsFromHealthDescriptorsAndSnapshot()
    {
        var sourceClient = new FakeHelperControlPanelSourceClient
        {
            Health = new GetSourceHealthResponse
            {
                Warnings =
                {
                    new SourceWarning
                    {
                        Code = "health",
                        Message = "Health warning.",
                    },
                },
            },
            Descriptors = new ListMetricDescriptorsResponse
            {
                Warnings =
                {
                    new SourceWarning
                    {
                        Code = "catalog",
                        Message = "Descriptor warning.",
                    },
                },
            },
            Snapshot = new ReadMetricSnapshotResponse
            {
                Warnings =
                {
                    new SourceWarning
                    {
                        Code = "snapshot",
                        Message = "Snapshot warning.",
                    },
                },
            },
        };
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            sourceClient);

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Connected", status.Service.ConnectionText);
        Assert.Equal("3 warnings", status.Diagnostics.WarningCountText);
        Assert.Equal("Copy diagnostics or open logs for support details.", status.Diagnostics.DetailText);
        Assert.Equal(ControlPanelStatusTone.Caution, status.Diagnostics.Tone);
        Assert.True(status.Diagnostics.HasDetails);
        Assert.Contains("health: Health warning.", status.Diagnostics.WarningDetailsText, StringComparison.Ordinal);
        Assert.Contains("catalog: Descriptor warning.", status.Diagnostics.WarningDetailsText, StringComparison.Ordinal);
        Assert.Contains("snapshot: Snapshot warning.", status.Diagnostics.WarningDetailsText, StringComparison.Ordinal);
        Assert.Equal("", status.ErrorText);
    }

    [Theory]
    [InlineData(SourceComponentState.Ok, "Installed")]
    [InlineData(SourceComponentState.NotInstalled, "Not installed")]
    [InlineData(SourceComponentState.NotElevated, "Not elevated")]
    [InlineData(SourceComponentState.Unusable, "Needs attention")]
    [InlineData(SourceComponentState.NotSupported, "Not supported")]
    [InlineData(SourceComponentState.Unknown, "Unknown")]
    [InlineData(SourceComponentState.Unspecified, "Unknown")]
    public async Task ReadAsyncFormatsPawnIoComponentState(
        SourceComponentState state,
        string expectedText)
    {
        var sourceClient = new FakeHelperControlPanelSourceClient
        {
            Health = new GetSourceHealthResponse
            {
                ComponentStatuses =
                {
                    new SourceComponentStatus
                    {
                        Component = WindowsSourceServiceConstants.PawnIoDriverComponentId,
                        State = state,
                    },
                },
            },
        };
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            sourceClient);

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal(expectedText, status.PawnIoDriver.StatusText);
    }

    [Fact]
    public async Task ReadAsyncDoesNotAppendPawnIoVersionWhenDriverIsNotInstalled()
    {
        var sourceClient = new FakeHelperControlPanelSourceClient
        {
            Health = new GetSourceHealthResponse
            {
                ComponentStatuses =
                {
                    new SourceComponentStatus
                    {
                        Component = WindowsSourceServiceConstants.PawnIoDriverComponentId,
                        State = SourceComponentState.NotInstalled,
                        Version = "2.2.0",
                    },
                },
            },
        };
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            sourceClient);

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Not installed", status.PawnIoDriver.StatusText);
    }

    [Fact]
    public async Task ReadAsyncDoesNotInferPawnIoDriverStatusFromWarningText()
    {
        var sourceClient = new FakeHelperControlPanelSourceClient
        {
            Health = new GetSourceHealthResponse
            {
                Warnings =
                {
                    new SourceWarning
                    {
                        Code = "driver",
                        Message = "PawnIO and MSR warning text without structured status.",
                    },
                },
            },
        };
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            sourceClient);

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Unknown", status.PawnIoDriver.StatusText);
        Assert.Equal("Update ShoMetrics Helper to the latest version if driver diagnostics are unavailable.", status.PawnIoDriver.DetailText);
        Assert.Contains("driver: PawnIO and MSR warning text", status.Diagnostics.WarningDetailsText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsGrpcUnavailableWithoutHidingServiceStatus()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Stopped),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.Unavailable, "No such pipe."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Not started", status.Service.StatusText);
        Assert.Equal("The background service is not running.", status.Service.DetailText);
        Assert.True(status.Service.CanStartBackgroundService);
        Assert.Equal("Not running", status.Service.RuntimeText);
        Assert.Equal("Failed", status.Service.ConnectionText);
        Assert.Equal("Not checked", status.PawnIoDriver.StatusText);
        Assert.Equal("PawnIO status cannot be checked until ShoMetrics Helper is running.", status.PawnIoDriver.DetailText);
        Assert.Contains("Could not connect to ShoMetrics Helper: No such pipe.", status.ErrorText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncExplainsServiceInstallMissingAsIncompleteInstall()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.NotInstalled),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.Unavailable, "No such pipe."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Not installed", status.Service.StatusText);
        Assert.Equal(
            "Installation did not complete. Restart your PC or reinstall ShoMetrics Helper.",
            status.Service.DetailText);
        Assert.Equal("Not installed", status.Service.InstallText);
    }

    [Fact]
    public async Task ReadAsyncReportsUnsupportedHelperMethodAsUpdateHint()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.Unimplemented, "Unknown method."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Update required", status.Service.StatusText);
        Assert.Equal("Update ShoMetrics Helper and Hub to the latest version.", status.Service.DetailText);
        Assert.Equal("Failed", status.Service.ConnectionText);
        Assert.Contains(
            "Update ShoMetrics Helper and Hub to the latest version: Unknown method.",
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
                DescriptorSnapshot = new HelperMetricDescriptorSnapshot
                {
                    DescriptorFingerprint = "test-fingerprint",
                    Descriptors =
                    {
                        new HelperMetricDescriptor
                        {
                            Descriptor_ = new MetricDescriptor
                            {
                                MetricId = "cpu.temp",
                                PollingGroupId = "lhm:hardware:cpu",
                            },
                            RawSensorIdentity = new RawSensorIdentity
                            {
                                SourceSensorId = "lhm.sensor:/cpu/temp",
                                HardwareId = "/cpu/0",
                                HardwareName = "CPU",
                                HardwareType = "Cpu",
                                SensorName = "CPU Package",
                                SourceSensorType = "Temperature",
                            },
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

        Assert.Equal("Connected with errors", status.Service.ConnectionText);
        Assert.Equal("test-helper", status.Diagnostics.HelperVersionText);
        Assert.Equal("1", status.Diagnostics.ProtocolVersionText);
        Assert.Equal("1 (Cpu:1)", status.Diagnostics.DescriptorCountText);
        Assert.Equal("Unknown", status.Diagnostics.LastSampleText);
        Assert.Contains(
            "Snapshot read failed: ShoMetrics Helper did not respond in time: Snapshot timed out.",
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

        Assert.Equal("Failed", status.Service.ConnectionText);
        Assert.Contains("ShoMetrics Helper did not respond in time: Request deadline exceeded.", status.ErrorText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsGrpcFailedPrecondition()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.FailedPrecondition, "Protocol precondition failed."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Failed", status.Service.ConnectionText);
        Assert.Contains("ShoMetrics Helper cannot complete this request yet: Protocol precondition failed.", status.ErrorText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReadAsyncReportsGrpcInvalidArgument()
    {
        var reader = new HelperControlPanelStatusReader(
            new FakeWindowsServiceStatusReader(WindowsServiceStatusKind.Running),
            FakeHelperControlPanelSourceClient.Throwing(
                new RpcException(new Status(StatusCode.InvalidArgument, "Invalid request shape."))));

        HelperControlPanelStatus status = await reader.ReadAsync(CancellationToken.None);

        Assert.Equal("Failed", status.Service.ConnectionText);
        Assert.Contains(
            "Update ShoMetrics Helper and Hub to the latest version: Invalid request shape.",
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

        Assert.Equal("Failed", status.Service.ConnectionText);
        Assert.Contains(
            "Connection timed out. ShoMetrics Helper may be stopped or still starting.",
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

        Assert.Equal("Failed", status.Service.ConnectionText);
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
