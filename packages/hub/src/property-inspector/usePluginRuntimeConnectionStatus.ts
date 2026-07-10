import { useEffect, useState } from "react";
import {
    buildPropertyInspectorPluginRuntimePingMessage,
    readPropertyInspectorPluginRuntimePongMessage,
} from "./plugin-runtime-connection-messages";
import type { StreamDeckPropertyInspectorClient } from "./stream-deck/stream-deck-client";

export type PluginRuntimeConnectionStatus = "checking" | "connected" | "unresponsive";

// Retry late in the 10 second diagnosis window, then reserve its final two
// seconds for the response. The banner is for a dead plugin runtime, not a
// loading indicator; showing it late is fine, wrong is not.
export const PLUGIN_RUNTIME_CONNECTION_RETRY_DELAY_MILLISECONDS = 8_000;
const PluginRuntimeConnectionRetryResponseWindowMilliseconds = 2_000;
export const PLUGIN_RUNTIME_CONNECTION_TIMEOUT_MILLISECONDS =
    PLUGIN_RUNTIME_CONNECTION_RETRY_DELAY_MILLISECONDS
    + PluginRuntimeConnectionRetryResponseWindowMilliseconds;

// Module level so request ids stay unique across PI remounts (including React
// StrictMode double mounting); a stale pong can then never match a newer request.
let nextPluginRuntimeConnectionRequestNumber = 0;

export function usePluginRuntimeConnectionStatus(
    client: StreamDeckPropertyInspectorClient,
): PluginRuntimeConnectionStatus {
    const [status, setStatus] = useState<PluginRuntimeConnectionStatus>("checking");

    useEffect(() => {
        let isDisposed = false;
        let failureTimeoutId: number | undefined;
        const requestId = `pi-plugin-runtime-${nextPluginRuntimeConnectionRequestNumber++}`;
        const sendPing = (): void => {
            client.send("sendToPlugin", buildPropertyInspectorPluginRuntimePingMessage(requestId))
                .catch(() => {
                    // Keep the same delayed UI path for send failures. The warning is
                    // only useful after the host has had a short chance to recover.
                });
        };

        const retryTimeoutId = window.setTimeout(() => {
            if (!isDisposed) {
                sendPing();
                failureTimeoutId = window.setTimeout(() => {
                    if (!isDisposed) {
                        setStatus("unresponsive");
                    }
                }, PluginRuntimeConnectionRetryResponseWindowMilliseconds);
            }
        }, PLUGIN_RUNTIME_CONNECTION_RETRY_DELAY_MILLISECONDS);

        // The subscription stays alive after the timeout fires, so a pong that
        // arrives late flips "unresponsive" back to "connected" on its own.
        const unsubscribe = client.sendToPropertyInspector.subscribe((event) => {
            const message = readPropertyInspectorPluginRuntimePongMessage(event.payload);
            if (message?.requestId !== requestId) {
                return;
            }

            window.clearTimeout(retryTimeoutId);
            if (failureTimeoutId !== undefined) {
                window.clearTimeout(failureTimeoutId);
            }
            if (!isDisposed) {
                setStatus("connected");
            }
        });

        // Stream Deck can drop sends made before a recovering plugin registers.
        // The late retry covers that startup race without turning this lifecycle
        // probe into a recurring heartbeat.
        sendPing();

        return () => {
            isDisposed = true;
            window.clearTimeout(retryTimeoutId);
            if (failureTimeoutId !== undefined) {
                window.clearTimeout(failureTimeoutId);
            }
            unsubscribe();
        };
    }, [client]);

    return status;
}
