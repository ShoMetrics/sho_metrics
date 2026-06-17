import { expect, test } from "@playwright/test";
import {
    buildDefaultAppearanceOverride,
    CPU_USAGE_WIDGET_DATA,
    NETWORK_DUAL_CHANNEL_WIDGET_DATA,
    NETWORK_NO_DATA_WIDGET_DATA,
    renderDualMetricWidgetPngBuffer,
    renderSingleMetricWidgetPngBuffer,
    type DualMetricVisualTestCase,
    type SingleMetricVisualTestCase,
} from "./widget-visual-test-support";

const TITLE_CARD_SQUARE_KEY_SIZE = { width: 120, height: 120 } as const;
const TITLE_CARD_WIDE_KEY_SIZE = { width: 200, height: 100 } as const;

const TITLE_CARD_TEXT_APPEARANCE = buildDefaultAppearanceOverride({
    selectedView: "text",
    colorMode: "black-white",
    textVariant: "title-card",
});

// Title-card snapshots prefer the bundled Japanese serif font for deterministic CI output.
// Production rendering prefers available system Japanese serif fonts first, so tiny unit
// glyphs can differ noticeably. A snapshot-only title-card unit overlap is expected and
// should be confirmed on hardware before changing the production layout.
const TITLE_CARD_SINGLE_VISUAL_TEST_CASES: readonly SingleMetricVisualTestCase[] = [
    {
        snapshotName: "title-card-square-cpu-usage-single-digit-nine",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            current: 9,
            progress: 0.09,
            displayValue: "9",
        },
        keySize: TITLE_CARD_SQUARE_KEY_SIZE,
    },
    {
        snapshotName: "title-card-square-cpu-usage-two-digits-with-nine",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            current: 91,
            progress: 0.91,
            displayValue: "91",
        },
        keySize: TITLE_CARD_SQUARE_KEY_SIZE,
    },
    {
        snapshotName: "title-card-square-cpu-usage-three-digits",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            current: 999,
            progress: 1,
            displayValue: "999",
        },
        keySize: TITLE_CARD_SQUARE_KEY_SIZE,
    },
    {
        snapshotName: "title-card-square-gpu-temperature-two-digits",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            label: "GPU",
            unit: "C",
            current: 46,
            progress: 0.46,
            displayValue: "46",
        },
        keySize: TITLE_CARD_SQUARE_KEY_SIZE,
    },
    {
        snapshotName: "title-card-wide-cpu-usage-two-digits-with-nine",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            current: 91,
            progress: 0.91,
            displayValue: "91",
        },
        keySize: TITLE_CARD_WIDE_KEY_SIZE,
    },
    {
        snapshotName: "title-card-wide-cpu-usage-three-digits",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            current: 999,
            progress: 1,
            displayValue: "999",
        },
        keySize: TITLE_CARD_WIDE_KEY_SIZE,
    },
];

const TITLE_CARD_DUAL_VISUAL_TEST_CASES: readonly DualMetricVisualTestCase[] = [
    {
        snapshotName: "title-card-square-network-throughput-three-digits",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: {
            positive: {
                ...NETWORK_DUAL_CHANNEL_WIDGET_DATA.positive,
                current: 999,
                progress: 0.9,
                displayValue: "999",
                unit: "KB/s",
            },
            negative: {
                ...NETWORK_DUAL_CHANNEL_WIDGET_DATA.negative,
                current: 888,
                progress: 0.8,
                displayValue: "888",
                unit: "KB/s",
            },
        },
        selectedView: "text",
        keySize: TITLE_CARD_SQUARE_KEY_SIZE,
    },
    {
        snapshotName: "title-card-square-network-throughput-no-data",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: NETWORK_NO_DATA_WIDGET_DATA,
        selectedView: "text",
        keySize: TITLE_CARD_SQUARE_KEY_SIZE,
    },
    {
        snapshotName: "title-card-wide-network-throughput-three-digits",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: {
            positive: {
                ...NETWORK_DUAL_CHANNEL_WIDGET_DATA.positive,
                current: 999,
                progress: 0.9,
                displayValue: "999",
                unit: "KB/s",
            },
            negative: {
                ...NETWORK_DUAL_CHANNEL_WIDGET_DATA.negative,
                current: 888,
                progress: 0.8,
                displayValue: "888",
                unit: "KB/s",
            },
        },
        selectedView: "text",
        keySize: TITLE_CARD_WIDE_KEY_SIZE,
    },
    {
        snapshotName: "title-card-wide-network-throughput-no-data",
        appearance: TITLE_CARD_TEXT_APPEARANCE,
        data: NETWORK_NO_DATA_WIDGET_DATA,
        selectedView: "text",
        keySize: TITLE_CARD_WIDE_KEY_SIZE,
    },
];

for (const testCase of TITLE_CARD_SINGLE_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderSingleMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

for (const testCase of TITLE_CARD_DUAL_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const pngBuffer = renderDualMetricWidgetPngBuffer(testCase);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}
