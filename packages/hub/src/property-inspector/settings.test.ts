import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNextSettings, normalizeSettings } from "./scenarios";
import { basePropertyInspectorSettings } from "./settings";

test("disk usage defaults to slow polling on first normalization", () => {
    const settings = normalizeSettings({ diskMetricKind: "usage" }, {
        actionKind: "disk",
        isWindows: false,
    });

    assert.equal(settings.pollingFrequencySeconds, 60);
    assert.equal(settings.diskDefaultsApplied, true);
});

test("disk throughput defaults to fast polling on first normalization", () => {
    const settings = normalizeSettings({ diskMetricKind: "throughput" }, {
        actionKind: "disk",
        isWindows: false,
    });

    assert.equal(settings.pollingFrequencySeconds, 1);
    assert.equal(settings.diskThroughputDirection, "both");
    assert.equal(settings.diskDefaultsApplied, true);
});

test("windows normalizes disk throughput back to usage", () => {
    const settings = normalizeSettings({ diskMetricKind: "throughput" }, {
        actionKind: "disk",
        isWindows: true,
    });

    assert.equal(settings.diskMetricKind, "usage");
    assert.equal(settings.pollingFrequencySeconds, 60);
});

test("net speed applies solid download color defaults once", () => {
    const settings = normalizeSettings({ networkDirection: "download" }, {
        actionKind: "net-speed",
        isWindows: false,
    });

    assert.equal(settings.colorMode, "solid");
    assert.equal(settings.solidColor, settings.downloadSolidColor);
    assert.equal(settings.netSpeedDefaultsApplied, true);
});

test("net speed defaults to dual direction", () => {
    const settings = normalizeSettings({}, {
        actionKind: "net-speed",
        isWindows: false,
    });

    assert.equal(settings.networkDirection, "both");
    assert.equal(settings.networkTrafficDisplayMode, "mirrored");
    assert.equal(settings.solidColor, settings.downloadSolidColor);
});

test("net speed normalizes overlay traffic display mode", () => {
    const settings = normalizeSettings({
        networkTrafficDisplayMode: "overlay",
    }, {
        actionKind: "net-speed",
        isWindows: false,
    });

    assert.equal(settings.networkTrafficDisplayMode, "overlay");
});

test("net speed keeps custom solid color after defaults were applied", () => {
    const settings = normalizeSettings({
        netSpeedDefaultsApplied: true,
        networkDirection: "upload",
        solidColor: "#123456",
    }, {
        actionKind: "net-speed",
        isWindows: false,
    });

    assert.equal(settings.colorMode, "solid");
    assert.equal(settings.solidColor, "#123456");
});

test("next settings keep thresholds ordered when low threshold crosses high threshold", () => {
    const settings = normalizeNextSettings({
        changedKey: "lowThreshold",
        changedValue: "90",
        state: {
            actionKind: "cpu-usage",
            isWindows: false,
            settings: {
                ...basePropertyInspectorSettings,
                lowThreshold: 30,
                highThreshold: 70,
            },
        },
    });

    assert.equal(settings.lowThreshold, 90);
    assert.equal(settings.highThreshold, 90);
});

test("next net speed direction switches solid color only when the old color was default", () => {
    const settings = normalizeNextSettings({
        changedKey: "networkDirection",
        changedValue: "upload",
        state: {
            actionKind: "net-speed",
            isWindows: false,
            settings: {
                ...basePropertyInspectorSettings,
                colorMode: "solid",
                networkDirection: "download",
                solidColor: basePropertyInspectorSettings.downloadSolidColor,
                netSpeedDefaultsApplied: true,
            },
        },
    });

    assert.equal(settings.solidColor, basePropertyInspectorSettings.uploadSolidColor);
});

test("next net speed direction preserves custom solid color", () => {
    const settings = normalizeNextSettings({
        changedKey: "networkDirection",
        changedValue: "upload",
        state: {
            actionKind: "net-speed",
            isWindows: false,
            settings: {
                ...basePropertyInspectorSettings,
                colorMode: "solid",
                networkDirection: "download",
                solidColor: "#123456",
                netSpeedDefaultsApplied: true,
            },
        },
    });

    assert.equal(settings.solidColor, "#123456");
});
