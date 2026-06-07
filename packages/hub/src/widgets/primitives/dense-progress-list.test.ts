import assert from "node:assert/strict";
import test from "node:test";
import type { DenseMetricWidgetData } from "../../actions/dense-multi-metric/row-data";
import { TOUCH_STRIP_LOGICAL_SIZE, WIDGET_LOGICAL_SIZE, type WidgetData } from "../../view-rendering/widget-data";
import {
    DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
    renderDenseProgressList,
} from "./dense-progress-list";

test("dense progress list renders 2 to 6 square rows in one column", () => {
    for (const rowCount of [2, 3, 4, 5, 6]) {
        const svg = renderDenseProgressList(
            buildDenseMetricWidgetData(rowCount),
            DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
            WIDGET_LOGICAL_SIZE,
        );

        assert.equal(countMatches(svg, /class="dense-progress-list-row"/gu), rowCount);
        assert.equal(new Set(readTrackXCoordinates(svg)).size, 1);
    }
});

test("dense progress list keeps value text inside the progress track", () => {
    const svg = renderDenseProgressList(
        buildDenseMetricWidgetData(2),
        DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        WIDGET_LOGICAL_SIZE,
    );
    const firstTrack = readTrackRects(svg)[0];
    const firstValueTextXCoordinate = readValueTextXCoordinates(svg)[0];

    assert.notEqual(firstTrack, undefined);
    assert.notEqual(firstValueTextXCoordinate, undefined);
    assert.ok(firstValueTextXCoordinate > firstTrack.xCoordinate);
    assert.ok(firstValueTextXCoordinate < firstTrack.xCoordinate + firstTrack.width);
});

