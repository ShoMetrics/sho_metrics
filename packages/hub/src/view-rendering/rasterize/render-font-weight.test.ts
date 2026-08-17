import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { RenderFontWeight, STATIC_INTER_FONT_FILE_NAME_BY_WEIGHT } from "./render-font-weight";

test("render font weights are the SVG numbers, ascending and distinct", () => {
    const fontWeights = Object.values(RenderFontWeight);

    assert.deepEqual(fontWeights, [400, 500, 600, 700]);
    assert.equal(new Set(fontWeights).size, fontWeights.length);
});

// The Record type already makes a weight without a face a compile error, but it
// cannot tell whether the file name it holds is spelled the way the file on
// disk is. A rename or a typo drops the face silently: resvg has no error path
// for a missing file, so it renders the nearest weight instead of failing.
test("every render font weight maps to a bundled static Inter face that exists", () => {
    for (const [fontWeight, fontFileName] of Object.entries(STATIC_INTER_FONT_FILE_NAME_BY_WEIGHT)) {
        const fontFile = path.resolve(process.cwd(), "assets", "fonts", "inter", fontFileName);

        assert.ok(existsSync(fontFile), `weight ${fontWeight} maps to missing font file ${fontFile}`);
    }
});
