using System.Diagnostics;
using Google.Protobuf.WellKnownTypes;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;
using CoreDescriptor = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptor;
using CoreDescriptorSnapshot = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptorSnapshot;
using CoreMetricIdKind = ShoMetrics.Source.Windows.Core.MetricIdKind;
using CoreMetricReading = ShoMetrics.Source.Windows.Core.MetricReading;
using CoreMetricSnapshot = ShoMetrics.Source.Windows.Core.MetricSnapshot;
using CoreMetricUnit = ShoMetrics.Source.Windows.Core.MetricUnit;
using CoreMetricValueKind = ShoMetrics.Source.Windows.Core.MetricValueKind;
using ProtoMetricDescriptor = ShoMetrics.Contracts.V1.MetricDescriptor;
using ProtoMetricIdKind = ShoMetrics.Contracts.V1.MetricIdKind;
using ProtoMetricSnapshot = ShoMetrics.Contracts.V1.MetricSnapshot;
using ProtoMetricUnit = ShoMetrics.Contracts.V1.MetricUnit;
using ProtoMetricValue = ShoMetrics.Contracts.V1.MetricValue;
using ProtoMetricValueKind = ShoMetrics.Contracts.V1.MetricValueKind;
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
            CapturedAt = Timestamp.FromDateTimeOffset(snapshot.CapturedAt),
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
            Unit = MapMetricUnit(reading.Unit),
        };
    }

    private static ProtoMetricDescriptor BuildMetricDescriptor(CoreDescriptor descriptor)
    {
        return new ProtoMetricDescriptor
        {
            MetricId = descriptor.MetricId,
            SourceSensorId = descriptor.SourceSensorId,
            HardwareId = descriptor.HardwareId,
            HardwareName = descriptor.HardwareName,
            HardwareType = descriptor.HardwareType,
            SensorName = descriptor.SensorName,
            SourceSensorType = descriptor.SourceSensorType,
            ValueKind = MapMetricValueKind(descriptor.ValueKind),
            Unit = MapMetricUnit(descriptor.Unit),
            MetricIdKind = MapMetricIdKind(descriptor.MetricIdKind),
        };
    }

    private static ProtoMetricUnit MapMetricUnit(CoreMetricUnit unit)
    {
        return unit switch
        {
            CoreMetricUnit.Percent => ProtoMetricUnit.Percent,
            CoreMetricUnit.Celsius => ProtoMetricUnit.Celsius,
            CoreMetricUnit.Volts => ProtoMetricUnit.Volts,
            CoreMetricUnit.Amperes => ProtoMetricUnit.Amperes,
            CoreMetricUnit.Watts => ProtoMetricUnit.Watts,
            CoreMetricUnit.Hertz => ProtoMetricUnit.Hertz,
            CoreMetricUnit.Bytes => ProtoMetricUnit.Bytes,
            CoreMetricUnit.BytesPerSecond => ProtoMetricUnit.BytesPerSecond,
            CoreMetricUnit.RevolutionsPerMinute => ProtoMetricUnit.RevolutionsPerMinute,
            CoreMetricUnit.LitersPerHour => ProtoMetricUnit.LitersPerHour,
            CoreMetricUnit.Unitless => ProtoMetricUnit.Unitless,
            CoreMetricUnit.Seconds => ProtoMetricUnit.Seconds,
            CoreMetricUnit.WattHours => ProtoMetricUnit.WattHours,
            CoreMetricUnit.DecibelsAWeighted => ProtoMetricUnit.DecibelsAWeighted,
            CoreMetricUnit.SiemensPerCentimeter => ProtoMetricUnit.SiemensPerCentimeter,
            CoreMetricUnit.Unspecified => throw new UnreachableException("Metric readings and descriptors must use a specified unit."),
            _ => throw new UnreachableException($"Missing protobuf unit mapping for '{unit}'."),
        };
    }

    private static ProtoMetricValueKind MapMetricValueKind(CoreMetricValueKind valueKind)
    {
        return valueKind switch
        {
            CoreMetricValueKind.Scalar => ProtoMetricValueKind.Scalar,
            CoreMetricValueKind.Text => ProtoMetricValueKind.Text,
            CoreMetricValueKind.Unspecified => throw new UnreachableException("Metric descriptors must use a specified value kind."),
            _ => throw new UnreachableException($"Missing protobuf value kind mapping for '{valueKind}'."),
        };
    }

    private static ProtoMetricIdKind MapMetricIdKind(CoreMetricIdKind metricIdKind)
    {
        return metricIdKind switch
        {
            CoreMetricIdKind.StableAlias => ProtoMetricIdKind.StableAlias,
            CoreMetricIdKind.SourceSensor => ProtoMetricIdKind.SourceSensor,
            CoreMetricIdKind.Unspecified => throw new UnreachableException("Metric descriptors must use a specified metric id kind."),
            _ => throw new UnreachableException($"Missing protobuf metric id kind mapping for '{metricIdKind}'."),
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
