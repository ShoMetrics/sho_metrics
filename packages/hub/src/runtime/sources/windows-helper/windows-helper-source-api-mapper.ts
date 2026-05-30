import { logger } from "../../../logging/logger";
import {
    MetricUnavailableReason as ProtoMetricUnavailableReason,
    MetricValueFreshness as ProtoMetricValueFreshness,
    type GetSourceHealthResponse,
    type MetricDescriptor as ProtoMetricDescriptor,
    type MetricUnavailableReport as ProtoMetricUnavailableReport,
    type MetricValueAttribution as ProtoMetricValueAttribution,
    type RawSensorIdentity as ProtoRawSensorIdentity,
    type SourceWarning as ProtoSourceWarning,
} from "../../../generated/shometrics/v1/source_api_pb.js";
import type { MetricSnapshot } from "../metric-source";
import type {
    MetricDescriptor,
    MetricUnavailableReason,
    MetricUnavailableReport,
    MetricValueAttribution,
    MetricValueFreshness,
    RawSensorIdentity,
    SourceHealth,
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
    readonly valueAttributions: readonly ProtoMetricValueAttribution[];
    readonly unavailableMetrics: readonly ProtoMetricUnavailableReport[];
}): {
    readonly valueAttributions: readonly MetricValueAttribution[];
    readonly unavailableMetrics: readonly MetricUnavailableReport[];
} {
    const emittedMetricIds = new Set(Object.keys(options.snapshot.metrics));
    const requestedMetricIds = new Set(options.requestedMetricKeys);
    const validateRequestedMetricIds = requestedMetricIds.size > 0;
    const seenValueAttributionMetricIds = new Set<string>();
    const seenUnavailableMetricIds = new Set<string>();
    const valueAttributions: MetricValueAttribution[] = [];
    const unavailableMetrics: MetricUnavailableReport[] = [];

    for (const attribution of options.valueAttributions) {
        if (!emittedMetricIds.has(attribution.metricId)) {
            logDroppedWireRecord("valueAttribution", attribution.metricId, "orphan");
            continue;
        }

        if (seenValueAttributionMetricIds.has(attribution.metricId)) {
            logDroppedWireRecord("valueAttribution", attribution.metricId, "duplicate");
            continue;
        }

        seenValueAttributionMetricIds.add(attribution.metricId);
        valueAttributions.push(toRuntimeMetricValueAttribution(attribution));
    }

    for (const unavailableReport of options.unavailableMetrics) {
        if (validateRequestedMetricIds && !requestedMetricIds.has(unavailableReport.metricId)) {
            logDroppedWireRecord("unavailableMetric", unavailableReport.metricId, "notRequested");
            continue;
        }

        if (emittedMetricIds.has(unavailableReport.metricId)) {
            logDroppedWireRecord("unavailableMetric", unavailableReport.metricId, "emitted");
            continue;
        }

        if (seenUnavailableMetricIds.has(unavailableReport.metricId)) {
            logDroppedWireRecord("unavailableMetric", unavailableReport.metricId, "duplicate");
            continue;
        }

        seenUnavailableMetricIds.add(unavailableReport.metricId);
        unavailableMetrics.push(toRuntimeMetricUnavailableReport(unavailableReport));
    }

    return {
        valueAttributions,
        unavailableMetrics,
    };
}

export function toRuntimeMetricDescriptor(descriptor: ProtoMetricDescriptor): MetricDescriptor | undefined {
    const rawSensorIdentity = readRequiredRawSensorIdentity(descriptor.rawSensorIdentity, descriptor.metricId);
    const pollingGroupId = readRequiredDescriptorString({
        fieldName: "polling_group_id",
        fieldValue: descriptor.pollingGroupId,
        metricId: descriptor.metricId,
    });

    if (!rawSensorIdentity || !pollingGroupId) {
        // Helper/plugin versions may be skewed. A malformed descriptor should
        // not make the whole helper source unavailable; drop the bad record and
        // keep the support log from the field reader.
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
    recordKind: "valueAttribution" | "unavailableMetric",
    metricId: string,
    reason: "orphan" | "duplicate" | "notRequested" | "emitted",
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

function toRuntimeMetricValueAttribution(
    attribution: ProtoMetricValueAttribution,
): MetricValueAttribution {
    return {
        metricId: attribution.metricId,
        ...(attribution.rawSensorIdentity
            ? { rawSensorIdentity: toRuntimeRawSensorIdentity(attribution.rawSensorIdentity) }
            : {}),
        valueFreshness: normalizeMetricValueFreshness(attribution.valueFreshness, attribution.metricId),
        ...(attribution.retainedAgeMilliseconds === undefined
            ? {}
            : { retainedAgeMilliseconds: attribution.retainedAgeMilliseconds }),
    };
}

function toRuntimeMetricUnavailableReport(
    unavailableReport: ProtoMetricUnavailableReport,
): MetricUnavailableReport {
    return {
        metricId: unavailableReport.metricId,
        reason: normalizeMetricUnavailableReason(unavailableReport.reason, unavailableReport.metricId),
        ...(unavailableReport.rawSensorIdentity
            ? { rawSensorIdentity: toRuntimeRawSensorIdentity(unavailableReport.rawSensorIdentity) }
            : {}),
    };
}

function normalizeMetricValueFreshness(
    freshness: ProtoMetricValueFreshness,
    metricId: string,
): MetricValueFreshness {
    switch (freshness) {
        case ProtoMetricValueFreshness.FRESH:
            return "fresh";
        case ProtoMetricValueFreshness.RETAINED:
            return "retained";
        case ProtoMetricValueFreshness.UNSPECIFIED:
            logUnknownWireEnum("valueFreshness", metricId, freshness, "retained");
            return "retained";
    }

    // Helper and plugin versions can be skewed; generated TypeScript enums do
    // not prevent a future helper from sending an unknown numeric enum value.
    logUnknownWireEnum("valueFreshness", metricId, freshness, "retained");
    return "retained";
}

function normalizeMetricUnavailableReason(
    reason: ProtoMetricUnavailableReason,
    metricId: string,
): MetricUnavailableReason {
    switch (reason) {
        case ProtoMetricUnavailableReason.NO_SENSOR:
            return "noSensorData";
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

    // Helper and plugin versions can be skewed; generated TypeScript enums do
    // not prevent a future helper from sending an unknown numeric enum value.
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
