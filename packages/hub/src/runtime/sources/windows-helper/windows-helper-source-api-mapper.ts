import { logger } from "../../../logging/logger";
import {
    MetricUnavailableReason as ProtoMetricUnavailableReason,
    MetricValueFreshness as ProtoMetricValueFreshness,
    type MetricValueMetadata as ProtoMetricValueMetadata,
} from "../../../generated/proto/shometrics/v1/metric_common_pb.js";
import type {
    GetSourceHealthResponse,
    HelperMetricDescriptor as ProtoHelperMetricDescriptor,
    HelperMetricUnavailableReport as ProtoHelperMetricUnavailableReport,
    HelperMetricValueProvenance as ProtoHelperMetricValueProvenance,
    RawSensorIdentity as ProtoRawSensorIdentity,
    SourceWarning as ProtoSourceWarning,
} from "../../../generated/proto/shometrics/v1/helper_grpc_service_pb.js";
import type { MetricSnapshot } from "../metric-source";
import type {
    MetricDescriptor,
    MetricUnavailableReason,
    MetricUnavailableReport,
    MetricValueFreshness,
    RawSensorIdentity,
    SourceHealth,
    SourceMetricValueMetadata,
    SourceWarning,
} from "../source-client";

const log = logger.for("Source:WindowsHelper");

const WIRE_INVARIANT_WARNING_INTERVAL_MILLISECONDS = 30000;

export function toRuntimeSourceHealth(response: GetSourceHealthResponse): SourceHealth {
    return {
        sourceId: response.sourceId,
        protocolVersion: response.protocolVersion,
        helperVersion: response.helperVersion,
        warnings: response.warnings.map(toRuntimeSourceWarning),
    };
}

export function toRuntimeSnapshotMetadata(options: {
    readonly requestedMetricKeys: readonly string[];
    readonly snapshot: MetricSnapshot;
    readonly valueProvenance: readonly ProtoHelperMetricValueProvenance[];
    readonly unavailableMetrics: readonly ProtoHelperMetricUnavailableReport[];
}): {
    readonly valueMetadata: readonly SourceMetricValueMetadata[];
    readonly unavailableMetrics: readonly MetricUnavailableReport[];
} {
    const emittedMetricIds = new Set(Object.keys(options.snapshot.metrics));
    const requestedMetricIds = new Set(options.requestedMetricKeys);
    const validateRequestedMetricIds = requestedMetricIds.size > 0;
    const seenValueProvenanceMetricIds = new Set<string>();
    const seenUnavailableMetricIds = new Set<string>();
    const valueProvenanceByMetricId = new Map<string, RawSensorIdentity>();
    const valueMetadata: SourceMetricValueMetadata[] = [];
    const unavailableMetrics: MetricUnavailableReport[] = [];

    for (const provenance of options.valueProvenance) {
        if (!emittedMetricIds.has(provenance.metricId)) {
            logDroppedWireRecord("valueProvenance", provenance.metricId, "orphan");
            continue;
        }

        if (seenValueProvenanceMetricIds.has(provenance.metricId)) {
            logDroppedWireRecord("valueProvenance", provenance.metricId, "duplicate");
            continue;
        }

        seenValueProvenanceMetricIds.add(provenance.metricId);

        if (provenance.rawSensorIdentity) {
            valueProvenanceByMetricId.set(provenance.metricId, toRuntimeRawSensorIdentity(provenance.rawSensorIdentity));
        }
    }

    for (const [metricId, value] of Object.entries(options.snapshot.metrics)) {
        const metadata = value.metadata;
        const rawSensorIdentity = valueProvenanceByMetricId.get(metricId);

        if (!metadata && rawSensorIdentity === undefined) {
            continue;
        }

        valueMetadata.push(toRuntimeMetricValueMetadata(metricId, metadata, rawSensorIdentity));
    }

    for (const unavailableMetric of options.unavailableMetrics) {
        const report = unavailableMetric.report;
        if (!report) {
            logDroppedWireRecord("unavailableMetric", "", "missingReport");
            continue;
        }

        if (validateRequestedMetricIds && !requestedMetricIds.has(report.metricId)) {
            logDroppedWireRecord("unavailableMetric", report.metricId, "notRequested");
            continue;
        }

        if (emittedMetricIds.has(report.metricId)) {
            logDroppedWireRecord("unavailableMetric", report.metricId, "emitted");
            continue;
        }

        if (seenUnavailableMetricIds.has(report.metricId)) {
            logDroppedWireRecord("unavailableMetric", report.metricId, "duplicate");
            continue;
        }

        seenUnavailableMetricIds.add(report.metricId);
        unavailableMetrics.push(toRuntimeMetricUnavailableReport(unavailableMetric));
    }

    return {
        valueMetadata,
        unavailableMetrics,
    };
}

export function toRuntimeMetricDescriptor(wrapper: ProtoHelperMetricDescriptor): MetricDescriptor | undefined {
    const descriptor = wrapper.descriptor;
    if (!descriptor) {
        logDroppedDescriptor("", "missingDescriptor");
        return undefined;
    }

    const rawSensorIdentity = readRequiredRawSensorIdentity(wrapper.rawSensorIdentity, descriptor.metricId);
    const pollingGroupId = readRequiredDescriptorString({
        fieldName: "polling_group_id",
        fieldValue: descriptor.pollingGroupId,
        metricId: descriptor.metricId,
    });

    if (!rawSensorIdentity || !pollingGroupId) {
        return undefined;
    }

    return {
        metricId: descriptor.metricId,
        rawSensorIdentity,
        valueKind: descriptor.valueKind,
        unit: descriptor.unit,
        metricIdKind: descriptor.metricIdKind,
        pollingGroupId,
    };
}

