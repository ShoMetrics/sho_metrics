import assert from "node:assert/strict";
import { test } from "vitest";
import type { RenderPaintTokens } from "../color/render-appearance";
import { resolveDualTitleCardStaticTextColor, resolveTitleCardStaticTextColor } from "./title-card-paint";

test("title-card static text uses the solid metric paint", () => {
    const staticTextColor = resolveTitleCardStaticTextColor({
        ...buildRenderPaintTokens(),
        metricValueText: "#metric-value-text-token",
        primaryMetric: {
            mode: "solid",
            solidColor: "#25e84a",
            thresholds: [],
            isGradientEnabled: false,
        },
    });

    assert.equal(staticTextColor, "#25e84a");
});

test("title-card static text keeps neutral paint for threshold metrics", () => {
    const staticTextColor = resolveTitleCardStaticTextColor({
        ...buildRenderPaintTokens(),
        metricValueText: "#metric-value-text-token",
        primaryMetric: {
            mode: "threshold",
            solidColor: "#25e84a",
            thresholds: [
                { min: 0, max: 50, color: "#25e84a" },
                { min: 50, max: 100, color: "#ffb000" },
            ],
            isGradientEnabled: false,
        },
    });

    assert.equal(staticTextColor, "#metric-value-text-token");
});

test("dual title-card static text keeps neutral paint", () => {
    const staticTextColor = resolveDualTitleCardStaticTextColor({
        ...buildRenderPaintTokens(),
        metricValueText: "#metric-value-text-token",
        primaryMetric: {
            mode: "solid",
            solidColor: "#25e84a",
            thresholds: [],
            isGradientEnabled: false,
        },
    });

    assert.equal(staticTextColor, "#metric-value-text-token");
});

function buildRenderPaintTokens(): RenderPaintTokens {
    return {
        background: "#background-token",
        backgroundFill: undefined,
        surface: "#surface-token",
        primaryText: "#primary-text-token",
        secondaryText: "#secondary-text-token",
        mutedText: "#muted-text-token",
        icon: "#icon-token",
        barTitleText: "#bar-title-text-token",
        metricValueText: "#metric-value-text-token",
        barValueText: "#bar-value-text-token",
        barUnitText: "#bar-unit-text-token",
        barSecondaryText: "#bar-secondary-text-token",
        primaryMetric: {
            mode: "solid",
            solidColor: "#metric-token",
            thresholds: [],
            isGradientEnabled: false,
        },
        track: "#track-token",
        grid: "#grid-token",
        divider: "#divider-token",
    };
}
