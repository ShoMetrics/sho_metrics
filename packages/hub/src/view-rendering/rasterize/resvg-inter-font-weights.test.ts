import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { RenderFontWeight, STATIC_INTER_FONT_FILE_NAMES } from "./render-font-weight";

/**
 * Guards the defect that motivated bundling static Inter faces: resvg-js 2.6.2
 * cannot drive a variable font's weight axis, so every weight rendered the same
 * glyphs.
 *
 * The other two guards are static. `STATIC_INTER_FONT_FILE_NAME_BY_WEIGHT` makes
 * a weight without a mapped face a type error, and `render-font-weight.test.ts`
 * checks that each mapped file exists. Neither can see whether resvg, handed
 * those files, actually selects a different face per weight. Only rendering
 * shows that, which is what this does.
 */
const RENDER_FONT_WEIGHTS = Object.values(RenderFontWeight);

const STATIC_INTER_FONT_FILES = STATIC_INTER_FONT_FILE_NAMES
    .map(fontFileName => path.resolve(process.cwd(), "assets", "fonts", "inter", fontFileName));

test("each bundled static Inter face renders a distinct weight", () => {
    const renderedPngByWeight = RENDER_FONT_WEIGHTS.map(renderInterWeightPng);

    for (const [index, renderedPng] of renderedPngByWeight.entries()) {
        for (const [otherIndex, otherRenderedPng] of renderedPngByWeight.entries()) {
            if (otherIndex <= index) {
                continue;
            }

            assert.ok(
                !renderedPng.equals(otherRenderedPng),
                `${RENDER_FONT_WEIGHTS[index]} and ${RENDER_FONT_WEIGHTS[otherIndex]} `
                + "rendered identical output; the matching static Inter face is missing or unregistered",
            );
        }
    }
});

function renderInterWeightPng(fontWeight: RenderFontWeight): Buffer {
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="72" viewBox="0 0 240 72">
        <text x="12" y="48" font-family="Inter" font-size="40"
            font-weight="${fontWeight}" fill="#ffffff">Weight 88</text>
    </svg>`;

    return new Resvg(svgString, {
        font: {
            loadSystemFonts: false,
            fontFiles: STATIC_INTER_FONT_FILES,
            defaultFontFamily: "Inter",
            sansSerifFamily: "Inter",
        },
    }).render().asPng();
}
