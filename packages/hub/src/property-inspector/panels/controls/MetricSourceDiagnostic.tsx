import { useCallback, useEffect, useRef, useState } from "react";
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
import { helperMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
import {
    readHelperControlPanelLaunchResultMessage,
    sendOpenHelperControlPanelMessage,
} from "../../helper-control-panel-messages";
import { useStreamDeckClient } from "../../stream-deck/stream-deck-client-context";
import { HelperDownloadLink } from "../external-link";

interface MetricSourceDiagnosticProps {
    readonly trace: DisplayedMetricReadTrace | undefined;
    /** Whether the current widget is a Windows CPU or GPU hardware summary. */
    readonly isWindowsHardwareSummary?: boolean;
}
const RELATIVE_TIME_REFRESH_MILLISECONDS = 500;
const DIAGNOSTICS_LAUNCH_RESPONSE_TIMEOUT_MILLISECONDS = 5_000;
const DIAGNOSTICS_LAUNCH_FEEDBACK_DURATION_MILLISECONDS = 3_000;

/**
 * Shortest time the button stays in its opening state, even once the plugin
 * has already reported success.
 *
 * The plugin answers "opened" as soon as the Control Panel process is spawned,
 * which takes well under a second, but its window needs about another second to
 * appear. Without a floor the button therefore snaps back to its idle label
 * before anything shows up on screen, which reads as a flicker rather than as
 * progress. Holding the opening label bridges that gap, and the label stays
 * truthful while it does: the panel really is still opening.
 *
 * Drop this once the plugin can report the window itself rather than the spawn.
 */
export const DIAGNOSTICS_OPENING_MINIMUM_DISPLAY_MILLISECONDS = 800;

type DiagnosticsLaunchState = "idle" | "opening" | "failed";

let nextDiagnosticsLaunchRequestNumber = 0;

const metricUnavailableTextByReason = {
    noSourceReading: "no source reading",
    invalidValue: "invalid value",
    expired: "expired",
    pendingRefresh: "pending refresh",
    unknown: "unknown",
} satisfies Record<DisplayedMetricUnavailableReason, string>;

export function MetricSourceDiagnostic({
    trace,
    isWindowsHardwareSummary = false,
}: MetricSourceDiagnosticProps): React.JSX.Element {
    const streamDeckClient = useStreamDeckClient();
    const { rich } = useI18n();
    const [isDebugVisible, setIsDebugVisible] = useState(isDevelopmentBuild);
    const [currentTimestampMilliseconds, setCurrentTimestampMilliseconds] = useState(wallClockNowMilliseconds);
    const [diagnosticsLaunchState, setDiagnosticsLaunchState] = useState<DiagnosticsLaunchState>("idle");
    const activeDiagnosticsLaunchRequestIdRef = useRef<string | undefined>(undefined);
    const diagnosticsLaunchStartedAtMillisecondsRef = useRef(0);
    const diagnosticsLaunchFeedbackTimeoutIdRef = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);

    // One launch owns at most one pending timer at a time, whichever stage it is
    // in: waiting for a response, holding the opening label, or showing a failure.
    const clearDiagnosticsLaunchTimeout = useCallback((): void => {
        if (diagnosticsLaunchFeedbackTimeoutIdRef.current !== undefined) {
            globalThis.clearTimeout(diagnosticsLaunchFeedbackTimeoutIdRef.current);
            diagnosticsLaunchFeedbackTimeoutIdRef.current = undefined;
        }
    }, []);

    const showDiagnosticsLaunchFailure = useCallback((requestId: string): void => {
        if (activeDiagnosticsLaunchRequestIdRef.current !== requestId) {
            return;
        }

        clearDiagnosticsLaunchTimeout();
        activeDiagnosticsLaunchRequestIdRef.current = undefined;
        // A failure is not held back by the opening floor. The floor exists so a
        // state does not vanish before the user can read it, and "failed" already
        // stays put for its own duration.
        setDiagnosticsLaunchState("failed");
        diagnosticsLaunchFeedbackTimeoutIdRef.current = globalThis.setTimeout(() => {
            setDiagnosticsLaunchState("idle");
            diagnosticsLaunchFeedbackTimeoutIdRef.current = undefined;
        }, DIAGNOSTICS_LAUNCH_FEEDBACK_DURATION_MILLISECONDS);
    }, [clearDiagnosticsLaunchTimeout]);

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

    useEffect(() => {
        const unsubscribe = streamDeckClient.sendToPropertyInspector.subscribe((event) => {
            const result = readHelperControlPanelLaunchResultMessage(event.payload);
            if (result === null || result.requestId !== activeDiagnosticsLaunchRequestIdRef.current) {
                return;
            }

            if (result.outcome === "opened") {
                clearDiagnosticsLaunchTimeout();
                activeDiagnosticsLaunchRequestIdRef.current = undefined;

                const openingDisplayedMilliseconds = wallClockNowMilliseconds()
                    - diagnosticsLaunchStartedAtMillisecondsRef.current;
                const remainingMilliseconds = DIAGNOSTICS_OPENING_MINIMUM_DISPLAY_MILLISECONDS
                    - openingDisplayedMilliseconds;
                if (remainingMilliseconds <= 0) {
                    setDiagnosticsLaunchState("idle");
                    return;
                }

                diagnosticsLaunchFeedbackTimeoutIdRef.current = globalThis.setTimeout(() => {
                    setDiagnosticsLaunchState("idle");
                    diagnosticsLaunchFeedbackTimeoutIdRef.current = undefined;
                }, remainingMilliseconds);
                return;
            }

            showDiagnosticsLaunchFailure(result.requestId);
        });

        return () => {
            clearDiagnosticsLaunchTimeout();
            unsubscribe();
        };
    }, [clearDiagnosticsLaunchTimeout, showDiagnosticsLaunchFailure, streamDeckClient]);

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
    const canOpenHelperControlPanel = isWindowsHardwareSummary
        || (
            isWindowsHelperRelatedTrace(trace)
            && trace?.preferredSourceStatus?.reason !== "helperNotInstalled"
        );
    const sensorText = formatSensorText(trace);
    const metricStateText = formatMetricStateText(trace);

    return (
        <SettingsSection title="DEBUG">
            <InspectorItem label="Toggle" className="note-item note-item-caption">
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
            {canOpenHelperControlPanel && (
                <InspectorItem label="Diagnostics">
                    <div className="advanced-action-stack">
                        <button
                            className="inline-action-button"
                            type="button"
                            disabled={diagnosticsLaunchState === "opening"}
                            onClick={() => {
                                clearDiagnosticsLaunchTimeout();

                                const requestId = `diagnostics-${nextDiagnosticsLaunchRequestNumber++}`;
                                activeDiagnosticsLaunchRequestIdRef.current = requestId;
                                diagnosticsLaunchStartedAtMillisecondsRef.current = wallClockNowMilliseconds();
                                setDiagnosticsLaunchState("opening");
                                diagnosticsLaunchFeedbackTimeoutIdRef.current = globalThis.setTimeout(() => {
                                    showDiagnosticsLaunchFailure(requestId);
                                }, DIAGNOSTICS_LAUNCH_RESPONSE_TIMEOUT_MILLISECONDS);
                                void sendOpenHelperControlPanelMessage(streamDeckClient, requestId)
                                    .catch(() => showDiagnosticsLaunchFailure(requestId));
                            }}
                        >
                            {formatDiagnosticsLaunchButtonText(diagnosticsLaunchState)}
                        </button>
                        <p className="section-note">
                            {rich(helperMessages.diagnosticsHelperNote, {
                                helper: (children) => <HelperDownloadLink>{children}</HelperDownloadLink>,
                            })}
                        </p>
                    </div>
                </InspectorItem>
            )}
        </SettingsSection>
    );
}

function formatDiagnosticsLaunchButtonText(state: DiagnosticsLaunchState): string {
    switch (state) {
        case "opening":
            return "Opening Diagnostics...";
        case "failed":
            return "Could not open Diagnostics";
        case "idle":
            return "Open ShoMetrics Diagnostics";
    }
}

function isWindowsHelperRelatedTrace(trace: DisplayedMetricReadTrace | undefined): boolean {
    return trace?.routing?.preferredSourceId === WINDOWS_HELPER_SOURCE_ID
        || trace?.routing?.selectedSourceId === WINDOWS_HELPER_SOURCE_ID;
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
