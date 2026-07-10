import { strict as assert } from "node:assert";
import { act, renderHook } from "@testing-library/react";
import { afterEach, test, vi } from "vitest";
import {
    buildPropertyInspectorPluginRuntimePongMessage,
    readPropertyInspectorPluginRuntimePingMessage,
} from "./plugin-runtime-connection-messages";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { TestPropertyInspectorClient } from "./testing/test-property-inspector-client";
import {
    PLUGIN_RUNTIME_CONNECTION_RETRY_DELAY_MILLISECONDS,
    PLUGIN_RUNTIME_CONNECTION_TIMEOUT_MILLISECONDS,
    usePluginRuntimeConnectionStatus,
} from "./usePluginRuntimeConnectionStatus";

afterEach(() => {
    vi.useRealTimers();
});

test("retries once before reporting an unresponsive plugin runtime", async () => {
    vi.useFakeTimers();
    const client = new TestPropertyInspectorClient({ actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.cpu });
    const { result } = renderHook(() => usePluginRuntimeConnectionStatus(client));

    await act(async () => {
        await vi.advanceTimersByTimeAsync(PLUGIN_RUNTIME_CONNECTION_RETRY_DELAY_MILLISECONDS);
    });

    assert.equal(result.current, "checking");
    assert.equal(readPluginRuntimeConnectionPingCount(client), 2);

    await act(async () => {
        await vi.advanceTimersByTimeAsync(
            PLUGIN_RUNTIME_CONNECTION_TIMEOUT_MILLISECONDS
            - PLUGIN_RUNTIME_CONNECTION_RETRY_DELAY_MILLISECONDS,
        );
    });

    assert.equal(result.current, "unresponsive");
});

test("accepts a pong from the late plugin runtime retry", async () => {
    vi.useFakeTimers();
    const client = new TestPropertyInspectorClient({ actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.cpu });
    const { result } = renderHook(() => usePluginRuntimeConnectionStatus(client));

    await act(async () => {
        await vi.advanceTimersByTimeAsync(PLUGIN_RUNTIME_CONNECTION_RETRY_DELAY_MILLISECONDS);
    });
    const requestId = requirePluginRuntimeConnectionPingRequestId(client);

    await act(async () => {
        client.dispatchSendToPropertyInspector(buildPropertyInspectorPluginRuntimePongMessage(requestId));
        await vi.advanceTimersByTimeAsync(
            PLUGIN_RUNTIME_CONNECTION_TIMEOUT_MILLISECONDS
            - PLUGIN_RUNTIME_CONNECTION_RETRY_DELAY_MILLISECONDS,
        );
    });

    assert.equal(result.current, "connected");
    assert.equal(readPluginRuntimeConnectionPingCount(client), 2);
});

test("cancels the retry after the initial plugin runtime pong", async () => {
    vi.useFakeTimers();
    const client = new TestPropertyInspectorClient({ actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.cpu });
    const { result } = renderHook(() => usePluginRuntimeConnectionStatus(client));
    const requestId = requirePluginRuntimeConnectionPingRequestId(client);

    await act(async () => {
        client.dispatchSendToPropertyInspector(buildPropertyInspectorPluginRuntimePongMessage(requestId));
        await vi.advanceTimersByTimeAsync(PLUGIN_RUNTIME_CONNECTION_TIMEOUT_MILLISECONDS);
    });

    assert.equal(result.current, "connected");
    assert.equal(readPluginRuntimeConnectionPingCount(client), 1);
});

test("cleans up the pending retry when the Property Inspector closes", async () => {
    vi.useFakeTimers();
    const client = new TestPropertyInspectorClient({ actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.cpu });
    const { unmount } = renderHook(() => usePluginRuntimeConnectionStatus(client));

    unmount();
    await act(async () => {
        await vi.advanceTimersByTimeAsync(PLUGIN_RUNTIME_CONNECTION_TIMEOUT_MILLISECONDS);
    });

    assert.equal(readPluginRuntimeConnectionPingCount(client), 1);
});

function requirePluginRuntimeConnectionPingRequestId(client: TestPropertyInspectorClient): string {
    for (const message of client.sentMessages) {
        if (message.event !== "sendToPlugin") {
            continue;
        }

        const pingMessage = readPropertyInspectorPluginRuntimePingMessage(message.payload);
        if (pingMessage !== null) {
            return pingMessage.requestId;
        }
    }

    assert.fail("Expected the Property Inspector to send a plugin runtime connection ping.");
}

function readPluginRuntimeConnectionPingCount(client: TestPropertyInspectorClient): number {
    return client.sentMessages.filter((message) => (
        message.event === "sendToPlugin"
        && readPropertyInspectorPluginRuntimePingMessage(message.payload) !== null
    )).length;
}
