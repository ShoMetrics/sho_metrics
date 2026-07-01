import assert from "node:assert/strict";
import { test } from "vitest";
import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import {
    SYSTEM_BATTERY_PERCENT_METRIC_KEY,
    buildBluetoothBatteryPercentMetricKey,
} from "../runtime/metric-keys";
import {
    buildBatteryDeviceDescriptorIdFromIdentity,
    buildBatteryMetricKeyFromIdentity,
} from "../runtime/sources/battery/battery-metric-key";
import type {
    CircleViewVariant,
    MetricTheme,
    MetricView,
    ResolvedSystemMetricTarget,
    ResolvedSystemPeripheralIdentity,
    ResolvedSystemVendorHidPeripheralIdentity,
    ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import {
    buildSystemViewOptions,
    resolveSystemMetricKeys,
} from "./system/view-builder";
import { getMetricIconFragment } from "../widgets/icons/metric-icons";
import type { WidgetData } from "../view-rendering/widget-data";
import {
    resolveBatteryDeviceCachePatchForPropertyInspector,
} from "../runtime/sources/battery/battery-device-cache-patch";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { getHardwareIconFragment } from "../widgets/icons/hardware-icons";

test("System action subscribes to the selected battery metric", () => {
    assert.deepEqual(
        resolveSystemMetricKeys(buildSystemTarget(undefined)),
        [SYSTEM_BATTERY_PERCENT_METRIC_KEY],
    );
    assert.deepEqual(
        resolveSystemMetricKeys(buildSystemTarget(buildPeripheralIdentity())),
        [buildBatteryMetricKeyFromIdentity(buildPeripheralIdentity())],
    );
});

test("System action keeps selected peripheral battery metric keys distinct", () => {
    const firstIdentity = buildPeripheralIdentity();
    const secondIdentity: ResolvedSystemPeripheralIdentity = {
        evidence: {
            ...(firstIdentity.evidence as ResolvedSystemVendorHidPeripheralIdentity),
            vendorUnitId: "unit-3",
            receiverSlot: 3,
        },
    };

    assert.notDeepEqual(
        resolveSystemMetricKeys(buildSystemTarget(firstIdentity)),
        resolveSystemMetricKeys(buildSystemTarget(secondIdentity)),
    );
});

test("System battery metric keys separate Bluetooth from vendor HID peripherals", () => {
    const receiverIdentity = buildPeripheralIdentity();
    const bluetoothPrimaryIdentifierHash = "a".repeat(64);
    const bluetoothIdentity: ResolvedSystemPeripheralIdentity = {
        evidence: {
            kind: "bluetooth",
            primaryIdentifier: {
                kind: "platformInstanceId",
                hash: bluetoothPrimaryIdentifierHash,
            },
            fallbackIdentifier: undefined,
        },
    };

    assert.equal(
        resolveSystemMetricKeys(buildSystemTarget(receiverIdentity))[0],
        buildBatteryMetricKeyFromIdentity(receiverIdentity),
    );
    assert.equal(
        resolveSystemMetricKeys(buildSystemTarget(bluetoothIdentity))[0],
        buildBluetoothBatteryPercentMetricKey(`device-${bluetoothPrimaryIdentifierHash}`),
    );
});

test("System battery metric keys degrade malformed Bluetooth evidence to unmatched Bluetooth keys", () => {
    const missingPrimaryIdentifierIdentity: ResolvedSystemPeripheralIdentity = {
        evidence: {
            kind: "bluetooth",
            primaryIdentifier: undefined,
            fallbackIdentifier: undefined,
        },
    };

    assert.equal(
        resolveSystemMetricKeys(buildSystemTarget(missingPrimaryIdentifierIdentity))[0],
        buildBluetoothBatteryPercentMetricKey("missing-primary-identifier"),
    );
});

test("System peripheral battery descriptor ids keep private identity fields out of the key", () => {
    const longIdentity: ResolvedSystemPeripheralIdentity = {
        evidence: {
            ...(buildPeripheralIdentity().evidence as ResolvedSystemVendorHidPeripheralIdentity),
            serialNumber: "s".repeat(512),
            vendorUnitId: "u".repeat(512),
            modelId: "m".repeat(256),
        },
    };

    const descriptorId = buildBatteryDeviceDescriptorIdFromIdentity(longIdentity);

    assert.match(
        descriptorId,
        /^vendor_unit\.vendor_id-046d\.identity-[a-f0-9]{16}$/u,
    );
    assert.doesNotMatch(descriptorId, /s{16}|u{16}|m{16}/u);
});

test("System view renders built-in battery no-data safely", () => {
    const read = buildMetricReader();
    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
        target: buildSystemTarget(undefined),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.metricKey, SYSTEM_BATTERY_PERCENT_METRIC_KEY);
    assert.equal(read.calls[0]?.label, "BATT");
    assert.equal(read.calls[0]?.unit, "%");
    assert.equal(read.calls[0]?.maxValue, 100);
    assert.equal(viewOptions.widgetData.sampleTimestampMilliseconds, undefined);
    assert.equal(viewOptions.noticeText, undefined);
});

