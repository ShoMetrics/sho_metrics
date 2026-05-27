using System.Diagnostics;
using Google.Protobuf.WellKnownTypes;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;
using CoreDescriptor = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptor;
using CoreDescriptorSnapshot = ShoMetrics.Source.Windows.Core.HardwareMetricDescriptorSnapshot;
using CoreMetricIdKind = ShoMetrics.Source.Windows.Core.MetricIdKind;
using CoreMetricReading = ShoMetrics.Source.Windows.Core.MetricReading;
using CoreMetricUnavailableReport = ShoMetrics.Source.Windows.Core.MetricUnavailableReport;
using CoreMetricUnavailableReason = ShoMetrics.Source.Windows.Core.MetricUnavailableReason;
using CoreMetricSnapshot = ShoMetrics.Source.Windows.Core.MetricSnapshot;
using CoreMetricUnit = ShoMetrics.Source.Windows.Core.MetricUnit;
using CoreMetricValueFreshness = ShoMetrics.Source.Windows.Core.MetricValueFreshness;
using CoreMetricValueKind = ShoMetrics.Source.Windows.Core.MetricValueKind;
using CoreRawSensorIdentity = ShoMetrics.Source.Windows.Core.RawSensorIdentity;
using ProtoMetricDescriptor = ShoMetrics.Contracts.V1.MetricDescriptor;
using ProtoMetricIdKind = ShoMetrics.Contracts.V1.MetricIdKind;
using ProtoMetricUnavailableReport = ShoMetrics.Contracts.V1.MetricUnavailableReport;
using ProtoMetricSnapshot = ShoMetrics.Contracts.V1.MetricSnapshot;
using ProtoMetricValueAttribution = ShoMetrics.Contracts.V1.MetricValueAttribution;
using ProtoMetricValueFreshness = ShoMetrics.Contracts.V1.MetricValueFreshness;
using ProtoMetricUnit = ShoMetrics.Contracts.V1.MetricUnit;
using ProtoMetricValue = ShoMetrics.Contracts.V1.MetricValue;
using ProtoMetricValueKind = ShoMetrics.Contracts.V1.MetricValueKind;
using ProtoMetricUnavailableReason = ShoMetrics.Contracts.V1.MetricUnavailableReason;
using ProtoRawSensorIdentity = ShoMetrics.Contracts.V1.RawSensorIdentity;
using SourceWarningList = Google.Protobuf.Collections.RepeatedField<ShoMetrics.Contracts.V1.SourceWarning>;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class SourceProtocolMapper
{
    private const string HardwareWarningCode = "lhm_warning";
    private const string MetricUnavailableWarningCode = "metric_unavailable";

    public GetSourceHealthResponse BuildHealthResponse(IReadOnlyList<HardwareSourceWarning> warnings)
    {
        GetSourceHealthResponse response = new()
        {
            SourceId = WindowsSourceServiceIdentity.SourceId,
            ProtocolVersion = WindowsSourceServiceIdentity.ProtocolVersion,
            HelperVersion = WindowsSourceServiceIdentity.HelperVersion,
        };

        foreach (HardwareSourceWarning warning in warnings)
        {
            response.Warnings.Add(new SourceWarning
            {
                Code = warning.Code,
                Message = warning.Message,
            });
        }

        return response;
    }

    public ReadMetricSnapshotResponse BuildReadMetricSnapshotResponse(
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
        AddValueAttributions(readResponse, snapshot.Readings);
        AddUnavailableMetrics(readResponse, snapshot.UnavailableMetrics);

        if (descriptorSnapshot is not null)
        {
            readResponse.DescriptorSnapshot = BuildMetricDescriptorSnapshot(descriptorSnapshot);

            AddHardwareWarnings(readResponse.Warnings, descriptorSnapshot.Warnings);
        }

        return readResponse;
    }

    public ListMetricDescriptorsResponse BuildListMetricDescriptorsResponse(
        CoreDescriptorSnapshot descriptorSnapshot,
        IReadOnlyCollection<string> requestedMetricIds)
    {
        ListMetricDescriptorsResponse listResponse = new()
        {
            DescriptorSnapshot = BuildMetricDescriptorSnapshot(descriptorSnapshot),
        };

        AddHardwareWarnings(listResponse.Warnings, descriptorSnapshot.Warnings);
        AddUnavailableMetricWarnings(
            listResponse.Warnings,
            requestedMetricIds,
            descriptorSnapshot.Descriptors.Select(descriptor => descriptor.MetricId));

        return listResponse;
    }

    public SetMetricRefreshDemandResponse BuildSetMetricRefreshDemandResponse(
        MetricRefreshDemandApplyResult result)
    {
        SetMetricRefreshDemandResponse response = new()
        {
            AcceptedGroupCount = ToUInt32(result.AcceptedGroupCount),
            IgnoredGroupCount = ToUInt32(result.IgnoredGroupCount),
            EffectiveMinimumIntervalMilliseconds = ToUInt32(result.EffectiveMinimumRefreshInterval.TotalMilliseconds),
            DemandTtlMilliseconds = ToUInt32(result.DemandTtl.TotalMilliseconds),
        };

        foreach (HardwareSourceWarning warning in result.Warnings)
        {
            response.Warnings.Add(new SourceWarning
            {
                Code = warning.Code,
                Message = warning.Message,
            });
        }

        return response;
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

    private static MetricDescriptorSnapshot BuildMetricDescriptorSnapshot(CoreDescriptorSnapshot descriptorSnapshot)
    {
        MetricDescriptorSnapshot protoSnapshot = new()
        {
            DescriptorFingerprint = descriptorSnapshot.DescriptorFingerprint,
        };

        foreach (CoreDescriptor descriptor in descriptorSnapshot.Descriptors)
        {
            protoSnapshot.Descriptors.Add(BuildMetricDescriptor(descriptor));
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

    private static void AddValueAttributions(
        ReadMetricSnapshotResponse readResponse,
        IReadOnlyList<CoreMetricReading> readings)
    {
        foreach (CoreMetricReading reading in readings)
        {
            ProtoMetricValueAttribution attribution = new()
            {
                MetricId = reading.MetricId,
                RawSensorIdentity = BuildRawSensorIdentity(reading),
                ValueFreshness = MapMetricValueFreshness(reading.ValueFreshness),
            };

            if (reading.RetainedAge is not null)
            {
                attribution.RetainedAgeMilliseconds = (uint)Math.Clamp(
                        reading.RetainedAge.Value.TotalMilliseconds,
                        0,
                        uint.MaxValue);
            }

            readResponse.ValueAttributions.Add(attribution);
        }
    }

    private static void AddUnavailableMetrics(
        ReadMetricSnapshotResponse readResponse,
        IReadOnlyList<CoreMetricUnavailableReport> diagnostics)
    {
        foreach (CoreMetricUnavailableReport diagnostic in diagnostics)
        {
            ProtoMetricUnavailableReport unavailableReport = new()
            {
                MetricId = diagnostic.MetricId,
                Reason = MapMetricUnavailableReason(diagnostic.Reason),
            };

            if (diagnostic.RawSensorIdentity is not null)
            {
                unavailableReport.RawSensorIdentity = BuildRawSensorIdentity(diagnostic.RawSensorIdentity);
            }

            readResponse.UnavailableMetrics.Add(unavailableReport);
        }
    }

    private static ProtoMetricDescriptor BuildMetricDescriptor(CoreDescriptor descriptor)
    {
        return new ProtoMetricDescriptor
        {
            MetricId = descriptor.MetricId,
            RawSensorIdentity = BuildRawSensorIdentity(descriptor),
            PollingGroupId = descriptor.PollingGroupId,
            ValueKind = MapMetricValueKind(descriptor.ValueKind),
            Unit = MapMetricUnit(descriptor.Unit),
            MetricIdKind = MapMetricIdKind(descriptor.MetricIdKind),
        };
    }

    private static ProtoRawSensorIdentity BuildRawSensorIdentity(CoreDescriptor descriptor)
    {
        return new ProtoRawSensorIdentity
        {
            SourceSensorId = descriptor.SourceSensorId,
            HardwareId = descriptor.HardwareId,
            HardwareName = descriptor.HardwareName,
            HardwareType = descriptor.HardwareType,
            SensorName = descriptor.SensorName,
            SourceSensorType = descriptor.SourceSensorType,
        };
    }

    private static ProtoRawSensorIdentity BuildRawSensorIdentity(CoreMetricReading reading)
    {
        return new ProtoRawSensorIdentity
        {
            SourceSensorId = reading.SensorId,
            HardwareId = reading.HardwareId,
            HardwareName = reading.HardwareName,
            HardwareType = reading.HardwareType,
            SensorName = reading.SensorName,
            SourceSensorType = reading.SourceSensorType,
        };
    }

    private static ProtoRawSensorIdentity BuildRawSensorIdentity(CoreRawSensorIdentity identity)
    {
        return new ProtoRawSensorIdentity
        {
            SourceSensorId = identity.SourceSensorId,
            HardwareId = identity.HardwareId,
            HardwareName = identity.HardwareName,
            HardwareType = identity.HardwareType,
            SensorName = identity.SensorName,
            SourceSensorType = identity.SourceSensorType,
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

    private static ProtoMetricValueFreshness MapMetricValueFreshness(CoreMetricValueFreshness state)
    {
        return state switch
        {
            CoreMetricValueFreshness.Fresh => ProtoMetricValueFreshness.Fresh,
            CoreMetricValueFreshness.Retained => ProtoMetricValueFreshness.Retained,
            _ => throw new UnreachableException($"Missing protobuf value freshness mapping for '{state}'."),
        };
    }

    private static ProtoMetricUnavailableReason MapMetricUnavailableReason(CoreMetricUnavailableReason reason)
    {
        return reason switch
        {
            CoreMetricUnavailableReason.NoSensor => ProtoMetricUnavailableReason.NoSensor,
            CoreMetricUnavailableReason.InvalidValue => ProtoMetricUnavailableReason.InvalidValue,
            CoreMetricUnavailableReason.Expired => ProtoMetricUnavailableReason.Expired,
            _ => throw new UnreachableException($"Missing protobuf unavailable metric reason mapping for '{reason}'."),
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

    private static uint ToUInt32(double value)
    {
        return (uint)Math.Clamp(value, 0, uint.MaxValue);
    }

    private static uint ToUInt32(int value)
    {
        return (uint)Math.Clamp(value, 0, int.MaxValue);
    }
}
