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
            xCoordinate: 8,
            yCoordinate: 26,
            width: 128,
            height: 110,
            clipRadius: 0,
        },
        themePreset: "pixel-window",
        muted: false,
        paints: framePaints,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, /clipPath id="pixel-window-body-viewport-128-110"/);
    assert.match(svg, /<rect x="8" y="26"\s+width="128" height="110"\s+rx="0" \/>/);
    assert.match(svg, /<g clip-path="url\(#pixel-window-body-viewport-128-110\)">/);
    assert.match(svg, /<g transform="translate\(8 26\)">/);
    assert.match(svg, /metric-body/);
    assert.doesNotMatch(svg, /scale\(/);
});

test("muted pixel window frame keeps filtering inside the viewport placement", () => {
    const svg = renderMetricFrame({
        body: "<g id=\"metric-body\"></g>",
        bodyViewport: {
            xCoordinate: 8,
            yCoordinate: 26,
            width: 128,
            height: 110,
        },
        themePreset: "pixel-window",
        muted: true,
        paints: framePaints,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, /filter id="muted-widget-144-144"/);
    assert.match(svg, /<g clip-path="url\(#pixel-window-body-viewport-128-110\)">/);
    assert.match(svg, /<g transform="translate\(8 26\)">\s*<g filter="url\(#muted-widget-144-144\)">/);
});
