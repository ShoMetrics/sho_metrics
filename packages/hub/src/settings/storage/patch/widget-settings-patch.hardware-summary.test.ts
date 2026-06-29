import assert from "node:assert/strict";
import { test } from "vitest";
import { TemperatureUnit as StoredTemperatureUnit } from "../../../generated/proto/shometrics/v1/settings_pb";
import { resolveQuickStartStoredWidgetSettings } from "../quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "./widget-settings-patch";
import { readHardwareSummaryWidget, readSingleMetricSlot } from "./testing/widget-settings-patch-test-helpers";

test("widget patch switches CPU single metric to hardware summary", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        hardwareSummary: {
            switchTo: {
                widgetKind: "hardwareSummary",
                domain: "cpu",
            },
        },
    });

    const widget = readHardwareSummaryWidget(nextSettings);
    assert.equal(widget.target.case, "cpu");
    if (widget.target.case === "cpu") {
        assert.deepEqual(widget.target.value.orderedReadings.map((reading) => reading.reading.case), [
            "usage",
            "temperature",
            "power",
        ]);
    }
});

test("widget patch switches GPU single metric to hardware summary defaults", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        hardwareSummary: {
            switchTo: {
                widgetKind: "hardwareSummary",
                domain: "gpu",
            },
        },
    });

    const widget = readHardwareSummaryWidget(nextSettings);
    assert.equal(widget.target.case, "gpu");
    if (widget.target.case === "gpu") {
        assert.deepEqual(widget.target.value.orderedReadings.map((reading) => reading.reading.case), [
            "usage",
            "temperature",
            "vram",
        ]);
    }
});

test("widget patch writes GPU hardware summary reading order", () => {
    const summarySettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings,
        {
            hardwareSummary: {
                switchTo: {
                    widgetKind: "hardwareSummary",
                    domain: "gpu",
                },
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(summarySettings, {
        hardwareSummary: {
            orderedReadings: [
                { kind: "temperature", maximumCelsius: 95, unit: "fahrenheit" },
                { kind: "usage" },
                { kind: "power", maximumWatts: 320 },
            ],
        },
    });

    const widget = readHardwareSummaryWidget(nextSettings);
    assert.equal(widget.target.case, "gpu");
    if (widget.target.case === "gpu") {
        const readings = widget.target.value.orderedReadings;
        assert.deepEqual(readings.map((reading) => reading.reading.case), ["temperature", "usage", "power"]);
        assert.equal(readings[0]?.reading.case, "temperature");
        if (readings[0]?.reading.case === "temperature") {
            assert.equal(readings[0].reading.value.temperatureUnit, StoredTemperatureUnit.FAHRENHEIT);
            assert.equal(readings[0].reading.value.maximumTemperatureCelsius, 95);
        }
        assert.equal(readings[2]?.reading.case, "power");
        if (readings[2]?.reading.case === "power") {
            assert.equal(readings[2].reading.value.maximumPowerWatts, 320);
        }
    }
});

test("widget patch rejects VRAM in CPU hardware summary reading order", () => {
    const summarySettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings,
        {
            hardwareSummary: {
                switchTo: {
                    widgetKind: "hardwareSummary",
                    domain: "cpu",
                },
            },
        },
    );

    assert.throws(() => writeStoredWidgetSettingsPatch(summarySettings, {
        hardwareSummary: {
            orderedReadings: [
                { kind: "usage" },
                { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
                { kind: "vram" },
            ],
        },
    }), /CPU hardware summary cannot use VRAM/);
});

test("widget patch writes selected CPU hardware summary reading settings", () => {
    const summarySettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings,
        {
            hardwareSummary: {
                switchTo: {
                    widgetKind: "hardwareSummary",
                    domain: "cpu",
                },
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(summarySettings, {
        hardwareSummary: {
            cpu: {
                temperatureUnit: "fahrenheit",
                maximumTemperatureCelsius: 92,
                maximumPowerWatts: 210,
            },
        },
    });

    const widget = readHardwareSummaryWidget(nextSettings);
    assert.equal(widget.target.case, "cpu");
    if (widget.target.case === "cpu") {
        const readings = widget.target.value.orderedReadings;
        assert.equal(readings[1]?.reading.case, "temperature");
        assert.equal(readings[1]?.reading.value?.temperatureUnit, StoredTemperatureUnit.FAHRENHEIT);
        assert.equal(readings[1]?.reading.value?.maximumTemperatureCelsius, 92);
        assert.equal(readings[2]?.reading.case, "power");
        assert.equal(readings[2]?.reading.value?.maximumPowerWatts, 210);
    }
});

test("widget patch preserves hardware summary selected reading settings when switching to single metric", () => {
    const summarySettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings,
        {
            hardwareSummary: {
                switchTo: {
                    widgetKind: "hardwareSummary",
                    domain: "cpu",
                },
                orderedReadings: [
                    { kind: "temperature", maximumCelsius: 92, unit: "fahrenheit" },
                    { kind: "usage" },
                    { kind: "power", maximumWatts: 210 },
                ],
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(summarySettings, {
        hardwareSummary: {
            switchTo: {
                widgetKind: "singleMetric",
                domain: "cpu",
                kind: "power",
            },
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "cpu");
    if (target?.case === "cpu") {
        assert.equal(target.value.reading.case, "power");
        if (target.value.reading.case === "power") {
            assert.equal(target.value.reading.value.maximumPowerWatts, 210);
        }
    }
});
