import assert from "node:assert/strict";
import test from "node:test";
import { renderMetricFrame } from "./metric-frame";
import type { ThemeStylePaints } from "../widgets/styles/theme-style";

const framePaints: ThemeStylePaints = {
    background: "#101010",
    backgroundFill: undefined,
    surface: "rgba(255,255,255,0.08)",
};

test("metric frame wraps body with the selected key size and style", () => {
    const svg = renderMetricFrame({
        body: "<g id=\"metric-body\"></g>",
        themePreset: "flat",
        muted: false,
        paints: framePaints,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /width="144" height="144"/);
    assert.match(svg, /viewBox="0 0 144 144"/);
    assert.match(svg, /fill="#101010"/);
    assert.match(svg, /metric-body/);
});

test("metric frame applies the muted filter around the body", () => {
    const svg = renderMetricFrame({
        body: "<g id=\"metric-body\"></g>",
        themePreset: "flat",
        muted: true,
        paints: framePaints,
        size: { width: 100, height: 100 },
    });

    assert.match(svg, /filter id="muted-widget-100-100"/);
    assert.match(svg, /<g filter="url\(#muted-widget-100-100\)"/);
    assert.match(svg, /<feColorMatrix type="saturate" values="0" \/>/);
});

test("pixel window frame clips and translates the body viewport without scaling", () => {
    const svg = renderMetricFrame({
        body: "<g id=\"metric-body\"></g>",
        bodyViewport: {
            xCoordinate: 5,
            yCoordinate: 19,
            width: 134,
            height: 120,
            body: {
                xOffset: 7,
                yOffset: 0,
                renderSize: { width: 120, height: 120 },
            },
            clipRadius: 0,
        },
        themePreset: "pixel-window",
        muted: false,
        paints: framePaints,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, /clipPath id="pixel-window-body-viewport-134-120"/);
    assert.match(svg, /<rect x="5" y="19"\s+width="134" height="120"\s+rx="0" \/>/);
    assert.match(svg, /<g clip-path="url\(#pixel-window-body-viewport-134-120\)">/);
    assert.match(svg, /<g transform="translate\(12 19\)">/);
    assert.match(svg, /metric-body/);
    assert.doesNotMatch(svg, /scale\(/);
});

test("muted pixel window frame keeps filtering inside the viewport placement", () => {
    const svg = renderMetricFrame({
        body: "<g id=\"metric-body\"></g>",
        bodyViewport: {
            xCoordinate: 5,
            yCoordinate: 19,
            width: 134,
            height: 120,
            body: {
                xOffset: 7,
                yOffset: 0,
                renderSize: { width: 120, height: 120 },
            },
        },
        themePreset: "pixel-window",
        muted: true,
        paints: framePaints,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, /filter id="muted-widget-144-144"/);
    assert.match(svg, /<g clip-path="url\(#pixel-window-body-viewport-134-120\)">/);
    assert.match(svg, /<g transform="translate\(12 19\)">\s*<g filter="url\(#muted-widget-144-144\)">/);
});