test("dense progress list clips fill to the track without rounding the fill edge", () => {
    const svg = renderDenseProgressList(
        buildDenseMetricWidgetData(2),
        DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        WIDGET_LOGICAL_SIZE,
    );
    const firstFillRect = readFillRects(svg)[0];

    assert.notEqual(firstFillRect, undefined);
    assert.match(firstFillRect, /clip-path="url\(#dense-progress-list-fill-0\)"/u);
    assert.doesNotMatch(firstFillRect, /\srx="/u);
});

test("dense progress list aligns unit text in a fixed right-side area", () => {
    const svg = renderDenseProgressList(
        buildDenseMetricWidgetData(3),
        DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        WIDGET_LOGICAL_SIZE,
    );

    assert.equal(new Set(readUnitTextXCoordinates(svg)).size, 1);
});

test("dense progress list keeps padding between value and unit text", () => {
    const svg = renderDenseProgressList(
        buildDenseMetricWidgetData(2),
        DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        WIDGET_LOGICAL_SIZE,
    );
    const firstValueTextXCoordinate = readValueTextXCoordinates(svg)[0];
    const firstUnitTextXCoordinate = readUnitTextXCoordinates(svg)[0];

    assert.notEqual(firstValueTextXCoordinate, undefined);
    assert.notEqual(firstUnitTextXCoordinate, undefined);
    assert.ok(firstValueTextXCoordinate + 2 <= firstUnitTextXCoordinate);
});

test("dense progress list vertically centers value and unit text on the bar", () => {
    const svg = renderDenseProgressList(
        buildDenseMetricWidgetData(2),
        DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        WIDGET_LOGICAL_SIZE,
    );
    const firstTrack = readTrackRects(svg)[0];
    const firstValueTextYCoordinate = readValueTextYCoordinates(svg)[0];
    const firstUnitTextYCoordinate = readUnitTextYCoordinates(svg)[0];

    assert.notEqual(firstTrack, undefined);
    assert.notEqual(firstValueTextYCoordinate, undefined);
    assert.notEqual(firstUnitTextYCoordinate, undefined);
    assert.equal(firstValueTextYCoordinate, firstTrack.yCoordinate + firstTrack.height / 2);
    assert.equal(firstUnitTextYCoordinate, firstTrack.yCoordinate + firstTrack.height / 2);
});

test("dense progress list picks readable value text over filled bar color", () => {
    const svg = renderDenseProgressList(
        {
            rows: [
                buildDenseMetricRow({
                    slotId: "slot-bright",
                    label: "CPU",
                    current: 92,
                    progress: 0.92,
                }),
                buildDenseMetricRow({
                    slotId: "slot-low",
                    label: "GPU",
                    current: 1,
                    progress: 0.01,
                }),
            ],
        },
        {
            ...DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
            colorConfig: {
                mode: "solid",
                solidColor: "#facc15",
                thresholds: [],
                isGradientEnabled: true,
            },
        },
        WIDGET_LOGICAL_SIZE,
    );

    assert.equal(readValueTextFills(svg)[0], "#111827");
    assert.equal(readUnitTextFills(svg)[0], "#111827");
    assert.equal(readValueTextFills(svg)[1], DEFAULT_DENSE_PROGRESS_LIST_CONFIG.paints.valueText);
    assert.equal(readUnitTextFills(svg)[1], DEFAULT_DENSE_PROGRESS_LIST_CONFIG.paints.unitText);
});

test("dense progress list shrinks bar height as row count increases", () => {
    const twoRowSvg = renderDenseProgressList(
        buildDenseMetricWidgetData(2),
        DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        WIDGET_LOGICAL_SIZE,
    );
    const sixRowSvg = renderDenseProgressList(
        buildDenseMetricWidgetData(6),
        DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        WIDGET_LOGICAL_SIZE,
    );

    const twoRowTrackHeight = readTrackRects(twoRowSvg)[0]?.height ?? 0;
    const sixRowTrackHeight = readTrackRects(sixRowSvg)[0]?.height ?? 0;

    assert.ok(twoRowTrackHeight > sixRowTrackHeight);
});

test("dense progress list keeps touch strip rows full width for 2 or 3 rows", () => {
    for (const rowCount of [2, 3]) {
        const svg = renderDenseProgressList(
            buildDenseMetricWidgetData(rowCount),
            DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
            TOUCH_STRIP_LOGICAL_SIZE,
        );

        assert.equal(countMatches(svg, /class="dense-progress-list-row"/gu), rowCount);
        assert.equal(new Set(readTrackXCoordinates(svg)).size, 1);
    }
});

test("dense progress list uses two touch strip columns for 4 to 6 rows", () => {
    for (const rowCount of [4, 5, 6]) {
        const svg = renderDenseProgressList(
            buildDenseMetricWidgetData(rowCount),
            DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
            TOUCH_STRIP_LOGICAL_SIZE,
        );
        const trackXCoordinates = readTrackXCoordinates(svg);

        assert.equal(countMatches(svg, /class="dense-progress-list-row"/gu), rowCount);
        assert.equal(new Set(trackXCoordinates).size, 2);
        assert.equal(trackXCoordinates[0], trackXCoordinates[2]);
        assert.equal(trackXCoordinates[1], trackXCoordinates[3]);
    }
});

test("dense progress list escapes labels and slot ids", () => {
    const svg = renderDenseProgressList({
        rows: [
            buildDenseMetricRow({
                slotId: "slot<1>",
                label: "C&P",
            }),
            buildDenseMetricRow({
                slotId: "slot-2",
                label: "GPU",
            }),
        ],
    }, DEFAULT_DENSE_PROGRESS_LIST_CONFIG, WIDGET_LOGICAL_SIZE);

    assert.match(svg, /data-slot-id="slot&lt;1&gt;"/u);
    assert.match(svg, />C&amp;P<\/text>/u);
});

function buildDenseMetricWidgetData(rowCount: number): DenseMetricWidgetData {
    return {
        rows: Array.from({ length: rowCount }, (_, index) => buildDenseMetricRow({
            slotId: `slot-${index}`,
            label: `R${index}`,
            current: (index + 1) * 10,
            progress: (index + 1) / rowCount,
        })),
    };
}

function buildDenseMetricRow(options: {
    readonly slotId: string;
    readonly label: string;
    readonly current?: number;
    readonly progress?: number;
}) {
    return {
        rowKind: "configured" as const,
        slotId: options.slotId,
        metricKey: `metric.${options.slotId}`,
        widgetData: buildWidgetData({
            label: options.label,
            current: options.current,
            progress: options.progress,
        }),
    };
}

function buildWidgetData(options: Partial<WidgetData>): WidgetData {
    return {
        current: options.current ?? 42,
        progress: options.progress ?? 0.42,
        history: [10, 20, 42],
        unit: "%",
        label: options.label ?? "CPU",
        displayValue: options.displayValue,
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds ?? 1000,
    };
}

function readTrackXCoordinates(svg: string): readonly string[] {
    return [...svg.matchAll(/class="dense-progress-list-track"\s+x="([^"]+)"/gu)]
        .map(match => match[1] ?? "");
}

function readTrackRects(svg: string): ReadonlyArray<{ xCoordinate: number; yCoordinate: number; width: number; height: number }> {
    return [...svg.matchAll(/class="dense-progress-list-track"\s+x="([^"]+)" y="([^"]+)"\s+width="([^"]+)" height="([^"]+)"/gu)]
        .map(match => ({
            xCoordinate: Number(match[1] ?? 0),
            yCoordinate: Number(match[2] ?? 0),
            width: Number(match[3] ?? 0),
            height: Number(match[4] ?? 0),
        }));
}

function readValueTextXCoordinates(svg: string): readonly number[] {
    return [...svg.matchAll(/<clipPath id="dense-progress-list-value-\d+">[\s\S]*?<\/clipPath>\s*<\/defs>\s*<g clip-path="url\(#dense-progress-list-value-\d+\)">\s*<text x="([^"]+)"/gu)]
        .map(match => Number(match[1] ?? 0));
}

function readValueTextYCoordinates(svg: string): readonly number[] {
    return [...svg.matchAll(/<clipPath id="dense-progress-list-value-\d+">[\s\S]*?<\/clipPath>\s*<\/defs>\s*<g clip-path="url\(#dense-progress-list-value-\d+\)">\s*<text x="[^"]+" y="([^"]+)"/gu)]
        .map(match => Number(match[1] ?? 0));
}

function readUnitTextXCoordinates(svg: string): readonly number[] {
    return [...svg.matchAll(/<clipPath id="dense-progress-list-unit-\d+">[\s\S]*?<\/clipPath>\s*<\/defs>\s*<g clip-path="url\(#dense-progress-list-unit-\d+\)">\s*<text x="([^"]+)"/gu)]
        .map(match => Number(match[1] ?? 0));
}

function readUnitTextYCoordinates(svg: string): readonly number[] {
    return [...svg.matchAll(/<clipPath id="dense-progress-list-unit-\d+">[\s\S]*?<\/clipPath>\s*<\/defs>\s*<g clip-path="url\(#dense-progress-list-unit-\d+\)">\s*<text x="[^"]+" y="([^"]+)"/gu)]
        .map(match => Number(match[1] ?? 0));
}

function readValueTextFills(svg: string): readonly string[] {
    return [...svg.matchAll(/<clipPath id="dense-progress-list-value-\d+">[\s\S]*?<\/clipPath>\s*<\/defs>\s*<g clip-path="url\(#dense-progress-list-value-\d+\)">[\s\S]*?<text\s+[^>]*fill="([^"]+)"/gu)]
        .map(match => match[1] ?? "");
}

function readUnitTextFills(svg: string): readonly string[] {
    return [...svg.matchAll(/<clipPath id="dense-progress-list-unit-\d+">[\s\S]*?<\/clipPath>\s*<\/defs>\s*<g clip-path="url\(#dense-progress-list-unit-\d+\)">[\s\S]*?<text\s+[^>]*fill="([^"]+)"/gu)]
        .map(match => match[1] ?? "");
}

function readFillRects(svg: string): readonly string[] {
    return [...svg.matchAll(/<rect class="dense-progress-list-fill"[^>]+>/gu)]
        .map(match => match[0] ?? "");
}

function countMatches(text: string, pattern: RegExp): number {
    return [...text.matchAll(pattern)].length;
}
