import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveMetricCustomLabelDisplayMaximumCharacters } from "./metric-custom-label-policy";
import type { ResolvedAppearanceViewSettings } from "./resolved-settings";

test("metric custom label policy uses measured Pixel Window caps", () => {
    assert.equal(resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings: createViewSettings({
            selectedView: "circle",
            circleVariant: "full-ring",
        }),
        keyShape: "square",
        selectedTheme: "pixel-window",
    }), 4);
    assert.equal(resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings: createViewSettings({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        keyShape: "square",
        selectedTheme: "pixel-window",
    }), 5);
    assert.equal(resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings: createViewSettings({
            selectedView: "text",
            textVariant: "centered",
        }),
        keyShape: "square",
        selectedTheme: "pixel-window",
    }), 8);
    assert.equal(resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings: createViewSettings({
            selectedView: "text",
            textVariant: "centered",
        }),
        keyShape: "touchStrip",
        selectedTheme: "pixel-window",
    }), 9);
    assert.equal(resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings: createViewSettings({
            selectedView: "text",
            textVariant: "title-card",
        }),
        keyShape: "square",
        selectedTheme: "pixel-window",
    }), 8);
    assert.equal(resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings: createViewSettings({
            selectedView: "bar",
        }),
        keyShape: "touchStrip",
        selectedTheme: "pixel-window",
    }), 18);
});

function createViewSettings(
    viewSettings: Partial<ResolvedAppearanceViewSettings>,
): ResolvedAppearanceViewSettings {
    return {
        selectedView: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
        ...viewSettings,
    };
}