function logDroppedWireRecord(
    recordKind: "valueProvenance" | "unavailableMetric",
    metricId: string,
    reason: "orphan" | "duplicate" | "notRequested" | "emitted" | "missingReport",
): void {
    log.atWarn()
        .everyMs(
            `wireInvariantDropped:${recordKind}:${reason}:${metricId}`,
            WIRE_INVARIANT_WARNING_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "windowsHelperWireRecordDropped",
            `recordKind=${recordKind}`,
            `reason=${reason}`,
            `metricId=${metricId}`,
        ].join(" "));
}

function logUnknownWireEnum(
    fieldName: string,
    metricId: string,
    value: number,
    fallback: string,
): void {
    log.atWarn()
        .everyMs(
            `wireEnumFallback:${fieldName}:${value}:${metricId}`,
            WIRE_INVARIANT_WARNING_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "windowsHelperWireEnumFallback",
            `fieldName=${fieldName}`,
            `metricId=${metricId}`,
            `value=${value}`,
            `fallback=${fallback}`,
        ].join(" "));
}

function logDroppedDescriptor(metricId: string, reason: string): void {
    log.atWarn()
        .everyMs(
            `descriptorDropped:${reason}:${metricId}`,
            WIRE_INVARIANT_WARNING_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "windowsHelperDescriptorDropped",
            `reason=${reason}`,
            `metricId=${metricId}`,
        ].join(" "));
}

function toRuntimeMetricValueMetadata(
    metricId: string,
    metadata: ProtoMetricValueMetadata | undefined,
    rawSensorIdentity: RawSensorIdentity | undefined,
): SourceMetricValueMetadata {
    const valueFreshness = metadata
        ? normalizeMetricValueFreshness(metadata.freshness, metricId)
        : "fresh";

    return {
        metricId,
        valueFreshness,
        ...(metadata?.retainedAgeMilliseconds === undefined
            ? {}
            : { retainedAgeMilliseconds: metadata.retainedAgeMilliseconds }),
        ...(rawSensorIdentity === undefined ? {} : { rawSensorIdentity }),
    };
}

function toRuntimeMetricUnavailableReport(
    unavailableMetric: ProtoHelperMetricUnavailableReport,
): MetricUnavailableReport {
    const report = unavailableMetric.report;
    if (!report) {
        throw new Error("Helper unavailable report must be validated before mapping.");
    }

    return {
        metricId: report.metricId,
        reason: normalizeMetricUnavailableReason(report.reason, report.metricId),
        ...(unavailableMetric.rawSensorIdentity
            ? { rawSensorIdentity: toRuntimeRawSensorIdentity(unavailableMetric.rawSensorIdentity) }
            : {}),
    };
}

function normalizeMetricValueFreshness(
    freshness: ProtoMetricValueFreshness,
    metricId: string,
): MetricValueFreshness {
    switch (freshness) {
        case ProtoMetricValueFreshness.FRESH:
        case ProtoMetricValueFreshness.UNSPECIFIED:
            return "fresh";
        case ProtoMetricValueFreshness.RETAINED:
            return "retained";
    }

    logUnknownWireEnum("valueFreshness", metricId, freshness, "retained");
    return "retained";
}

function normalizeMetricUnavailableReason(
    reason: ProtoMetricUnavailableReason,
    metricId: string,
): MetricUnavailableReason {
    switch (reason) {
        case ProtoMetricUnavailableReason.NO_SOURCE_READING:
            return "noSourceReading";
        case ProtoMetricUnavailableReason.INVALID_VALUE:
            return "invalidValue";
        case ProtoMetricUnavailableReason.EXPIRED:
            return "expired";
        case ProtoMetricUnavailableReason.PENDING_REFRESH:
            return "pendingRefresh";
        case ProtoMetricUnavailableReason.UNSPECIFIED:
            logUnknownWireEnum("unavailableReason", metricId, reason, "debugOnly");
            return "unknown";
    }

    logUnknownWireEnum("unavailableReason", metricId, reason, "debugOnly");
    return "unknown";
}

function readRequiredRawSensorIdentity(
    rawSensorIdentity: ProtoRawSensorIdentity | undefined,
    metricId: string,
): RawSensorIdentity | undefined {
    if (!rawSensorIdentity) {
        logDroppedDescriptor(metricId, "missingRawSensorIdentity");
        return undefined;
    }

    return toRuntimeRawSensorIdentity(rawSensorIdentity);
}

function toRuntimeRawSensorIdentity(rawSensorIdentity: ProtoRawSensorIdentity): RawSensorIdentity {
    return {
        sourceSensorId: rawSensorIdentity.sourceSensorId,
        hardwareId: rawSensorIdentity.hardwareId,
        hardwareName: rawSensorIdentity.hardwareName,
        hardwareType: rawSensorIdentity.hardwareType,
        sensorName: rawSensorIdentity.sensorName,
        sourceSensorType: rawSensorIdentity.sourceSensorType,
    };
}

function readRequiredDescriptorString(options: {
    readonly fieldName: string;
    readonly fieldValue: string;
    readonly metricId: string;
}): string | undefined {
    const value = options.fieldValue.trim();

    if (value.length === 0) {
        logDroppedDescriptor(options.metricId, `missing_${options.fieldName}`);
        return undefined;
    }

    return value;
}

function toRuntimeSourceWarning(warning: ProtoSourceWarning): SourceWarning {
    return {
        code: warning.code,
        message: warning.message,
        ...(warning.metricId ? { metricId: warning.metricId } : {}),
        ...(warning.sourceSensorId ? { sourceSensorId: warning.sourceSensorId } : {}),
    };
}
