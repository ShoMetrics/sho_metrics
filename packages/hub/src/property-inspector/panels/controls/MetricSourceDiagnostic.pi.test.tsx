import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StreamDeckClientProvider } from "../../stream-deck/stream-deck-client-context";
import { TestPropertyInspectorClient } from "../../testing/test-property-inspector-client";
import { WINDOWS_HELPER_SOURCE_ID } from "../../../runtime/sources/source-ids";
import type { DisplayedMetricReadTrace } from "../../../runtime/widget-runtime-cache";
import {
    DIAGNOSTICS_OPENING_MINIMUM_DISPLAY_MILLISECONDS,
    MetricSourceDiagnostic,
} from "./MetricSourceDiagnostic";
import {
    buildHelperControlPanelLaunchResultMessage,
    readOpenHelperControlPanelMessage,
} from "../../helper-control-panel-messages";

afterEach(() => {
    vi.useRealTimers();
});

test("Helper-backed metric diagnostics open the installed diagnostics window", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    render(
        <StreamDeckClientProvider client={client}>
            <MetricSourceDiagnostic trace={buildHelperTrace()} />
        </StreamDeckClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Open ShoMetrics Diagnostics" }));

    assert.equal(client.sentMessages.length, 1);
    assert.equal(client.sentMessages[0].event, "sendToPlugin");
    assert.notEqual(readOpenHelperControlPanelMessage(client.sentMessages[0].payload), null);
    assert.notEqual(screen.queryByRole("link", { name: "ShoMetrics Helper" }), null);
});

test("Helper diagnostics stay visible outside debug details and report launch failures in place", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    render(
        <StreamDeckClientProvider client={client}>
            <MetricSourceDiagnostic trace={buildHelperTrace()} />
        </StreamDeckClientProvider>,
    );

    await user.click(screen.getByRole("checkbox", { name: "Show debug" }));
    assert.equal(screen.queryByText(/Current source:/), null);
    assert.notEqual(screen.queryByRole("button", { name: "Open ShoMetrics Diagnostics" }), null);

    await user.click(screen.getByRole("button", { name: "Open ShoMetrics Diagnostics" }));
    const launchRequest = readOpenHelperControlPanelMessage(client.sentMessages[0].payload);
    assert.notEqual(launchRequest, null);
    if (launchRequest === null) {
        throw new Error("The diagnostics button must send an open request.");
    }
    await act(async () => {
        client.dispatchSendToPropertyInspector(
            buildHelperControlPanelLaunchResultMessage(launchRequest.requestId, "failed"),
        );
    });

    await screen.findByRole("button", { name: "Could not open Diagnostics" });
});

test("the diagnostics button keeps showing progress until the panel window can appear", async () => {
    vi.useFakeTimers();
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    render(
        <StreamDeckClientProvider client={client}>
            <MetricSourceDiagnostic trace={buildHelperTrace()} />
        </StreamDeckClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open ShoMetrics Diagnostics" }));
    const launchRequest = readOpenHelperControlPanelMessage(client.sentMessages[0].payload);
    if (launchRequest === null) {
        throw new Error("The diagnostics button must send an open request.");
    }

    // The plugin answers as soon as the process spawns, long before its window is
    // on screen. The button must not fall back to its idle label yet.
    await act(async () => {
        client.dispatchSendToPropertyInspector(
            buildHelperControlPanelLaunchResultMessage(launchRequest.requestId, "opened"),
        );
    });
    assert.notEqual(screen.queryByRole("button", { name: "Opening Diagnostics..." }), null);

    await act(async () => {
        await vi.advanceTimersByTimeAsync(DIAGNOSTICS_OPENING_MINIMUM_DISPLAY_MILLISECONDS);
    });
    assert.notEqual(screen.queryByRole("button", { name: "Open ShoMetrics Diagnostics" }), null);
});

test("non-Helper metric diagnostics do not offer the diagnostics window", () => {
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    render(
        <StreamDeckClientProvider client={client}>
            <MetricSourceDiagnostic trace={{
                ...buildHelperTrace(),
                routing: {
                    preferredSourceId: "node-system",
                    selectedSourceId: "node-system",
                },
            }} />
        </StreamDeckClientProvider>,
    );

    assert.equal(screen.queryByRole("button", { name: "Open ShoMetrics Diagnostics" }), null);
});

test("Windows hardware summary diagnostics remain available when the primary trace uses Node", () => {
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    render(
        <StreamDeckClientProvider client={client}>
            <MetricSourceDiagnostic
                trace={{
                    ...buildHelperTrace(),
                    routing: {
                        preferredSourceId: "node-system",
                        selectedSourceId: "node-system",
                    },
                }}
                isWindowsHardwareSummary
            />
        </StreamDeckClientProvider>,
    );

    assert.notEqual(screen.queryByRole("button", { name: "Open ShoMetrics Diagnostics" }), null);
    assert.notEqual(screen.queryByRole("link", { name: "ShoMetrics Helper" }), null);
});

test("Windows hardware summary diagnostics remain available when Helper is not installed", () => {
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    render(
        <StreamDeckClientProvider client={client}>
            <MetricSourceDiagnostic
                trace={{
                    ...buildHelperTrace(),
                    preferredSourceStatus: {
                        state: "unavailable",
                        reason: "helperNotInstalled",
                    },
                }}
                isWindowsHardwareSummary
            />
        </StreamDeckClientProvider>,
    );

    assert.notEqual(screen.queryByRole("button", { name: "Open ShoMetrics Diagnostics" }), null);
});

function buildHelperTrace(): DisplayedMetricReadTrace {
    return {
        metricKey: "cpu.temperature_celsius",
        routing: {
            preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
            selectedSourceId: WINDOWS_HELPER_SOURCE_ID,
        },
        preferredSourceStatus: {
            state: "available",
        },
        outcome: undefined,
    };
}
