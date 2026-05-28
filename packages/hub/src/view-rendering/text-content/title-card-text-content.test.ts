import assert from "node:assert/strict";
import test from "node:test";
import type { DualTextMetricContent } from "../../widgets/primitives/text-metric";
import type { WidgetData } from "../widget-data";
import { buildTitleCardDualMetricContent, buildTitleCardSingleMetricContent } from "./title-card-text-content";

test("title-card single metric content maps known metric display labels outside the primitive", () => {
    const testCases = [
        { name: "CPU usage", label: "CPU", unit: "%", captionText: "使用率", codeText: "CPU", compactCodeText: "CPU", unitText: "%" },
        { name: "GPU usage", label: "GPU", unit: "%", captionText: "使用率", codeText: "GPU", compactCodeText: "GPU", unitText: "%" },
        { name: "GPU temperature", label: "GPU", unit: "C", captionText: "温度計", codeText: "GPU", compactCodeText: "GPU", unitText: "°C" },
        { name: "RAM usage", label: "RAM", unit: "%", captionText: "記憶量", codeText: "RAM", compactCodeText: "RAM", unitText: "%" },
        { name: "VRAM usage", label: "VRAM", unit: "%", captionText: "記憶量", codeText: "VRAM", compactCodeText: "VRM", unitText: "%" },
        { name: "disk usage", label: "C:", unit: "%", captionText: "蓄積量", codeText: "C:", compactCodeText: "C:", unitText: "%" },
        { name: "disk throughput", label: "DISK", unit: "B/s", captionText: "転送速", codeText: "DISK", compactCodeText: "DSK", unitText: "B" },
        { name: "disk read throughput", label: "READ", unit: "B/s", captionText: "読込速", codeText: "READ", compactCodeText: "REA", unitText: "B" },
        { name: "disk write throughput", label: "WRIT", unit: "B/s", captionText: "書込速", codeText: "WRIT", compactCodeText: "WRI", unitText: "B" },
        { name: "network throughput", label: "NET", unit: "B/s", captionText: "転送速", codeText: "NET", compactCodeText: "NET", unitText: "B" },
        { name: "GPU power", label: "GPU", unit: "W", captionText: "消費電", codeText: "GPU", compactCodeText: "GPU", unitText: "W" },
        { name: "unknown metric", label: "FOO", unit: "%", captionText: "計測値", codeText: "FOO", compactCodeText: "FOO", unitText: "%" },
    ] as const;

    for (const testCase of testCases) {
        const content = buildTitleCardSingleMetricContent(buildWidgetData({
            label: testCase.label,
            unit: testCase.unit,
        }));

        assert.deepEqual(content, {
            codeText: testCase.codeText,
            compactCodeText: testCase.compactCodeText,
            threeCharacterCaptionText: testCase.captionText,
            unitText: testCase.unitText,
        }, testCase.name);
        assert.equal(Array.from(content.threeCharacterCaptionText).length, 3, testCase.name);
    }
});

test("title-card dual metric content maps known dual titles and channel labels outside the primitive", () => {
    const testCases = [
        { name: "network throughput", titleText: "NET", captionText: "転送速", codeText: "NET", compactCodeText: "NET" },
        { name: "disk read write", titleText: "DISK", captionText: "転送速", codeText: "DISK", compactCodeText: "DSK" },
        { name: "disk read", titleText: "READ", captionText: "読込速", codeText: "READ", compactCodeText: "REA" },
        { name: "disk write", titleText: "WRIT", captionText: "書込速", codeText: "WRIT", compactCodeText: "WRI" },
        { name: "unknown metric", titleText: "FOO", captionText: "計測値", codeText: "FOO", compactCodeText: "FOO" },
    ] as const;

    for (const testCase of testCases) {
        const content = buildTitleCardDualMetricContent(buildDualTextMetricContent(testCase.titleText));

        assert.deepEqual(content, {
            codeText: testCase.codeText,
            compactCodeText: testCase.compactCodeText,
            threeCharacterCaptionText: testCase.captionText,
            positiveLabelText: "↑",
            positiveUnitText: "M",
            negativeLabelText: "↓",
            negativeUnitText: "M",
        }, testCase.name);
        assert.equal(Array.from(content.threeCharacterCaptionText).length, 3, testCase.name);
    }
});

function buildWidgetData(options: {
    readonly label: string;
    readonly unit: string;
}): WidgetData {
    return {
        current: 42,
        progress: 0.42,
        history: [10, 20, 42],
        label: options.label,
        unit: options.unit,
        displayValue: "42",
    };
}

function buildDualTextMetricContent(titleText: string): DualTextMetricContent {
    return {
        titleText,
        positive: {
            labelText: "UP",
            unitText: "MB/s",
        },
        negative: {
            labelText: "DN",
            unitText: "MB/s",
        },
    };
}
