import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../color-compensation/types";
import { wrapSvgWithColorCompensationFilter } from "./color-compensation-filter";

const simpleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><defs></defs><rect width="144" height="144" fill="#fff" /></svg>`;

test("default profile leaves SVG unchanged", () => {
    assert.equal(wrapSvgWithColorCompensationFilter(simpleSvg, DEFAULT_COLOR_COMPENSATION_PROFILE), simpleSvg);
});

test("active profile injects a root color compensation filter", () => {
    const svg = wrapSvgWithColorCompensationFilter(simpleSvg, {
        brightnessAdjustment: 1,
        shadowAdjustment: 0,
        gammaAdjustment: 0,
        saturationAdjustment: 0,
    });

    assert.match(svg, /filter id="runtime-color-compensation"/);
    assert.match(svg, /<g filter="url\(#runtime-color-compensation\)">/);
    assert.match(svg, /<rect width="144" height="144" fill="#fff" \/><\/g><\/svg>$/);
});
