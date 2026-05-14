import assert from "node:assert/strict";
import test from "node:test";
import { renderMetricFrame } from "./metric-frame";
import type { GraphicStylePaints } from "../widgets/styles/style.interface";

const framePaints: GraphicStylePaints = {
    background: "#101010",
    surface: "rgba(255,255,255,0.08)",
};

test("metric frame wraps body with the selected key size and style", () => {
    const svg = renderMetricFrame({
        body: "<g id=\"metric-body\"></g>",
        graphicStyle: "flat",
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
        graphicStyle: "flat",
        muted: true,
        paints: framePaints,
        size: { width: 100, height: 100 },
    });

    assert.match(svg, /filter id="muted-widget-100-100"/);
    assert.match(svg, /<g filter="url\(#muted-widget-100-100\)"/);
    assert.match(svg, /<feColorMatrix type="saturate" values="0" \/>/);
});
