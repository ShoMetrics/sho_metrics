import { expect, test } from "@playwright/test";
import {
    renderDualMetricWidgetPngBuffer,
    renderSingleMetricWidgetPngBuffer,
} from "./widget-visual-test-support";
import {
    VISUAL_MATRIX_DATA_CASES,
    VISUAL_MATRIX_SURFACE_CASES,
    VISUAL_MATRIX_THEME_CASES,
    VISUAL_MATRIX_VIEW_CASES,
    WIDGET_VISUAL_MATRIX_CASES,
    getRequiredVisualMatrixSurfaceCases,
    getVisualMatrixSurfaceExclusionReasons,
} from "./widget-visual-matrix";

test("visual matrix covers every required axis combination", () => {
    const expectedAxisKeys = buildExpectedAxisKeys();
    const uniqueAxisKeys = new Set(WIDGET_VISUAL_MATRIX_CASES.map(testCase => [
        testCase.viewCase,
        testCase.themeCase,
        testCase.surfaceCase,
        testCase.dataCase,
    ].join("|")));

    expect(WIDGET_VISUAL_MATRIX_CASES).toHaveLength(expectedAxisKeys.length);
    expect(uniqueAxisKeys.size).toBe(expectedAxisKeys.length);

    for (const expectedAxisKey of expectedAxisKeys) {
        expect(uniqueAxisKeys.has(expectedAxisKey)).toBe(true);
    }

    for (const viewCase of VISUAL_MATRIX_VIEW_CASES) {
        const supportedSurfaceCases = new Set(getRequiredVisualMatrixSurfaceCases(viewCase));
        const excludedSurfaceCases = getVisualMatrixSurfaceExclusionReasons(viewCase);

        for (const surfaceCase of VISUAL_MATRIX_SURFACE_CASES) {
            if (supportedSurfaceCases.has(surfaceCase)) {
                expect(excludedSurfaceCases.has(surfaceCase)).toBe(false);
                continue;
            }

            expect(excludedSurfaceCases.get(surfaceCase)?.length).toBeGreaterThan(0);
        }
    }
});

test("visual matrix renders representative single and dual cases", () => {
    const singleCase = WIDGET_VISUAL_MATRIX_CASES.find(testCase => testCase.metricKind === "single");
    const dualCase = WIDGET_VISUAL_MATRIX_CASES.find(testCase => testCase.metricKind === "dual");

    expect(singleCase).toBeDefined();
    expect(dualCase).toBeDefined();

    if (singleCase?.metricKind !== "single" || dualCase?.metricKind !== "dual") {
        throw new Error("Expected representative single and dual visual matrix cases.");
    }

    expect(isPngBuffer(renderSingleMetricWidgetPngBuffer(singleCase.testCase))).toBe(true);
    expect(isPngBuffer(renderDualMetricWidgetPngBuffer(dualCase.testCase))).toBe(true);
});

for (const matrixCase of WIDGET_VISUAL_MATRIX_CASES) {
    test(`renders matrix ${matrixCase.snapshotName}`, () => {
        const pngBuffer = matrixCase.metricKind === "single"
            ? renderSingleMetricWidgetPngBuffer(matrixCase.testCase)
            : renderDualMetricWidgetPngBuffer(matrixCase.testCase);

        expect(pngBuffer).toMatchSnapshot(`${matrixCase.snapshotName}.png`);
    });
}

function isPngBuffer(buffer: Buffer): boolean {
    return buffer.length > 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47;
}

function buildExpectedAxisKeys(): readonly string[] {
    const expectedAxisKeys: string[] = [];

    for (const viewCase of VISUAL_MATRIX_VIEW_CASES) {
        for (const themeCase of VISUAL_MATRIX_THEME_CASES) {
            for (const surfaceCase of getRequiredVisualMatrixSurfaceCases(viewCase)) {
                for (const dataCase of VISUAL_MATRIX_DATA_CASES) {
                    expectedAxisKeys.push([viewCase, themeCase, surfaceCase, dataCase].join("|"));
                }
            }
        }
    }

    return expectedAxisKeys;
}
