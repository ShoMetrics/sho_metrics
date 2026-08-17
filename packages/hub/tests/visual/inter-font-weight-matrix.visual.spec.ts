import { expect, test } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { RenderFontWeight } from "../../src/view-rendering/rasterize/render-font-weight";
import { VISUAL_TEST_INTER_FONT_FILES } from "./widget-visual-test-support";

/**
 * Isolates weight as the only axis: one size, one color, one background, and no
 * theme effects. This is the reference sheet for deciding which static Inter
 * faces are visually distinct enough to keep bundled.
 *
 * Derived from `RenderFontWeight` rather than listed, so a new member joins the
 * sheet on its own. A hand-written list would leave the reference silently one
 * row short of the vocabulary it exists to illustrate.
 */
const ASCENDING_RENDER_FONT_WEIGHTS = Object.values(RenderFontWeight)
    .sort((leftWeight, rightWeight) => leftWeight - rightWeight);

const MATRIX_WIDTH = 320;
const MATRIX_ROW_HEIGHT = 46;
const MATRIX_SAMPLE_TEXT = "CPU 88% Wg";

test("renders the static Inter weight matrix", () => {
    const svg = renderInterWeightMatrixSvg();

    for (const fontWeight of ASCENDING_RENDER_FONT_WEIGHTS) {
        expect(svg).toContain(`font-weight="${fontWeight}"`);
    }

    expect(renderInterWeightMatrixPng(svg)).toMatchSnapshot("inter-font-weight-matrix.png");
});

function renderInterWeightMatrixPng(svg: string): Buffer {
    const renderedImage = new Resvg(svg, {
        font: {
            loadSystemFonts: false,
            fontFiles: [...VISUAL_TEST_INTER_FONT_FILES],
            defaultFontFamily: "Inter",
            sansSerifFamily: "Inter",
        },
    }).render();

    return Buffer.from(renderedImage.asPng());
}

function renderInterWeightMatrixSvg(): string {
    const matrixHeight = MATRIX_ROW_HEIGHT * ASCENDING_RENDER_FONT_WEIGHTS.length;
    const rows = ASCENDING_RENDER_FONT_WEIGHTS.map((fontWeight, rowIndex) => {
        const baselineYCoordinate = MATRIX_ROW_HEIGHT * rowIndex + MATRIX_ROW_HEIGHT * 0.68;

        return `<text x="12" y="${baselineYCoordinate}" font-family="Inter" font-size="26"
            font-weight="${fontWeight}" fill="#ffffff">${fontWeight} ${MATRIX_SAMPLE_TEXT}</text>`;
    }).join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${MATRIX_WIDTH}" height="${matrixHeight}"
        viewBox="0 0 ${MATRIX_WIDTH} ${matrixHeight}">
        <rect width="${MATRIX_WIDTH}" height="${matrixHeight}" fill="#101010" />
        ${rows}
    </svg>`;
}
