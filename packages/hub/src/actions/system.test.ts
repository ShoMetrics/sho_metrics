import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import { SYSTEM_BATTERY_PERCENT_METRIC_KEY } from "../runtime/metric-keys";
import {
    buildBatteryDeviceDescriptorIdFromIdentity,
    buildBatteryMetricKeyFromIdentity,
} from "../runtime/sources/battery/battery-metric-key";
import type {
    ResolvedSystemMetricTarget,
    ResolvedSystemPeripheralIdentity,
} from "../settings/resolved-settings";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import {
    buildSystemViewOptions,
    resolveSystemMetricKeys,
} from "./system/view-builder";
import type { WidgetData } from "../view-rendering/widget-data";

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
        ...firstIdentity,
        vendorUnitId: "unit-3",
        receiverSlot: 3,
    };

    assert.notDeepEqual(
        resolveSystemMetricKeys(buildSystemTarget(firstIdentity)),
        resolveSystemMetricKeys(buildSystemTarget(secondIdentity)),
    );
});

test("System peripheral battery metric keys ignore route-local identity fields", () => {
    const receiverIdentity = buildPeripheralIdentity();
    const bluetoothIdentity: ResolvedSystemPeripheralIdentity = {
        ...receiverIdentity,
        productId: 0xBEEF,
        productName: "MX Master 4 Bluetooth",
        interfaceNumber: undefined,
        usagePage: undefined,
        usageId: undefined,
        bindingTransport: "bluetooth",
        receiverKind: undefined,
        receiverSlot: undefined,
    };

    assert.equal(
        buildBatteryMetricKeyFromIdentity(receiverIdentity),
        buildBatteryMetricKeyFromIdentity(bluetoothIdentity),
    );
});

test("System peripheral battery descriptor ids keep private identity fields out of the key", () => {
    const longIdentity: ResolvedSystemPeripheralIdentity = {
        ...buildPeripheralIdentity(),
        serialNumber: "s".repeat(512),
        vendorUnitId: "u".repeat(512),
        modelId: "m".repeat(256),
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
    assert.equal(read.calls[0]?.label, "BATT");
    assert.equal(read.calls[0]?.unit, "%");
    assert.equal(read.calls[0]?.maxValue, 100);
    assert.equal(viewOptions.widgetData.sampleTimestampMilliseconds, undefined);
    assert.equal(viewOptions.noticeText, undefined);
});

function buildSystemTarget(
    peripheralIdentity: ResolvedSystemPeripheralIdentity | undefined,
): ResolvedSystemMetricTarget {
    return {
        domain: "system",
        reading: {
            kind: "batteryPercent",
            peripheralIdentity,
            detectedPeripheralDisplayName: peripheralIdentity === undefined
                ? undefined
                : "MX Master 4",
        },
    };
}

function buildPeripheralIdentity(): ResolvedSystemPeripheralIdentity {
    return {
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
    };
}

function buildMetricReader(): {
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
    const widgetData = buildWidgetData();

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

function buildWidgetData(): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        unit: "%",
        label: "BATT",
        sampleTimestampMilliseconds: undefined,
    };
}
