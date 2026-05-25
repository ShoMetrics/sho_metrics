import { useEffect, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { DisplayedMetricReadAttribution } from "../../runtime/widget-runtime-cache";
import { SettingsSection } from "./SettingsSection";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../../runtime/sources/source-ids";
import { isGpuMetricKey } from "../../runtime/metric-keys";

interface MetricSourceDiagnosticProps {
    readonly attribution: DisplayedMetricReadAttribution | undefined;
}

/** Build mode constant replaced by Rollup and globally declared in `src/env.d.ts`. */
declare const __BUILD_MODE__: "development" | "staging" | "production" | undefined;

const RELATIVE_TIME_REFRESH_MILLISECONDS = 500;

export function MetricSourceDiagnostic({
    attribution,
}: MetricSourceDiagnosticProps): React.JSX.Element {
    const [isDebugVisible, setIsDebugVisible] = useState(isDevelopmentBuild);
    const [currentTimestampMilliseconds, setCurrentTimestampMilliseconds] = useState(Date.now);

    useEffect(() => {
        if (!isDebugVisible) {
            return;
        }

        const intervalId = globalThis.setInterval(() => {
            setCurrentTimestampMilliseconds(Date.now());
        }, RELATIVE_TIME_REFRESH_MILLISECONDS);

        return () => {
            globalThis.clearInterval(intervalId);
        };
    }, [isDebugVisible]);

    const metricKey = attribution?.metricKey;
    const currentSourceText = formatCurrentSourceLabel(attribution);
    const preferredSourceText = attribution?.preferredSourceId
        ? formatSourceLabel(attribution.preferredSourceId, metricKey)
        : undefined;
    const fallbackText = attribution?.preferredSourceId !== undefined
        && attribution.selectedSourceId !== undefined
        && attribution.preferredSourceId !== attribution.selectedSourceId
        ? "Using fallback; preferred source has no fresh data."
        : undefined;
    const helperStatusText = attribution?.preferredSourceId === WINDOWS_HELPER_SOURCE_ID
        ? formatHelperStatusText(attribution)
        : undefined;

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
                                Last sample age: {formatSampleAgeText(
                                    attribution?.sampleTimestampMilliseconds,
                                    currentTimestampMilliseconds,
                                )}
                                {helperStatusText !== undefined && (
                                    <>
                                        <br />
                                        Helper status: {helperStatusText}
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
    if (attribution.selectedSourceId === WINDOWS_HELPER_SOURCE_ID) {
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
    if (attribution?.selectedSourceId === undefined) {
        return "No fresh source";
    }

    return formatSourceLabel(attribution.selectedSourceId, attribution.metricKey);
}

function formatSourceLabel(sourceId: string, metricKey: string | undefined): string {
    switch (sourceId) {
        case WINDOWS_HELPER_SOURCE_ID:
            return "Helper";
        case NODE_SYSTEM_SOURCE_ID:
            return metricKey !== undefined && isGpuMetricKey(metricKey)
                ? "Built-in (nvidia-smi)"
                : "Built-in";
        default:
            return sourceId;
    }
}

function formatSampleAgeText(
    sampleTimestampMilliseconds: number | undefined,
    currentTimestampMilliseconds: number,
): string {
    if (sampleTimestampMilliseconds === undefined) {
        return "No data yet";
    }

    const elapsedMilliseconds = Math.max(0, currentTimestampMilliseconds - sampleTimestampMilliseconds);
    const elapsedSeconds = elapsedMilliseconds / 1000;

    if (elapsedSeconds < 1) {
        return `${elapsedSeconds.toFixed(1)}s`;
    }

    if (elapsedSeconds < 60) {
        return `${Math.floor(elapsedSeconds)}s`;
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const remainingSeconds = Math.floor(elapsedSeconds % 60);
    return `${elapsedMinutes}m ${remainingSeconds}s`;
}
