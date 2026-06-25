import assert from "node:assert/strict";
import { test } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";
import type { BatteryDeviceDescriptor } from "../../runtime/sources/battery/battery-device-descriptor";
import {
    NODE_SYSTEM_SOURCE_ID,
} from "../../runtime/sources/source-ids";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../../shared/stream-deck-actions";
import { wallClockNowMilliseconds } from "../../shared/clock";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/patch/widget-settings-patch";
import {
    writeStoredGlobalSettingsPatch,
    type StoredGlobalSettingsPatch,
} from "../../settings/storage/global-settings-patch";
import { StreamDeckClientProvider } from "../stream-deck/stream-deck-client-context";
import {
    readPropertyInspectorScrollTopForTest,
    setPropertyInspectorScrollTopForTest,
} from "../testing/scroll-position";
import { TestPropertyInspectorClient } from "../testing/test-property-inspector-client";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import { WidgetSettingsTab } from "./WidgetSettingsTab";

test("stacked metric slot editor stays open after auto-save settings updates", async () => {
    const user = userEvent.setup();

    render(<StackedWidgetSettingsHarness />);

    assert.equal(screen.queryByText("CPU Metric:"), null);
    assert.notEqual(screen.queryByRole("button", { name: "Reset Widget Settings" }), null);

    await user.click(screen.getByRole("combobox", { name: /Interval/ }));
    await user.click(screen.getByRole("option", { name: "5s" }));
    assert.match(screen.getByRole("combobox", { name: /Interval/ }).textContent ?? "", /5s/);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    await screen.findByRole("heading", { name: "Editing Metric #1" });
    assert.notEqual(screen.queryByText("CPU Metric:"), null);

    await waitFor(() => {
        assert.equal(screen.queryByRole("button", { name: "Reset Widget Settings" }), null);
    });

    await user.click(screen.getByRole("combobox", { name: /CPU Metric/ }));
    await user.click(screen.getByRole("option", { name: "Temperature" }));

    await screen.findByRole("heading", { name: "Editing Metric #1" });
    assert.notEqual(screen.queryByText("CPU Metric:"), null);

    await user.click(screen.getByRole("button", { name: "Back" }));

    await screen.findByRole("heading", { name: "Stack" });
    assert.equal(screen.queryByText("CPU Metric:"), null);
    await waitFor(() => {
        assert.notEqual(screen.queryByRole("button", { name: "Reset Widget Settings" }), null);
    });
});