test("System view renders selected peripheral battery no-data safely", () => {
    const read = buildMetricReader();
    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
        target: buildSystemTarget(buildPeripheralIdentity()),
        metrics: read.metrics,
    });

    assert.equal(
        read.calls[0]?.metricKey,
        buildBatteryMetricKeyFromIdentity(buildPeripheralIdentity()),
    );
    assert.equal(read.calls[0]?.label, "MX Maste");
    assert.equal(read.calls[0]?.unit, "%");
    assert.equal(read.calls[0]?.maxValue, 100);
    assert.equal(viewOptions.widgetData.sampleTimestampMilliseconds, undefined);
    assert.equal(viewOptions.noticeText, undefined);
});

test("System battery circle view passes the stored custom label to the renderer", () => {
    const read = buildMetricReader();
    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
        target: buildSystemTarget(undefined, "Mouse"),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.label, "Mouse");
    assert.equal(viewOptions.widgetData.titleCardCaptionText, "電池量");
});

test("System battery view exposes integer percentage display values", () => {
    const read = buildMetricReader({
        current: 39,
        progress: 0.39,
        sampleTimestampMilliseconds: 10_000,
    });
    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
        target: buildSystemTarget(undefined),
        metrics: read.metrics,
    });

    assert.equal(viewOptions.widgetData.displayValue, "39");
    assert.deepEqual(viewOptions.widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 100,
    });
});

test("System battery view selects the default icon from the battery percentage", () => {
    const cases = [
        { current: 0, expectedIcon: "battery-empty" },
        { current: 39, expectedIcon: "battery-medium" },
        { current: 100, expectedIcon: "battery-full" },
    ] as const;

    for (const testCase of cases) {
        const read = buildMetricReader({
            current: testCase.current,
            progress: testCase.current / 100,
            sampleTimestampMilliseconds: 10_000,
        });

        const viewOptions = buildSystemViewOptions({
            event: buildWillAppearEvent(),
            settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
            target: buildSystemTarget(undefined),
            metrics: read.metrics,
        });

        assert.equal(viewOptions.centerIconFragment, getHardwareIconFragment(testCase.expectedIcon));
    }
});

test("System battery view uses the generic battery icon when no battery sample exists", () => {
    const read = buildMetricReader({
        current: 0,
        progress: 0,
        sampleTimestampMilliseconds: undefined,
    });

    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
        target: buildSystemTarget(undefined),
        metrics: read.metrics,
    });

    assert.equal(viewOptions.widgetData.sampleTimestampMilliseconds, undefined);
    assert.equal(viewOptions.centerIconFragment, getHardwareIconFragment("battery"));
});

test("System battery circle view preserves eight-character custom labels", () => {
    const read = buildMetricReader();
    buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
        target: buildSystemTarget(undefined, "ROG AZOT"),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.label, "ROG AZOT");
});

