using System.Diagnostics;
using Google.Protobuf.WellKnownTypes;
using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Contracts;
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
using ProtoMetricValueFreshness = ShoMetrics.Contracts.V1.MetricValueFreshness;
using ProtoMetricUnit = ShoMetrics.Contracts.V1.MetricUnit;
using ProtoMetricValue = ShoMetrics.Contracts.V1.MetricValue;
using ProtoMetricValueKind = ShoMetrics.Contracts.V1.MetricValueKind;
using ProtoMetricUnavailableReason = ShoMetrics.Contracts.V1.MetricUnavailableReason;
using ProtoRawSensorIdentity = ShoMetrics.Contracts.V1.RawSensorIdentity;
using SourceWarningList = Google.Protobuf.Collections.RepeatedField<ShoMetrics.Contracts.V1.SourceWarning>;

namespace ShoMetrics.Source.Windows.Service;

// Converts Core hardware/source models into protobuf responses at the service
// boundary. Keep Core transport-independent; generated protobuf types should
// not leak back into the hardware reader.
internal sealed class SourceProtocolMapper
{
    private const string PawnIoWarningCode = "pawnio_warning";
    private const string HardwareWarningCode = "lhm_warning";
    private const string MetricUnavailableWarningCode = "metric_unavailable";

    /// <summary>
    /// Builds source health from generic hardware warnings plus optional
    /// component diagnostics. Component status is coarse Panel state; detailed
    /// human-readable diagnostic text still belongs in SourceWarning.
    /// </summary>
    public GetSourceHealthResponse BuildHealthResponse(
        IReadOnlyList<HardwareSourceWarning> warnings,
        PawnIoDiagnostic? pawnIoDiagnostic)
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

        AddPawnIoComponentStatus(response, pawnIoDiagnostic);

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
        AddValueProvenance(readResponse, snapshot.Readings);
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

    private static HelperMetricDescriptorSnapshot BuildMetricDescriptorSnapshot(CoreDescriptorSnapshot descriptorSnapshot)
    {
        HelperMetricDescriptorSnapshot protoSnapshot = new()
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
        ProtoMetricValue value = new()
        {
            Scalar = reading.Value,
            Unit = MapMetricUnit(reading.Unit),
        };

        if (reading.ValueFreshness is not CoreMetricValueFreshness.Fresh || reading.RetainedAge is not null)
        {
            value.Metadata = new MetricValueMetadata
            {
                Freshness = MapMetricValueFreshness(reading.ValueFreshness),
            };

            if (reading.RetainedAge is not null)
            {
                value.Metadata.RetainedAgeMilliseconds = (uint)Math.Clamp(
                    reading.RetainedAge.Value.TotalMilliseconds,
                    0,
                    uint.MaxValue);
            }
        }

        return value;
    }

    private static void AddValueProvenance(
        ReadMetricSnapshotResponse readResponse,
        IReadOnlyList<CoreMetricReading> readings)
    {
        foreach (CoreMetricReading reading in readings)
        {
            HelperMetricValueProvenance provenance = new()
            {
                MetricId = reading.MetricId,
                RawSensorIdentity = BuildRawSensorIdentity(reading),
            };

            readResponse.ValueProvenance.Add(provenance);
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
            HelperMetricUnavailableReport helperUnavailableReport = new()
            {
                Report = unavailableReport,
            };

            if (diagnostic.RawSensorIdentity is not null)
            {
                helperUnavailableReport.RawSensorIdentity = BuildRawSensorIdentity(diagnostic.RawSensorIdentity);
            }

            readResponse.UnavailableMetrics.Add(helperUnavailableReport);
        }
    }

    private static HelperMetricDescriptor BuildMetricDescriptor(CoreDescriptor descriptor)
    {
        return new HelperMetricDescriptor
        {
            Descriptor_ = new ProtoMetricDescriptor
            {
                MetricId = descriptor.MetricId,
                PollingGroupId = descriptor.PollingGroupId,
                ValueKind = MapMetricValueKind(descriptor.ValueKind),
                Unit = MapMetricUnit(descriptor.Unit),
                MetricIdKind = MapMetricIdKind(descriptor.MetricIdKind),
            },
            RawSensorIdentity = BuildRawSensorIdentity(descriptor),
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
            CoreMetricIdKind.SourceSensor => ProtoMetricIdKind.SourceNative,
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
            CoreMetricUnavailableReason.NoSensor => ProtoMetricUnavailableReason.NoSourceReading,
            CoreMetricUnavailableReason.InvalidValue => ProtoMetricUnavailableReason.InvalidValue,
            CoreMetricUnavailableReason.Expired => ProtoMetricUnavailableReason.Expired,
            CoreMetricUnavailableReason.PendingRefresh => ProtoMetricUnavailableReason.PendingRefresh,
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

    private static void AddPawnIoComponentStatus(
        GetSourceHealthResponse response,
        PawnIoDiagnostic? diagnostic)
    {
        SourceComponentStatus componentStatus = new()
        {
            Component = WindowsSourceServiceConstants.PawnIoDriverComponentId,
            State = MapPawnIoComponentState(diagnostic),
        };

        if (!string.IsNullOrWhiteSpace(diagnostic?.Version))
        {
            componentStatus.Version = diagnostic.Version;
        }

        response.ComponentStatuses.Add(componentStatus);

        if (diagnostic is null)
        {
            return;
        }

        foreach (string warning in diagnostic.Warnings)
        {
            response.Warnings.Add(new SourceWarning
            {
                Code = PawnIoWarningCode,
                Message = warning,
            });
        }
    }

    private static SourceComponentState MapPawnIoComponentState(PawnIoDiagnostic? diagnostic)
    {
        if (diagnostic is null)
        {
            return SourceComponentState.Unknown;
        }

        return diagnostic.Verdict switch
        {
            PawnIoHealthVerdict.NotInstalled => SourceComponentState.NotInstalled,
            PawnIoHealthVerdict.NotElevated => SourceComponentState.NotElevated,
            PawnIoHealthVerdict.NotSupported => SourceComponentState.NotSupported,
            PawnIoHealthVerdict.Ok => SourceComponentState.Ok,
            PawnIoHealthVerdict.Unusable => SourceComponentState.Unusable,
            _ => SourceComponentState.Unknown,
        };
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
