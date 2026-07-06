import assert from "node:assert/strict";
import { test } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../../color-compensation/types";
import type { WidgetRuntimeCachePatch } from "../../../runtime/widget-runtime-cache";
import type { BatteryDeviceDescriptor } from "../../../runtime/sources/battery/battery-device-descriptor";
import { buildDenseCustomHttpConsumerSlug } from "../../../runtime/sources/custom-http/custom-http-metric-key";
import { resolveQuickStartStoredWidgetSettings } from "../../../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../../../settings/storage/patch/widget-settings-patch";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../../../shared/stream-deck-actions";
import { StreamDeckClientProvider } from "../../stream-deck/stream-deck-client-context";
import { buildVisibilityContext, type InspectorTestSettings } from "../../testing/test-context";
import {
    readPropertyInspectorScrollTopForTest,
    setPropertyInspectorScrollTopForTest,
} from "../../testing/scroll-position";
import {
    readTestSettingsRecord,
    TestPropertyInspectorClient,
    type SentStreamDeckMessage,
} from "../../testing/test-property-inspector-client";
import { WidgetSettingsTab } from "../tabs/WidgetSettingsTab";

test("dense custom metric source editing uses a focused child page", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.denseMultiMetric,
    });

    render(<DenseSettingsHarness client={client} settings={buildDenseCustomMetricSettings()} />);

    assert.notEqual(screen.queryByRole("heading", { name: "Metrics" }), null);

    setPropertyInspectorScrollTopForTest(420);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    assert.notEqual(screen.queryByRole("heading", { name: "HTTP Source" }), null);
    await waitFor(() => {
        assert.equal(readPropertyInspectorScrollTopForTest(), 0);
    });
    assert.equal(screen.queryByRole("heading", { name: "Metrics" }), null);
    assert.equal(screen.queryByRole("heading", { name: "Appearance" }), null);
    assert.equal(screen.queryByRole("combobox", { name: /^Polling/ }), null);

    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

    const fetchMessage = readLastFetchSamplePayload(client.sentMessages);
    assert.equal(fetchMessage.command, "fetchSample");
    assert.equal(fetchMessage.consumerSlug, buildDenseCustomHttpConsumerSlug("slot-1"));

    await user.click(screen.getByRole("button", { name: "Back" }));

    assert.notEqual(screen.queryByRole("heading", { name: "Metrics" }), null);
});

test("dense row metric selector exposes System & Battery", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.denseMultiMetric,
    });

    render(<DenseSettingsHarness client={client} settings={buildDenseCustomMetricSettings()} />);

    await user.click(screen.getAllByRole("combobox", { name: /^Metric:/ })[0]);

    assert.notEqual(screen.queryByRole("option", { name: "System & Battery" }), null);
});

test("dense System battery row uses inline device selection and prefills the row label", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.denseMultiMetric,
    });

    render(<DenseSettingsHarness
        client={client}
        settings={buildDenseCustomMetricSettings()}
        runtimeCache={{
            availableBatteryDevices: [buildBatteryDeviceDescriptor()],
        }}
        runtimeCacheStatus={{
            batteryDeviceOptionsStatus: "ready",
        }}
    />);

    await user.click(screen.getAllByRole("combobox", { name: /^Metric:/ })[0]);
    await user.click(screen.getByRole("option", { name: "System & Battery" }));

    assert.equal(screen.queryByRole("heading", { name: "Battery" }), null);

    await user.click(screen.getByRole("combobox", { name: /^Battery:/ }));
    await user.click(screen.getByRole("option", { name: "[Bluetooth] MX Master 4" }));

    await waitFor(() => {
        assert.equal((screen.getAllByRole("textbox", { name: /^Label:/ })[0] as HTMLInputElement).value, "MX M");
    });
    assert.match(screen.getByRole("combobox", { name: /^Polling/ }).textContent ?? "", /1 minute/);
});

