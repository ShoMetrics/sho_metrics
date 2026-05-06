import assert from "node:assert/strict";
import test from "node:test";
import type { WidgetData } from "../../rendering/widget-data";
import { DEFAULT_SPARKLINE_CONFIG, sparkline } from "./sparkline";

test("sparkline fallback keeps one decimal when no metric display value is provided", () => {
    const svgFragment = sparkline.render(buildWidgetData({
        current: 1,
        history: [0, 1],
    }), DEFAULT_SPARKLINE_CONFIG, { width: 144, height: 144 });

    assert.match(svgFragment, />1\.0</);
});

test("sparkline prefers metric-specific display value over fallback formatting", () => {
    const svgFragment = sparkline.render(buildWidgetData({
        current: 1,
        displayValue: "1",
        history: [0, 1],
    }), DEFAULT_SPARKLINE_CONFIG, { width: 144, height: 144 });

    assert.match(svgFragment, />1</);
    assert.doesNotMatch(svgFragment, />1\.0</);
});

function buildWidgetData(options: Partial<WidgetData>): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "%",
        label: options.label ?? "GPU",
        displayValue: options.displayValue,
    };
}
