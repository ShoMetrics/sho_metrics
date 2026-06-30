import { useEffect, useState } from "react";
import { InspectorItem } from "../../components/InspectorItem";
import type {
    DisplayedMetricReadTrace,
    DisplayedMetricUnavailableReason,
} from "../../../runtime/widget-runtime-cache";
import { SettingsSection } from "./SettingsSection";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../../../runtime/sources/source-ids";
import { isGpuMetricKey } from "../../../runtime/metric-keys";
import { wallClockNowMilliseconds } from "../../../shared/clock";

interface MetricSourceDiagnosticProps {
    readonly trace: DisplayedMetricReadTrace | undefined;
}
const RELATIVE_TIME_REFRESH_MILLISECONDS = 500;

const metricUnavailableTextByReason = {
    noSourceReading: "no source reading",
    invalidValue: "invalid value",
    expired: "expired",
    pendingRefresh: "pending refresh",
    unknown: "unknown",
} satisfies Record<DisplayedMetricUnavailableReason, string>;

export function MetricSourceDiagnostic({
    trace,
}: MetricSourceDiagnosticProps): React.JSX.Element {
    const [isDebugVisible, setIsDebugVisible] = useState(isDevelopmentBuild);
    const [currentTimestampMilliseconds, setCurrentTimestampMilliseconds] = useState(wallClockNowMilliseconds);

    useEffect(() => {
        if (!isDebugVisible) {
            return;
        }

        const intervalId = globalThis.setInterval(() => {
            setCurrentTimestampMilliseconds(wallClockNowMilliseconds());
        }, RELATIVE_TIME_REFRESH_MILLISECONDS);

        return () => {
            globalThis.clearInterval(intervalId);
        };
    }, [isDebugVisible]);

    const metricKey = trace?.metricKey;
    const currentSourceText = formatCurrentSourceLabel(trace);
    const preferredSourceText = trace?.routing?.preferredSourceId
        ? formatSourceLabel(trace.routing.preferredSourceId, metricKey)
        : undefined;
    const fallbackText = trace?.routing?.preferredSourceId !== undefined
        && trace.routing?.selectedSourceId !== undefined
        && trace.routing.preferredSourceId !== trace.routing.selectedSourceId
        ? "Using fallback; preferred source has no fresh data."
        : undefined;
    const helperStatusText = trace?.routing?.preferredSourceId === WINDOWS_HELPER_SOURCE_ID
        ? formatHelperStatusText(trace)
        : undefined;
    const sensorText = formatSensorText(trace);
    const metricStateText = formatMetricStateText(trace);

    return (
        <SettingsSection title="DEBUG">
            <InspectorItem className="note-item note-item-caption">
                <div className="metric-source-debug-panel">
                    <label className="native-checkbox-row">
                        <input
                            type="checkbox"
                            checked={isDebugVisible}
                            onChange={(event) => {
                                setIsDebugVisible(event.currentTarget.checked);
                            }}
                        />
                        <span>Show debug</span>
                    </label>
                    {isDebugVisible && (
                        <div className="metric-source-debug-details">
                            <p className="section-note">
                                Current source: {currentSourceText}
                                <br />
                                {preferredSourceText !== undefined && (
                                    <>
                                        Preferred source: {preferredSourceText}
                                        <br />
                                    </>
                                )}
                                Last value age: {formatValueAgeText(
                                    readLastValueTimestampMilliseconds(trace),
                                    currentTimestampMilliseconds,
                                )}
                                {helperStatusText !== undefined && (
                                    <>
                                        <br />
                                        Helper status: {helperStatusText}
                                    </>
                                )}
                                {sensorText !== undefined && (
                                    <>
                                        <br />
                                        Sensor: {sensorText}
                                    </>
                                )}
                                {metricStateText !== undefined && (
                                    <>
                                        <br />
                                        Metric: {metricStateText}
                                    </>
                                )}
                                {fallbackText !== undefined && (
                                    <>
                                        <br />
                                        {fallbackText}
                                    </>
                                )}
                            </p>
                        </div>
                    )}
                </div>
            </InspectorItem>
        </SettingsSection>
    );
}

