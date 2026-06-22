import assert from "node:assert/strict";
import { test } from "vitest";
import { buildWidgetDataFixture } from "../../tests/testing/widget-data-fixtures";
import { buildPowerWidgetData } from "./power-widget-data";

test("power widget data converts watts to percentage progress and fixed scale", () => {
    const widgetData = buildPowerWidgetData({
        powerWidgetData: buildWidgetDataFixture({
            current: 45.6,
            history: [0, 22.8, 45.6],
            unit: "W",
            label: "GPU",
        }),
        maximumPowerWatts: 91.2,
    });

    assert.equal(widgetData.current, 50);
    assert.equal(widgetData.progress, 0.5);
    assert.deepEqual(widgetData.history, [0, 25, 50]);
    assert.equal(widgetData.displayValue, "46");
    assert.equal(widgetData.secondaryDisplayValue, "46/91 W");
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 100,
    });
});

test("power widget data clamps negative watt samples and unsafe maximums", () => {
    const widgetData = buildPowerWidgetData({
        powerWidgetData: buildWidgetDataFixture({
            current: -5,
            history: [-5, 5],
            unit: "W",
            label: "GPU",
        }),
        maximumPowerWatts: 0,
    });

    assert.equal(widgetData.current, 0);
    assert.equal(widgetData.progress, 0);
    assert.deepEqual(widgetData.history, [0, 500]);
    assert.equal(widgetData.displayValue, "0");
    assert.equal(widgetData.secondaryDisplayValue, "0/1 W");
});