test("stacked metric slot editor can select Custom Metric", async () => {
    const user = userEvent.setup();

    render(<StackedWidgetSettingsHarness />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await screen.findByRole("heading", { name: "Editing Metric #1" });

    await user.click(screen.getByRole("combobox", { name: /Metric Type/ }));
    await user.click(screen.getByRole("option", { name: "Custom Metric" }));

    await screen.findByText("HTTP Source:");
    assert.notEqual(screen.queryByText("Needs setup"), null);
});

test("stacked metric slot editor can select System and bumps shared polling", async () => {
    const user = userEvent.setup();

    render(<StackedWidgetSettingsHarness settings={buildStackedWidgetSettings({
        preferences: {
            pollingFrequencySeconds: 1,
        },
    })} />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await screen.findByRole("heading", { name: "Editing Metric #1" });

    await user.click(screen.getByRole("combobox", { name: /Metric Type/ }));
    await user.click(screen.getByRole("option", { name: "System" }));

    await screen.findByRole("heading", { name: "Battery" });
    assert.equal(screen.queryByText("Polling Frequency:"), null);

    await user.click(screen.getByRole("button", { name: "Back" }));

    await screen.findByRole("heading", { name: "Stack" });
    assert.match(screen.getByRole("combobox", { name: /Polling Frequency/ }).textContent ?? "", /60s/);
});

test("stacked metric slot editor reuses System settings without child polling", async () => {
    const user = userEvent.setup();

    render(<StackedWidgetSettingsHarness settings={buildStackedWidgetSettings({
        stacked: {
            updateSlot: {
                slotId: "slot-1",
                metricDomain: "system",
            },
        },
    })} />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    await screen.findByRole("heading", { name: "Battery" });
    assert.equal(screen.queryByText("Polling Frequency:"), null);
});

test("stacked metric System slot editor can enable experimental USB device support", async () => {
    const user = userEvent.setup();

    render(<StackedWidgetSettingsHarness settings={buildStackedWidgetSettings({
        stacked: {
            updateSlot: {
                slotId: "slot-1",
                metricDomain: "system",
            },
        },
    })} />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await screen.findByRole("heading", { name: "Battery" });
    await user.click(screen.getByRole("checkbox", { name: "Enable experimental support" }));

    assert.equal((screen.getByRole("checkbox", { name: "Enable experimental support" }) as HTMLInputElement).checked, true);
    const reopenNote = screen.getByText("Reopen this panel to refresh the USB device list.");
    assert.equal(reopenNote.tagName, "STRONG");
});

test("stacked metric System slot editor bumps shared polling when selecting vendor HID battery", async () => {
    const user = userEvent.setup();
    const batteryDevice = buildBatteryDeviceDescriptor();

    render(<StackedWidgetSettingsHarness
        settings={buildStackedWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 1,
            },
            stacked: {
                updateSlot: {
                    slotId: "slot-1",
                    metricDomain: "system",
                },
            },
        })}
        globalSettings={writeStoredGlobalSettingsPatch(undefined, {
            system: {
                experimentalVendorHidBatteryEnabled: true,
            },
        })}
        runtimeCache={{
            availableBatteryDevices: [batteryDevice],
        }}
    />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await screen.findByRole("heading", { name: "Battery" });
    await user.click(screen.getByRole("combobox", { name: /Battery/ }));
    await user.click(screen.getByRole("option", { name: "[Dongle] MX Master 4" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    await screen.findByRole("heading", { name: "Stack" });
    assert.match(screen.getByRole("combobox", { name: /Polling Frequency/ }).textContent ?? "", /10m/);
});

test("stacked custom metric source editing hides the slot editor chrome", async () => {
    const user = userEvent.setup();

    render(<StackedWidgetSettingsHarness />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await screen.findByRole("heading", { name: "Editing Metric #1" });

    await user.click(screen.getByRole("combobox", { name: /Metric Type/ }));
    await user.click(screen.getByRole("option", { name: "Custom Metric" }));
    setPropertyInspectorScrollTopForTest(420);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    await screen.findByRole("heading", { name: "HTTP Source" });
    await waitFor(() => {
        assert.equal(readPropertyInspectorScrollTopForTest(), 0);
    });
    assert.equal(screen.queryByRole("heading", { name: "Editing Metric #1" }), null);
    assert.equal(screen.queryByRole("combobox", { name: /Metric Type/ }), null);
    assert.equal(screen.getAllByRole("button", { name: "Back" }).length, 1);
});

test("stacked custom metric request warning uses the shared stacked polling rate", async () => {
    const user = userEvent.setup();

    render(<StackedWidgetSettingsHarness settings={buildStackedWidgetSettings({
        preferences: { pollingFrequencySeconds: 1 },
        stacked: {
            updateSlot: {
                slotId: "slot-1",
                metricDomain: "customMetric",
                singleMetric: {
                    customMetric: {
                        url: "https://api.example.com/weather",
                        userIntent: "Display temperature",
                        jqTransform: "{metric:{label:\"TEMP\",value:.temp,unit:\"celsius\"}}",
                    },
                },
            },
        },
    })} />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await screen.findByRole("heading", { name: "Editing Metric #1" });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    assert.match(
        await screen.findByText(/Worst-case request time/).then(element => element.textContent ?? ""),
        /1s polling frequency/,
    );
});

function StackedWidgetSettingsHarness({
    settings: initialSettings,
    globalSettings: initialGlobalSettings,
    runtimeCache,
}: {
    readonly settings?: InspectorTestSettings | undefined;
    readonly globalSettings?: InspectorTestSettings | undefined;
    readonly runtimeCache?: WidgetRuntimeCachePatch | undefined;
}): React.JSX.Element {
    const [settings, setSettings] = useState<InspectorTestSettings>(() => initialSettings ?? buildStackedWidgetSettings());
    const [globalSettings, setGlobalSettings] = useState<InspectorTestSettings>(() => initialGlobalSettings ?? {});
    const [client] = useState(() => new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.stackedMetric,
    }));

    return (
        <StreamDeckClientProvider client={client}>
            <WidgetSettingsTab
                context={buildVisibilityContext({
                    actionKind: "stackedMetric",
                    isWindows: true,
                    settings,
                    globalSettings,
                    runtimeCache: {
                        displayedMetricReadTrace: {
                            metricKey: "cpu.usage_percent",
                            routing: {
                                preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                                selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                            },
                            outcome: {
                                kind: "value",
                                valueTimestampMilliseconds: wallClockNowMilliseconds(),
                                freshness: "fresh",
                            },
                        },
                        ...runtimeCache,
                    },
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
                onGlobalSettingsPatch={(patch: StoredGlobalSettingsPatch) => {
                    setGlobalSettings((currentSettings: InspectorTestSettings) => writeStoredGlobalSettingsPatch(
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

function buildStackedWidgetSettings(patch?: StoredWidgetSettingsPatch): InspectorTestSettings {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
        createSlotId: createStackedSlotIdForTest(),
    }).rawSettings;

    return patch === undefined
        ? quickStartSettings
        : writeStoredWidgetSettingsPatch(quickStartSettings, patch, {
            createSlotId: createStackedSlotIdForTest(),
        });
}

function createStackedSlotIdForTest(): () => string {
    const slotIds = ["slot-1", "slot-2", "slot-3"];

    return () => slotIds.shift() ?? "unexpected-slot";
}

function buildBatteryDeviceDescriptor(): BatteryDeviceDescriptor {
    return {
        descriptorId: "logitech.bolt.slot-2",
        displayName: "MX Master 4",
        metricKey: "vendor_hid.battery_percent:logitech.bolt.slot-2",
        transport: "usbReceiver",
        receiverKind: "bolt",
        isExperimental: true,
        supportState: "experimental",
        identity: {
            evidence: {
                kind: "vendorHid",
                vendorId: 0x046D,
                productId: 0xC548,
                manufacturer: "Logitech",
                productName: "MX Master 4",
                serialNumber: undefined,
                interfaceNumber: 2,
                usagePage: 0xFF00,
                usageId: undefined,
                bindingTransport: "usbReceiver",
                receiverKind: "bolt",
                vendorUnitId: "unit-2",
                modelId: "mx-master-4",
                receiverSlot: 2,
            },
        },
    };
}
