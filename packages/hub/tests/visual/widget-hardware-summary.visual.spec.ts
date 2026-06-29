import { expect, test } from "@playwright/test";
import type { HardwareSummaryWidgetData } from "../../src/actions/hardware-summary/widget-data";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import {
    buildDefaultAppearanceOverride,
    renderHardwareSummaryWidgetPngBuffer,
    type HardwareSummaryVisualTestCase,
} from "./widget-visual-test-support";

const GPU_SUMMARY_DATA: HardwareSummaryWidgetData = {
    domain: "gpu",
    primary: {
        kind: "usage",
        label: "LOAD",
        diagnosticValue: 73,
        displayValue: "73",
        unit: "%",
        progress: 0.73,
        sampleTimestampMilliseconds: 1,
    },
    secondary: [
        {
            kind: "temperature",
            label: "TEMP",
            diagnosticValue: 84,
            displayValue: "84",
            unit: "°C",
            sampleTimestampMilliseconds: 1,
        },
        {
            kind: "vram",
            label: "VRAM",
            diagnosticValue: 9.8,
            displayValue: "9.8",
            unit: "G",
            sampleTimestampMilliseconds: 1,
        },
    ],
};

const GPU_SUMMARY_NO_DATA: HardwareSummaryWidgetData = {
    domain: "gpu",
    primary: {
        kind: "usage",
        label: "LOAD",
        diagnosticValue: 13,
        displayValue: "13",
        unit: "%",
        progress: 0.13,
        sampleTimestampMilliseconds: 1,
    },
    secondary: [
        {
            kind: "temperature",
            label: "TEMP",
            diagnosticValue: 0,
            displayValue: "N/A",
            unit: "",
            sampleTimestampMilliseconds: undefined,
        },
        {
            kind: "power",
            label: "PWR",
            diagnosticValue: 0,
            displayValue: "N/A",
            unit: "",
            sampleTimestampMilliseconds: undefined,
        },
    ],
};

const PIXEL_WINDOW_SUMMARY_APPEARANCE: ResolvedAppearanceSettingsOverride = {
    view: {
        selectedView: "circle",
    },
    theme: {
        selectedTheme: "pixel-window",
    },
};

const HARDWARE_SUMMARY_VISUAL_TEST_CASES: readonly HardwareSummaryVisualTestCase[] = [
    {
        snapshotName: "hardware-summary-square-gpu-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            colorMode: "multi-color",
        }),
        data: GPU_SUMMARY_DATA,
    },
    {
        snapshotName: "hardware-summary-touch-strip-gpu-default-multi-color",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            colorMode: "multi-color",
        }),
        data: GPU_SUMMARY_DATA,
        renderTarget: "touch-strip",
    },
    {
        snapshotName: "hardware-summary-touch-strip-gpu-secondary-no-data",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            colorMode: "multi-color",
        }),
        data: GPU_SUMMARY_NO_DATA,
        renderTarget: "touch-strip",
    },
    {
        snapshotName: "hardware-summary-square-gpu-pixel-window",
        appearance: PIXEL_WINDOW_SUMMARY_APPEARANCE,
        data: GPU_SUMMARY_DATA,
    },
];

for (const testCase of HARDWARE_SUMMARY_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderHardwareSummaryWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}
