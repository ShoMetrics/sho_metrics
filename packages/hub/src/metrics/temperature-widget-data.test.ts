import assert from "node:assert/strict";
import { test } from "vitest";
import { buildTemperatureWidgetData } from "./temperature-widget-data";

test("temperature widget data formats Fahrenheit display from Celsius samples", () => {
    const celsiusWidgetData = {
        current: 50,
        progress: 0.5,
        history: [25, 50],
        unit: "C",
        label: "GPU",
    };

    const widgetData = buildTemperatureWidgetData({
        celsiusWidgetData,
        maximumCelsius: 100,
        unit: "fahrenheit",
    });

    assert.equal(widgetData.displayValue, "122");
    assert.equal(widgetData.secondaryDisplayValue, "max: 212 °F");
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 100,
    });
});