test("System battery circle view caps long stored custom labels for display", () => {
    const read = buildMetricReader();
    buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
        target: buildSystemTarget(undefined, "12345678901234567890"),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.label, "12345678");
});

test("System battery full-ring circle view caps Pixel Window custom labels to the measured safe length", () => {
    const read = buildMetricReader();
    buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: withSelectedTheme(resolveInitialActionSettings(undefined, "system").resolvedSettings, "pixel-window"),
        target: buildSystemTarget(undefined, "123456"),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.label, "1234");
});

test("System battery gauge circle view keeps the measured Pixel Window label headroom", () => {
    const read = buildMetricReader();
    buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: withCircleVariant(
            withSelectedTheme(resolveInitialActionSettings(undefined, "system").resolvedSettings, "pixel-window"),
            "gauge",
        ),
        target: buildSystemTarget(undefined, "123456"),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.label, "12345");
});

test("System battery bar view defaults to the readable title label", () => {
    const read = buildMetricReader();
    buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: withSelectedView(resolveInitialActionSettings(undefined, "system").resolvedSettings, "bar"),
        target: buildSystemTarget(undefined),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.label, "Battery");
});

test("System battery bar view renders custom label as secondary text", () => {
    const read = buildMetricReader();
    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: withSelectedView(resolveInitialActionSettings(undefined, "system").resolvedSettings, "bar"),
        target: buildSystemTarget(undefined, "MX Mouse"),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.label, "Battery");
    assert.equal(viewOptions.widgetData.barLabel, "Battery");
    assert.equal(viewOptions.widgetData.secondaryDisplayValue, "MX Mouse");
});

test("System battery bar view caps Pixel Window custom labels conservatively", () => {
    const read = buildMetricReader();
    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: withSelectedTheme(
            withSelectedView(resolveInitialActionSettings(undefined, "system").resolvedSettings, "bar"),
            "pixel-window",
        ),
        target: buildSystemTarget(undefined, "123456789012"),
        metrics: read.metrics,
    });

    assert.equal(viewOptions.widgetData.secondaryDisplayValue, "1234567890");
});

test("System battery bar view renders selected peripheral name as secondary text", () => {
    const read = buildMetricReader();
    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: withSelectedView(resolveInitialActionSettings(undefined, "system").resolvedSettings, "bar"),
        target: buildSystemTarget(buildPeripheralIdentity()),
        metrics: read.metrics,
    });

    assert.equal(read.calls[0]?.label, "Battery");
    assert.equal(viewOptions.widgetData.barLabel, "Battery");
    assert.equal(viewOptions.widgetData.secondaryDisplayValue, "MX Master 4");
});

test("System battery view can use a custom center icon", () => {
    const read = buildMetricReader();
    const viewOptions = buildSystemViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "system").resolvedSettings,
        target: buildSystemTarget(undefined, undefined, "cloud-sun"),
        metrics: read.metrics,
    });

    assert.equal(viewOptions.centerIconFragment, getMetricIconFragment("cloud-sun"));
});

test("System PI cache publish keeps selected peripheral pending while the battery device cache is initially empty", () => {
    const patch = resolveBatteryDeviceCachePatchForPropertyInspector(
        {
            availableBatteryDevices: [],
            batteryDeviceDiscoveryDiagnostics: undefined,
            runtimeMaximumDownloadSpeedMbps: 123,
        },
        buildPeripheralIdentity(),
    );

    assert.equal(Object.hasOwn(patch, "availableBatteryDevices"), false);
    assert.equal(Object.hasOwn(patch, "batteryDeviceDiscoveryDiagnostics"), false);
    assert.equal(patch.runtimeMaximumDownloadSpeedMbps, 123);
});