function DenseSettingsHarness({
    client,
    settings: initialSettings,
    runtimeCache,
    runtimeCacheStatus,
}: {
    readonly client: TestPropertyInspectorClient;
    readonly settings: InspectorTestSettings;
    readonly runtimeCache?: WidgetRuntimeCachePatch | undefined;
    readonly runtimeCacheStatus?: NonNullable<Parameters<typeof buildVisibilityContext>[0]>["runtimeCacheStatus"];
}): React.JSX.Element {
    const [settings, setSettings] = useState<InspectorTestSettings>(initialSettings);

    return (
        <StreamDeckClientProvider client={client}>
            <WidgetSettingsTab
                context={buildVisibilityContext({
                    actionKind: "denseMultiMetric",
                    isWindows: true,
                    settings,
                    runtimeCache,
                    runtimeCacheStatus,
                })}
                isGlobalViewOverrideEnabled={false}
                isGlobalThemeOverrideEnabled={false}
                isGlobalTransparentSurfaceOverrideEnabled={false}
                isGlobalPaintOverrideEnabled={false}
                colorCompensationProfile={DEFAULT_COLOR_COMPENSATION_PROFILE}
                onSettingsPatch={(patch) => {
                    setSettings((currentSettings: InspectorTestSettings) => writeStoredWidgetSettingsPatch(
                        currentSettings,
                        patch,
                    ));
                }}
                onResetWidgetSettings={() => undefined}
                onOpenColorCompensation={() => undefined}
            />
        </StreamDeckClientProvider>
    );
}

function buildBatteryDeviceDescriptor(): BatteryDeviceDescriptor {
    return {
        descriptorId: "bluetooth-mx-master-4",
        displayName: "MX Master 4",
        metricKey: "system:battery:bluetooth:mx-master-4",
        transport: "bluetooth",
        receiverKind: undefined,
        isExperimental: false,
        supportState: "supported",
        identity: {
            evidence: {
                kind: "bluetooth",
                primaryIdentifier: {
                    kind: "platformInstanceId",
                    hash: "1".repeat(64),
                },
                fallbackIdentifier: undefined,
            },
        },
    };
}

function buildDenseCustomMetricSettings(): InspectorTestSettings {
    const rawSettings = resolveQuickStartStoredWidgetSettings(undefined, "denseMultiMetric", {
        createSlotId: createDenseSlotIdForTest(),
    }).rawSettings;

    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(rawSettings, {
        dense: {
            updateSlot: {
                slotId: "slot-1",
                target: { domain: "customMetric" },
                customMetric: {
                    url: "https://api.example.com/weather",
                    userIntent: "Display temperature",
                    jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
                },
            },
        },
    }, {
        createSlotId: createDenseSlotIdForTest(),
    }));
}

function createDenseSlotIdForTest(): () => string {
    const slotIds = ["slot-1", "slot-2"];

    return () => slotIds.shift() ?? "unexpected-slot";
}

function readLastFetchSamplePayload(messages: readonly SentStreamDeckMessage[]): {
    readonly command: "fetchSample";
    readonly consumerSlug: string;
} {
    const message = readLastFetchSampleMessage(messages);
    if (!message || message.event !== "sendToPlugin") {
        throw new Error("Expected a sendToPlugin message.");
    }

    const payload = message.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Expected object payload.");
    }

    const record = payload as Record<string, unknown>;
    const command = record["command"];
    const consumerSlug = record["consumerSlug"];
    if (command !== "fetchSample" || typeof consumerSlug !== "string") {
        throw new Error("Expected Custom HTTP fetch sample payload.");
    }

    return { command, consumerSlug };
}

function readLastFetchSampleMessage(messages: readonly SentStreamDeckMessage[]): SentStreamDeckMessage | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.event !== "sendToPlugin") {
            continue;
        }

        const payload = message.payload;
        if (
            typeof payload === "object"
            && payload !== null
            && !Array.isArray(payload)
            && (payload as Record<string, unknown>)["command"] === "fetchSample"
        ) {
            return message;
        }
    }

    return undefined;
}
