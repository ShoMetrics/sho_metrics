import assert from "node:assert/strict";
import { test } from "vitest";
import { readStoredWidgetSettings } from "../codec";
import { writeStoredWidgetSettingsPatch } from "./widget-settings-patch";

test("widget patch adds dense metric slots with storage-owned ids", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            addSlot: {
                customLabel: "RAM",
                customMaximumValue: 100,
            },
        },
    }, {
        createSlotId: () => "slot-3",
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots.length, 3);
    assert.equal(widget.value.slots[2]?.slotId, "slot-3");
    assert.equal(widget.value.slots[2]?.customLabel, "RAM");
    assert.equal(widget.value.slots[2]?.customMaximumValue, 100);
});

test("widget patch generates a unique dense metric slot id after a collision", () => {
    const generatedSlotIds = ["slot-1", "slot-2", "slot-3"];
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            addSlot: {},
        },
    }, {
        createSlotId: () => generatedSlotIds.shift() ?? "unexpected-slot",
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots[2]?.slotId, "slot-3");
});

test("widget patch updates dense metric slot label and maximum by slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                customLabel: "GPU",
                customMaximumValue: 90,
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots[1]?.customLabel, "GPU");
    assert.equal(widget.value.slots[1]?.customMaximumValue, 90);
});

test("widget patch updates dense metric slot target by slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: {
                    domain: "network",
                    kind: "traffic",
                    direction: "download",
                    interfaceId: "Ethernet",
                },
                customLabel: undefined,
                customMaximumValue: undefined,
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots[0]?.slot?.metric?.target.case, "cpu");
    assert.equal(widget.value.slots[1]?.slot?.metric?.target.case, "network");
    const networkTarget = widget.value.slots[1]?.slot?.metric?.target;
    if (networkTarget?.case === "network") {
        assert.equal(networkTarget.value.reading.case, "traffic");
        assert.equal(networkTarget.value.reading.value?.interfaceId, "Ethernet");
    }
    assert.equal(widget.value.slots[1]?.customLabel, undefined);
    assert.equal(widget.value.slots[1]?.customMaximumValue, undefined);
});

test("widget patch writes System battery target for dense metric slots", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: {
                    domain: "system",
                },
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    const target = widget.value.slots[1]?.slot?.metric?.target;
    assert.equal(target?.case, "system");
    if (target?.case === "system") {
        assert.equal(target.value.reading.case, "battery");
        assert.equal(target.value.reading.value.peripheralIdentity, undefined);
    }
});

test("widget patch writes selected System peripheral battery identity for dense metric slots", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: {
                    domain: "system",
                    peripheralIdentity: {
                        evidence: {
                            kind: "bluetooth",
                            primaryIdentifier: {
                                kind: "platformInstanceId",
                                hash: "3".repeat(64),
                            },
                            fallbackIdentifier: undefined,
                        },
                    },
                    detectedPeripheralDisplayName: "MX Master",
                },
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    const target = widget.value.slots[1]?.slot?.metric?.target;
    assert.equal(target?.case, "system");
    if (target?.case === "system") {
        assert.equal(target.value.reading.case, "battery");
        assert.equal(target.value.reading.value.detectedPeripheralDisplayName, "MX Master");
        const identity = target.value.reading.value.peripheralIdentity;
        assert.equal(identity?.evidence.case, "bluetoothIdentity");
        if (identity?.evidence.case === "bluetoothIdentity") {
            assert.equal(identity.evidence.value.primaryIdentifier?.hash, "3".repeat(64));
        }
    }
});

test("widget patch preserves dense custom label and maximum when target patch omits them", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                {
                    slotId: "slot-2",
                    slot: { metric: { network: { traffic: { direction: "download" } } } },
                    customLabel: "DL",
                    customMaximumValue: 62_500_000,
                },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: {
                    domain: "network",
                    kind: "traffic",
                    direction: "download",
                    interfaceId: "Ethernet",
                },
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots[1]?.customLabel, "DL");
    assert.equal(widget.value.slots[1]?.customMaximumValue, 62_500_000);
    const target = widget.value.slots[1]?.slot?.metric?.target;
    assert.equal(target?.case, "network");
    if (target?.case === "network") {
        assert.equal(target.value.reading.case, "traffic");
        assert.equal(target.value.reading.value?.interfaceId, "Ethernet");
    }
});

test("widget patch writes dense disk usage volume by slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: {
                    domain: "disk",
                    kind: "usage",
                    volumeId: "E:\\",
                },
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    const target = widget.value.slots[1]?.slot?.metric?.target;
    assert.equal(target?.case, "disk");
    if (target?.case === "disk") {
        assert.equal(target.value.reading.case, "usage");
        assert.equal(target.value.reading.value?.volumeId, "E:\\");
    }
});

test("widget patch moves dense metric slots by stable slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
                { slotId: "slot-3", slot: { metric: { memory: {} } } },
            ],
        },
    }, {
        dense: {
            moveSlot: {
                slotId: "slot-3",
                direction: "up",
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.deepEqual(widget.value.slots.map((slot) => slot.slotId), ["slot-1", "slot-3", "slot-2"]);
});

test("widget patch rejects removing dense metric slots below the minimum", () => {
    assert.throws(() => writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            removeSlotId: "slot-2",
        },
    }), /minimum of 2/);
});
