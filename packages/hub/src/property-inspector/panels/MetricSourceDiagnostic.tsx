import { useEffect, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type {
    DisplayedMetricReadAttribution,
    DisplayedMetricUnavailableReason,
} from "../../runtime/widget-runtime-cache";
import { SettingsSection } from "./SettingsSection";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../../runtime/sources/source-ids";
import { isGpuMetricKey } from "../../runtime/metric-keys";
import { wallClockNowMilliseconds } from "../../shared/clock";

interface MetricSourceDiagnosticProps {
    readonly attribution: DisplayedMetricReadAttribution | undefined;
}

/** Build mode constant replaced by Rollup and globally declared in `src/env.d.ts`. */
declare const __BUILD_MODE__: "development" | "staging" | "production" | undefined;

const RELATIVE_TIME_REFRESH_MILLISECONDS = 500;

const metricUnavailableTextByReason = {
    noSensorData: "no sensor data",
    invalidValue: "invalid value",
    expired: "expired",
    unknown: "unknown",
} satisfies Record<DisplayedMetricUnavailableReason, string>;

export function MetricSourceDiagnostic({
    attribution,
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

    const metricKey = attribution?.metricKey;
    const currentSourceText = formatCurrentSourceLabel(attribution);
    const preferredSourceText = attribution?.routing?.preferredSourceId
        ? formatSourceLabel(attribution.routing.preferredSourceId, metricKey)
        : undefined;
    const fallbackText = attribution?.routing?.preferredSourceId !== undefined
        && attribution.routing?.selectedSourceId !== undefined
        && attribution.routing.preferredSourceId !== attribution.routing.selectedSourceId
        ? "Using fallback; preferred source has no fresh data."
        : undefined;
    const helperStatusText = attribution?.routing?.preferredSourceId === WINDOWS_HELPER_SOURCE_ID
        ? formatHelperStatusText(attribution)
        : undefined;
    const sensorText = formatSensorText(attribution);
    const metricStateText = formatMetricStateText(attribution);

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
                                    readLastValueTimestampMilliseconds(attribution),
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

function formatHelperStatusText(attribution: DisplayedMetricReadAttribution): string {
    if (attribution.routing?.selectedSourceId === WINDOWS_HELPER_SOURCE_ID) {
        return "Ready";
    }

    const status = attribution.preferredSourceStatus;
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

function formatCurrentSourceLabel(attribution: DisplayedMetricReadAttribution | undefined): string {
    if (attribution?.routing?.selectedSourceId === undefined) {
        return "No fresh source";
    }

    return formatSourceLabel(attribution.routing.selectedSourceId, attribution.metricKey);
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

function formatSensorText(attribution: DisplayedMetricReadAttribution | undefined): string | undefined {
    if (attribution === undefined) {
        return undefined;
    }

    const rawSensorIdentity = attribution.outcome?.rawSensorIdentity;
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

function formatMetricStateText(attribution: DisplayedMetricReadAttribution | undefined): string | undefined {
    switch (attribution?.outcome?.kind) {
        case "value":
            if (attribution.outcome.freshness === "fresh") {
                return "fresh";
            }

            return attribution.outcome.retainedAgeMilliseconds === undefined
                ? "retained"
                : `retained ${formatElapsedSecondsText(attribution.outcome.retainedAgeMilliseconds)}`;
        case "unavailable":
            return metricUnavailableTextByReason[attribution.outcome.reason];
        case undefined:
            return undefined;
    }
}

function readLastValueTimestampMilliseconds(
    attribution: DisplayedMetricReadAttribution | undefined,
): number | undefined {
    switch (attribution?.outcome?.kind) {
        case "value":
            return attribution.outcome.valueTimestampMilliseconds;
        case "unavailable":
            return attribution.outcome.lastValueTimestampMilliseconds;
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
