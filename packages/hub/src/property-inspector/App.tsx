import { useEffect, useMemo, useRef, useState } from "react";
import { FieldRenderer } from "./components/FieldRenderer";
import { readControlValue } from "./control-events";
import { isFieldVisible, propertyInspectorSchema } from "./schema";
import {
    basePropertyInspectorSettings,
    normalizeDiskMetricKind,
    normalizeDiskThroughputDirection,
    normalizeDiskUsageDisplayMode,
    normalizeNetworkDirection,
    normalizeOptionalPositiveNumber,
    normalizePollingFrequency,
    normalizePositiveNumber,
    normalizeSettings,
    normalizeTemperatureUnit,
    normalizeThreshold,
    resolveActionKind,
    resolveDefaultDiskPollingFrequency,
    resolveDefaultSolidColor,
    type ActionKind,
    type PropertyInspectorSettings,
    type SettingValue,
} from "./settings";
import {
    readActionUuid,
    resolveIsWindowsPropertyInspector,
    type StreamDeckPropertyInspectorClient,
} from "./stream-deck-client";

interface AppProps {
    client: StreamDeckPropertyInspectorClient;
}

interface PropertyInspectorState {
    actionKind: ActionKind;
    isWindows: boolean;
    settings: PropertyInspectorSettings;
    loadError: string | null;
}

const initialState: PropertyInspectorState = {
    actionKind: "unknown",
    isWindows: false,
    settings: { ...basePropertyInspectorSettings },
    loadError: null,
};

export function App({ client }: AppProps): React.JSX.Element {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [state, setState] = useState<PropertyInspectorState>(initialState);
    const visibilityContext = useMemo(() => ({
        actionKind: state.actionKind,
        isWindows: state.isWindows,
        settings: state.settings,
    }), [state.actionKind, state.isWindows, state.settings]);

    useEffect(() => {
        let isDisposed = false;

        async function loadSettings(): Promise<void> {
            const connectionInfo = await client.getConnectionInfo();
            const payload = await client.getSettings();
            const actionKind = resolveActionKind(readActionUuid(connectionInfo));
            const isWindows = resolveIsWindowsPropertyInspector(connectionInfo);

            if (isDisposed) {
                return;
            }

            setState({
                actionKind,
                isWindows,
                settings: normalizeSettings(payload.settings, { actionKind, isWindows }),
                loadError: null,
            });
        }

        client.didReceiveSettings.subscribe((event) => {
            setState((currentState) => ({
                ...currentState,
                settings: normalizeSettings(event.payload.settings, {
                    actionKind: currentState.actionKind,
                    isWindows: currentState.isWindows,
                }),
            }));
        });

        loadSettings().catch((error: Error) => {
            setState((currentState) => ({
                ...currentState,
                loadError: `Failed to load settings: ${error.message}`,
            }));
        });

        return () => {
            isDisposed = true;
        };
    }, [client]);

    useEffect(() => {
        const root = rootRef.current;

        if (!root) {
            return;
        }

        const handleControlEvent = (event: Event): void => {
            const controlValue = readControlValue(event);

            if (!controlValue) {
                return;
            }

            setState((currentState) => {
                const nextSettings = normalizeNextSettings({
                    changedKey: controlValue.key,
                    changedValue: controlValue.value,
                    state: currentState,
                });

                client.setSettings(nextSettings).catch((error: Error) => {
                    setState((errorState) => ({
                        ...errorState,
                        loadError: `Failed to save settings: ${error.message}`,
                    }));
                });

                return {
                    ...currentState,
                    settings: nextSettings,
                    loadError: null,
                };
            });
        };

        root.addEventListener("input", handleControlEvent, true);
        root.addEventListener("change", handleControlEvent, true);

        return () => {
            root.removeEventListener("input", handleControlEvent, true);
            root.removeEventListener("change", handleControlEvent, true);
        };
    }, [client]);

    if (state.loadError) {
        return <div ref={rootRef}>{state.loadError}</div>;
    }

    return (
        <div ref={rootRef}>
            {propertyInspectorSchema
                .filter((field) => isFieldVisible(field, visibilityContext))
                .map((field) => (
                    <FieldRenderer key={field.id} field={field} context={visibilityContext} />
                ))}
        </div>
    );
}

