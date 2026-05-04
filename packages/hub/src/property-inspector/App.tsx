import { useEffect, useMemo, useRef, useState } from "react";
import { FieldRenderer } from "./components/FieldRenderer";
import { readControlValue } from "./control-events";
import { normalizeNextSettings, normalizeSettings, resolveInspectorFieldList } from "./scenarios";
import {
    basePropertyInspectorSettings,
    resolveActionKind,
    type ActionKind,
    type PropertyInspectorSettings,
} from "./settings";
import {
    readActionUuid,
    resolveIsWindowsPropertyInspector,
    type StreamDeckPropertyInspectorClient,
} from "./stream-deck-client";
import type { PropertyInspectorSettingKey } from "./schema";

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

    const updateSetting = (changedKey: PropertyInspectorSettingKey, changedValue: string): void => {
        setState((currentState) => {
            const nextSettings = normalizeNextSettings({
                changedKey,
                changedValue,
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

            updateSetting(controlValue.key, controlValue.value);
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
            {resolveInspectorFieldList(visibilityContext)
                .map((field) => (
                    <FieldRenderer
                        key={field.id}
                        field={field}
                        context={visibilityContext}
                        onSettingChange={updateSetting}
                    />
                ))}
        </div>
    );
}