function isDevelopmentBuild(): boolean {
    return typeof __BUILD_MODE__ === "undefined" || __BUILD_MODE__ === "development";
}

function formatHelperStatusText(trace: DisplayedMetricReadTrace): string {
    if (trace.routing?.selectedSourceId === WINDOWS_HELPER_SOURCE_ID) {
        return "Ready";
    }

    const status = trace.preferredSourceStatus;
    if (!status || status.state === "unknown") {
        return "Required";
    }

    if (status.state === "available") {
        return "Ready";
    }

    if (status.state === "unavailable") {
        if (status.reason === "helperNotInstalled") {
            return "Required";
        }

        return status.reason === "pipeMissing"
            && status.lastSuccessAtTimestampMilliseconds === undefined
            ? "Required"
            : "Error";
    }

    return "Error";
}

function formatCurrentSourceLabel(trace: DisplayedMetricReadTrace | undefined): string {
    if (trace?.routing?.selectedSourceId === undefined) {
        return "No fresh source";
    }

    return formatSourceLabel(trace.routing.selectedSourceId, trace.metricKey);
}

function formatSourceLabel(sourceId: string, metricKey: string | undefined): string {
    switch (sourceId) {
        case WINDOWS_HELPER_SOURCE_ID:
            return "Helper";
        case NODE_SYSTEM_SOURCE_ID:
            return metricKey !== undefined && isGpuMetricKey(metricKey)
                ? "Built-in GPU"
                : "Built-in";
        default:
            return sourceId;
    }
}

function formatSensorText(trace: DisplayedMetricReadTrace | undefined): string | undefined {
    if (trace === undefined) {
        return undefined;
    }

    const rawSensorIdentity = trace.outcome?.rawSensorIdentity;
    const name = rawSensorIdentity?.sensorName ?? rawSensorIdentity?.hardwareName;
    const id = rawSensorIdentity?.sourceSensorId ?? rawSensorIdentity?.hardwareId;

    if (name === undefined && id === undefined) {
        return undefined;
    }

    if (name !== undefined && id !== undefined) {
        return `${name} (${id})`;
    }

    return name ?? id;
}

function formatMetricStateText(trace: DisplayedMetricReadTrace | undefined): string | undefined {
    switch (trace?.outcome?.kind) {
        case "value":
            if (trace.outcome.freshness === "fresh") {
                return "fresh";
            }

            return trace.outcome.retainedAgeMilliseconds === undefined
                ? "retained"
                : `retained ${formatElapsedSecondsText(trace.outcome.retainedAgeMilliseconds)}`;
        case "unavailable":
            return metricUnavailableTextByReason[trace.outcome.reason];
        case undefined:
            return undefined;
    }
}

function readLastValueTimestampMilliseconds(
    trace: DisplayedMetricReadTrace | undefined,
): number | undefined {
    switch (trace?.outcome?.kind) {
        case "value":
            return trace.outcome.valueTimestampMilliseconds;
        case "unavailable":
            return trace.outcome.lastValueTimestampMilliseconds;
        case undefined:
            return undefined;
    }
}

function formatValueAgeText(
    valueTimestampMilliseconds: number | undefined,
    currentTimestampMilliseconds: number,
): string {
    if (valueTimestampMilliseconds === undefined) {
        return "none";
    }

    const elapsedMilliseconds = Math.max(0, currentTimestampMilliseconds - valueTimestampMilliseconds);
    return formatElapsedSecondsText(elapsedMilliseconds);
}

function formatElapsedSecondsText(elapsedMilliseconds: number): string {
    const elapsedSeconds = elapsedMilliseconds / 1000;
    if (elapsedSeconds < 1) {
        return `${elapsedSeconds.toFixed(1)}s`;
    }

    return `${Math.floor(elapsedSeconds)}s`;
}