function normalizeNextSettings(options: {
    changedKey: string;
    changedValue: string;
    state: PropertyInspectorState;
}): PropertyInspectorSettings {
    const rawSettings: Record<string, SettingValue> = {
        ...options.state.settings,
        [options.changedKey]: options.changedValue,
    };
    const diskMetricKind = normalizeDiskMetricKind(
        options.changedKey === "diskMetricKind" ? options.changedValue : options.state.settings.diskMetricKind,
        options.state.isWindows,
    );
    const lowThreshold = normalizeThreshold(rawSettings.lowThreshold, basePropertyInspectorSettings.lowThreshold);
    const highThreshold = normalizeThreshold(rawSettings.highThreshold, basePropertyInspectorSettings.highThreshold);
    const orderedThresholds = resolveOrderedThresholds(options.changedKey, lowThreshold, highThreshold);
    const networkDirection = normalizeNetworkDirection(rawSettings.networkDirection);

    return normalizeSettings({
        ...rawSettings,
        pollingFrequencySeconds: options.changedKey === "diskMetricKind"
            ? resolveDefaultDiskPollingFrequency(diskMetricKind)
            : normalizePollingFrequency(rawSettings.pollingFrequencySeconds),
        diskMetricKind,
        diskUsageDisplayMode: normalizeDiskUsageDisplayMode(rawSettings.diskUsageDisplayMode),
        diskThroughputDirection: normalizeDiskThroughputDirection(rawSettings.diskThroughputDirection),
        maximumDiskThroughputMebibytesPerSecond: normalizePositiveNumber(
            rawSettings.maximumDiskThroughputMebibytesPerSecond,
            basePropertyInspectorSettings.maximumDiskThroughputMebibytesPerSecond,
        ),
        maximumTemperatureCelsius: normalizePositiveNumber(
            rawSettings.maximumTemperatureCelsius,
            basePropertyInspectorSettings.maximumTemperatureCelsius,
        ),
        maximumGpuPowerWatts: normalizeOptionalPositiveNumber(rawSettings.maximumGpuPowerWatts),
        maximumNetworkSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.maximumNetworkSpeedMbps),
        networkDirection,
        networkUnitBase: rawSettings.networkUnitBase === "bit" ? "bit" : "byte",
        temperatureUnit: normalizeTemperatureUnit(rawSettings.temperatureUnit),
        lowThreshold: orderedThresholds.lowThreshold,
        highThreshold: orderedThresholds.highThreshold,
        solidColor: resolveNextSolidColor({
            changedKey: options.changedKey,
            changedValue: options.changedValue,
            networkDirection,
            state: options.state,
        }),
        netSpeedDefaultsApplied: options.state.actionKind === "net-speed"
            ? true
            : options.state.settings.netSpeedDefaultsApplied,
        diskDefaultsApplied: options.state.actionKind === "disk"
            ? true
            : options.state.settings.diskDefaultsApplied,
    }, {
        actionKind: options.state.actionKind,
        isWindows: options.state.isWindows,
    });
}

function resolveOrderedThresholds(
    changedKey: string,
    lowThreshold: number,
    highThreshold: number,
): { lowThreshold: number; highThreshold: number } {
    if (lowThreshold <= highThreshold) {
        return { lowThreshold, highThreshold };
    }

    if (changedKey === "lowThreshold") {
        return { lowThreshold, highThreshold: lowThreshold };
    }

    return { lowThreshold: highThreshold, highThreshold };
}

function resolveNextSolidColor(options: {
    changedKey: string;
    changedValue: SettingValue;
    networkDirection: SettingValue;
    state: PropertyInspectorState;
}): string {
    if (options.changedKey !== "networkDirection" || options.state.actionKind !== "net-speed") {
        return typeof options.state.settings.solidColor === "string"
            ? options.state.settings.solidColor
            : resolveDefaultSolidColor(options.networkDirection);
    }

    const currentDefaultColor = resolveDefaultSolidColor(options.state.settings.networkDirection);

    if (options.state.settings.solidColor && options.state.settings.solidColor !== currentDefaultColor) {
        return options.state.settings.solidColor;
    }

    return resolveDefaultSolidColor(options.changedValue);
}
