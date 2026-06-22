import assert from "node:assert/strict";
import { test } from "vitest";
import { renderMetricFrame } from "./metric-frame";
import type { ThemeStylePaints } from "../widgets/styles/theme-style";

const framePaints: ThemeStylePaints = {
    background: "#101010",
    backgroundFill: undefined,
    surface: "rgba(255,255,255,0.08)",
};

test("metric frame wraps body with the selected key size and style", () => {
    const svg = renderMetricFrame({
        bodies: [{ svg: "<g id=\"metric-body\"></g>", muted: false }],
        themePreset: "flat",
        themePaints: framePaints,
        themeChromeOpacity: 1,
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
        bodies: [{ svg: "<g id=\"metric-body\"></g>", muted: true }],
        themePreset: "flat",
        themePaints: framePaints,
        themeChromeOpacity: 1,
        size: { width: 100, height: 100 },
    });

    assert.match(svg, /filter id="muted-widget-100-100"/);
    assert.match(svg, /<g filter="url\(#muted-widget-100-100\)"/);
    assert.match(svg, /<feColorMatrix type="saturate" values="0" \/>/);
});

test("pixel window frame clips and scales the body viewport", () => {
    const svg = renderMetricFrame({
        bodies: [
            {
                svg: "<g id=\"metric-body\"></g>",
                bodyViewport: {
                    xCoordinate: 5,
                    yCoordinate: 19,
                    width: 134,
                    height: 120,
                    body: {
                        xOffset: 7,
                        yOffset: 0,
                        renderSize: { width: 144, height: 144 },
                    },
                    clipRadius: 0,
                },
                muted: false,
            },
        ],
        themePreset: "pixel-window",
        themePaints: framePaints,
        themeChromeOpacity: 1,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, /clipPath id="pixel-window-body-viewport-0-5-19-134-120"/);
    assert.match(svg, /<rect x="5" y="19"\s+width="134" height="120"\s+rx="0" \/>/);
    assert.match(svg, /<g clip-path="url\(#pixel-window-body-viewport-0-5-19-134-120\)">/);
    assert.match(svg, /<g transform="translate\(12 19\) scale\(0\.8333\)">/);
    assert.match(svg, /metric-body/);
});

test("muted pixel window frame keeps filtering inside the viewport placement", () => {
    const svg = renderMetricFrame({
        bodies: [
            {
                svg: "<g id=\"metric-body\"></g>",
                bodyViewport: {
                    xCoordinate: 5,
                    yCoordinate: 19,
                    width: 134,
                    height: 120,
                    body: {
                        xOffset: 7,
                        yOffset: 0,
                        renderSize: { width: 144, height: 144 },
                    },
                },
                muted: true,
            },
        ],
        themePreset: "pixel-window",
        themePaints: framePaints,
        themeChromeOpacity: 1,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, /filter id="muted-widget-144-144"/);
    assert.match(svg, /<g clip-path="url\(#pixel-window-body-viewport-0-5-19-134-120\)">/);
    assert.match(svg, /<g transform="translate\(12 19\) scale\(0\.8333\)">\s*<g filter="url\(#muted-widget-144-144\)">/);
});

test("metric frame keeps viewport clip paths distinct for multiple bodies", () => {
    const svg = renderMetricFrame({
        bodies: [
            {
                svg: "<g id=\"left-body\"></g>",
                bodyViewport: {
                    xCoordinate: 0,
                    yCoordinate: 0,
                    width: 100,
                    height: 100,
                    body: {
                        xOffset: 0,
                        yOffset: 0,
                        renderSize: { width: 144, height: 144 },
                    },
                },
                muted: false,
            },
            {
                svg: "<g id=\"right-body\"></g>",
                bodyViewport: {
                    xCoordinate: 100,
                    yCoordinate: 0,
                    width: 100,
                    height: 100,
                    body: {
                        xOffset: 0,
                        yOffset: 0,
                        renderSize: { width: 144, height: 144 },
                    },
                },
                muted: false,
            },
        ],
        themePreset: "flat",
        themePaints: framePaints,
        themeChromeOpacity: 1,
        size: { width: 200, height: 100 },
    });

    assert.match(svg, /clipPath id="flat-body-viewport-0-0-0-100-100"/);
    assert.match(svg, /clipPath id="flat-body-viewport-1-100-0-100-100"/);
    assert.match(svg, /<g transform="translate\(0 0\) scale\(0\.6944\)">\s*<g id="body-0-left-body"><\/g>/);
    assert.match(svg, /<g transform="translate\(100 0\) scale\(0\.6944\)">\s*<g id="body-1-right-body"><\/g>/);
});

test("metric frame namespaces local body ids when composing multiple bodies", () => {
    const svg = renderMetricFrame({
        bodies: [
            {
                svg: `<defs><linearGradient id="metric-gradient"></linearGradient></defs><path id="metric-path" stroke="url(#metric-gradient)" filter="url(#external-filter)" />`,
                muted: false,
            },
            {
                svg: `<defs><linearGradient id="metric-gradient"></linearGradient></defs><path id="metric-path" stroke="url(#metric-gradient)" />`,
                muted: false,
            },
        ],
        themePreset: "flat",
        themePaints: framePaints,
        themeChromeOpacity: 1,
        size: { width: 200, height: 100 },
    });

    assert.match(svg, /id="body-0-metric-gradient"/);
    assert.match(svg, /id="body-0-metric-path"/);
    assert.match(svg, /stroke="url\(#body-0-metric-gradient\)"/);
    assert.match(svg, /id="body-1-metric-gradient"/);
    assert.match(svg, /id="body-1-metric-path"/);
    assert.match(svg, /stroke="url\(#body-1-metric-gradient\)"/);
    assert.match(svg, /filter="url\(#external-filter\)"/);
    assert.doesNotMatch(svg, /id="metric-gradient"/);
    assert.doesNotMatch(svg, /id="metric-path"/);
    assert.doesNotMatch(svg, /url\(#metric-gradient\)/);
});

test("metric frame applies background opacity to theme chrome without fading the body", () => {
    const svg = renderMetricFrame({
        bodies: [{ svg: "<g id=\"metric-body\"></g>", muted: false }],
        themePreset: "cupertino-glass",
        themePaints: framePaints,
        themeChromeOpacity: 0.25,
        size: { width: 144, height: 144 },
    });
    const opacityGroupMatches = svg.match(/<g opacity="0\.25">/gu) ?? [];
    const backgroundGroupStart = svg.indexOf("<g opacity=\"0.25\">");
    const backgroundGroupEnd = svg.indexOf("</g>", backgroundGroupStart);
    const bodyIndex = svg.indexOf("id=\"metric-body\"");
    const overlayGroupStart = svg.indexOf("<g opacity=\"0.25\">", bodyIndex);

    assert.equal(opacityGroupMatches.length, 2);
    assert.ok(backgroundGroupStart >= 0);
    assert.ok(backgroundGroupEnd < bodyIndex);
    assert.ok(overlayGroupStart > bodyIndex);
});

test("metric frame omits theme chrome at zero background opacity without removing the body", () => {
    const svg = renderMetricFrame({
        bodies: [{ svg: "<g id=\"metric-body\"></g>", muted: false }],
        themePreset: "cupertino-glass",
        themePaints: framePaints,
        themeChromeOpacity: 0,
        size: { width: 144, height: 144 },
    });

    assert.match(svg, /metric-body/);
    assert.doesNotMatch(svg, /frosted background/);
    assert.doesNotMatch(svg, /specular highlight overlay/);
    assert.doesNotMatch(svg, /<g opacity=/);
});