test("System PI cache publish keeps completed empty battery device refreshes", () => {
    const completedPatch: WidgetRuntimeCachePatch = {
        availableBatteryDevices: [],
        batteryDeviceDiscoveryDiagnostics: {
            detectedCandidateCount: 0,
            displayedDescriptorCount: 0,
            hiddenCandidates: [],
        },
    };

    assert.equal(
        resolveBatteryDeviceCachePatchForPropertyInspector(completedPatch, buildPeripheralIdentity()),
        completedPatch,
    );
    assert.equal(
        resolveBatteryDeviceCachePatchForPropertyInspector({ availableBatteryDevices: [] }, undefined)
            .availableBatteryDevices?.length,
        0,
    );
});

function buildSystemTarget(
    peripheralIdentity: ResolvedSystemPeripheralIdentity | undefined,
    customLabel: string | undefined = undefined,
    customIconId: string | undefined = undefined,
): ResolvedSystemMetricTarget {
    return {
        domain: "system",
        reading: {
            kind: "batteryPercent",
            peripheralIdentity,
            detectedPeripheralDisplayName: peripheralIdentity === undefined
                ? undefined
                : "MX Master 4",
            customLabel,
            customIconId,
        },
    };
}

function withSelectedView(
    settings: ResolvedWidgetSettings,
    selectedView: MetricView,
): ResolvedWidgetSettings {
    if (settings.widget.widgetKind !== "singleMetric") {
        throw new Error("System action tests expect single metric settings.");
    }

    return {
        ...settings,
        widget: {
            ...settings.widget,
            slot: {
                ...settings.widget.slot,
                appearance: {
                    ...settings.widget.slot.appearance,
                    view: {
                        ...settings.widget.slot.appearance.view,
                        selectedView,
                    },
                },
            },
        },
    };
}

function withSelectedTheme(
    settings: ResolvedWidgetSettings,
    selectedTheme: MetricTheme,
): ResolvedWidgetSettings {
    if (settings.widget.widgetKind !== "singleMetric") {
        throw new Error("System action tests expect single metric settings.");
    }

    return {
        ...settings,
        widget: {
            ...settings.widget,
            slot: {
                ...settings.widget.slot,
                appearance: {
                    ...settings.widget.slot.appearance,
                    theme: {
                        ...settings.widget.slot.appearance.theme,
                        selectedTheme,
                    },
                },
            },
        },
    };
}

function withCircleVariant(
    settings: ResolvedWidgetSettings,
    circleVariant: CircleViewVariant,
): ResolvedWidgetSettings {
    if (settings.widget.widgetKind !== "singleMetric") {
        throw new Error("System action tests expect single metric settings.");
    }

    return {
        ...settings,
        widget: {
            ...settings.widget,
            slot: {
                ...settings.widget.slot,
                appearance: {
                    ...settings.widget.slot.appearance,
                    view: {
                        ...settings.widget.slot.appearance.view,
                        circleVariant,
                    },
                },
            },
        },
    };
}

function buildPeripheralIdentity(): ResolvedSystemPeripheralIdentity {
    return {
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
    };
}

function buildMetricReader(widgetDataOptions: Partial<WidgetData> = {}): {
    readonly calls: Array<{
        readonly metricKey: string;
        readonly label: string;
        readonly unit: string;
        readonly maxValue: number | undefined;
    }>;
    readonly metrics: MetricStoreReader;
} {
    const calls: Array<{
        readonly metricKey: string;
        readonly label: string;
        readonly unit: string;
        readonly maxValue: number | undefined;
    }> = [];
    const widgetData = buildWidgetData(widgetDataOptions);

    return {
        calls,
        metrics: {
            getWidgetData: (metricKey, label, unit, maxValue) => {
                calls.push({ metricKey, label, unit, maxValue });
                return widgetData;
            },
            getWidgetDataReadResult: (): MetricWidgetDataReadResult => ({
                widgetData,
                selectedSourceId: undefined,
            }),
            getTextValue: () => undefined,
        },
    };
}

function buildWillAppearEvent(): WillAppearEvent {
    return { action: { id: "system-test-action", isDial: () => false } } as unknown as WillAppearEvent;
}

function buildWidgetData(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "%",
        label: options.label ?? "BATT",
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}
