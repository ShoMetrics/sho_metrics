using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;
using CoreDescriptor = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptor;
using CoreDescriptorSnapshot = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptorSnapshot;
using CoreMetricReading = ShoMetrics.Source.Windows.Core.MetricReading;
using CoreMetricSnapshot = ShoMetrics.Source.Windows.Core.MetricSnapshot;
using ProtoMetricDescriptor = ShoMetrics.Contracts.V1.MetricDescriptor;
using ProtoMetricSnapshot = ShoMetrics.Contracts.V1.MetricSnapshot;
using ProtoMetricValue = ShoMetrics.Contracts.V1.MetricValue;
using SourceWarningList = Google.Protobuf.Collections.RepeatedField<ShoMetrics.Contracts.V1.SourceWarning>;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class SourceProtocolMapper
{
    private const string HardwareWarningCode = "lhm_warning";
    private const string InvalidRequestErrorCode = "invalid_request";
    private const string MalformedRequestErrorCode = "malformed_request";
    private const string FrameTooLargeErrorCode = "frame_too_large";
    private const string TimeoutErrorCode = "timeout";
    private const string SourceUnavailableErrorCode = "source_unavailable";
    private const string MetricUnavailableWarningCode = "metric_unavailable";
    private const string InternalErrorCode = "internal_error";

    public SourceIpcResponse BuildHealthResponse(string requestId, IReadOnlyList<HardwareSourceWarning> warnings)
    {
        SourceIpcResponse response = new()
        {
            RequestId = requestId,
            GetSourceHealth = new GetSourceHealthResponse
            {
                SourceId = SourceServiceConstants.SourceId,
                ProtocolVersion = SourceServiceConstants.ProtocolVersion,
                HelperVersion = SourceServiceConstants.HelperVersion,
            },
        };

        foreach (HardwareSourceWarning warning in warnings)
        {
            response.GetSourceHealth.Warnings.Add(new SourceWarning
            {
                Code = warning.Code,
                Message = warning.Message,
            });
        }

        return response;
    }

    public SourceIpcResponse BuildReadMetricSnapshotResponse(
        string requestId,
        CoreMetricSnapshot snapshot,
        IReadOnlyCollection<string> requestedMetricIds,
        CoreDescriptorSnapshot? descriptorSnapshot)
    {
        ReadMetricSnapshotResponse readResponse = new()
        {
            Snapshot = BuildMetricSnapshot(snapshot),
        };

        AddHardwareWarnings(readResponse.Warnings, snapshot.Warnings);
        AddUnavailableMetricWarnings(
            readResponse.Warnings,
            requestedMetricIds,
            snapshot.Readings.Select(reading => reading.MetricId));

        if (descriptorSnapshot is not null)
        {
            foreach (CoreDescriptor descriptor in descriptorSnapshot.Descriptors)
            {
                readResponse.Descriptors.Add(BuildMetricDescriptor(descriptor));
            }

            AddHardwareWarnings(readResponse.Warnings, descriptorSnapshot.Warnings);
        }

        return new SourceIpcResponse
        {
            RequestId = requestId,
            ReadMetricSnapshot = readResponse,
        };
    }

    public SourceIpcResponse BuildListMetricDescriptorsResponse(
        string requestId,
        CoreDescriptorSnapshot descriptorSnapshot,
        IReadOnlyCollection<string> requestedMetricIds)
    {
        ListMetricDescriptorsResponse listResponse = new();

        foreach (CoreDescriptor descriptor in descriptorSnapshot.Descriptors)
        {
            listResponse.Descriptors.Add(BuildMetricDescriptor(descriptor));
        }

        AddHardwareWarnings(listResponse.Warnings, descriptorSnapshot.Warnings);
        AddUnavailableMetricWarnings(
            listResponse.Warnings,
            requestedMetricIds,
            descriptorSnapshot.Descriptors.Select(descriptor => descriptor.MetricId));

        return new SourceIpcResponse
        {
            RequestId = requestId,
            ListMetricDescriptors = listResponse,
        };
    }

    public SourceIpcResponse BuildInvalidRequestResponse(string requestId)
    {
        return BuildErrorResponse(
            requestId,
            InvalidRequestErrorCode,
            "Source IPC request payload is empty or unsupported.");
    }

    public SourceIpcResponse BuildSourceUnavailableResponse(string requestId)
    {
        return BuildErrorResponse(
            requestId,
            SourceUnavailableErrorCode,
            "Windows source reader is unavailable.");
    }

    public SourceIpcResponse BuildTimeoutResponse(string requestId)
    {
        return BuildErrorResponse(
            requestId,
            TimeoutErrorCode,
            "Source IPC request exceeded the service timeout.");
    }

    public SourceIpcResponse BuildInternalErrorResponse(string requestId)
    {
        return BuildErrorResponse(
            requestId,
            InternalErrorCode,
            "Source IPC request failed unexpectedly.");
    }

    public SourceIpcResponse BuildFrameErrorResponse(SourceIpcFrameException exception)
    {
        string errorCode = exception.Error switch
        {
            SourceIpcFrameError.MalformedRequest => MalformedRequestErrorCode,
            SourceIpcFrameError.FrameTooLarge => FrameTooLargeErrorCode,
            _ => MalformedRequestErrorCode,
        };

        return BuildErrorResponse("", errorCode, exception.Message);
    }

    private static ProtoMetricSnapshot BuildMetricSnapshot(CoreMetricSnapshot snapshot)
    {
        ProtoMetricSnapshot protoSnapshot = new()
        {
            SourceId = SourceServiceConstants.SourceId,
            TimestampMs = (ulong)snapshot.CapturedAt.ToUnixTimeMilliseconds(),
        };

        foreach (CoreMetricReading reading in snapshot.Readings)
        {
            protoSnapshot.Metrics[reading.MetricId] = BuildMetricValue(reading);
        }

        return protoSnapshot;
    }

    private static ProtoMetricValue BuildMetricValue(CoreMetricReading reading)
    {
        return new ProtoMetricValue
        {
            Scalar = reading.Value,
            Unit = reading.Unit,
            Progress = UsesPercentProgress(reading.MetricId)
                ? reading.Value / 100
                : 0,
        };
    }

    private static bool UsesPercentProgress(string metricId)
    {
        return metricId is "cpu.usage_percent" or "gpu.usage_percent";
    }

    private static ProtoMetricDescriptor BuildMetricDescriptor(CoreDescriptor descriptor)
    {
        return new ProtoMetricDescriptor
        {
            MetricId = descriptor.MetricId,
            SourceSensorId = descriptor.SourceSensorId,
            HardwareId = descriptor.HardwareId,
            HardwareName = descriptor.HardwareName,
            SensorName = descriptor.SensorName,
            SensorType = descriptor.SensorType,
            Unit = descriptor.Unit,
            IsDynamic = descriptor.IsDynamic,
        };
    }

    private static void AddHardwareWarnings(
        SourceWarningList warnings,
        IReadOnlyList<string> warningMessages)
    {
        foreach (string warningMessage in warningMessages)
        {
            warnings.Add(new SourceWarning
            {
                Code = HardwareWarningCode,
                Message = warningMessage,
            });
        }
    }

    private static void AddUnavailableMetricWarnings(
        SourceWarningList warnings,
        IReadOnlyCollection<string> requestedMetricIds,
        IEnumerable<string> returnedMetricIds)
    {
        if (requestedMetricIds.Count == 0)
        {
            return;
        }

        HashSet<string> returnedMetricIdSet = new(returnedMetricIds, StringComparer.Ordinal);

        foreach (string requestedMetricId in requestedMetricIds)
        {
            if (returnedMetricIdSet.Contains(requestedMetricId))
            {
                continue;
            }

            warnings.Add(new SourceWarning
            {
                Code = MetricUnavailableWarningCode,
                Message = "Requested metric is unavailable.",
                MetricId = requestedMetricId,
            });
        }
    }

    private static SourceIpcResponse BuildErrorResponse(string requestId, string code, string message)
    {
        return new SourceIpcResponse
        {
            RequestId = requestId,
            Error = new SourceError
            {
                Code = code,
                Message = message,
            },
        };
    }
}
