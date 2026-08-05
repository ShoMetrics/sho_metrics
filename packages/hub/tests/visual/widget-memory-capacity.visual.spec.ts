import { expect, test } from "@playwright/test";
import { buildMemoryUsageWidgetData } from "../../src/metrics/storage-widget-data";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import {
    TOUCH_STRIP_LOGICAL_SIZE,
    WIDGET_LOGICAL_SIZE,
    type WidgetData,
} from "../../src/view-rendering/widget-data";
import {
    FREE_CAPACITY_ICON_OPTICAL_Y_OFFSET_RATIO,
    renderFreeCapacityIconFragment,
} from "../../src/widgets/icons/free-capacity-icon";
import { getHardwareIconFragment } from "../../src/widgets/icons/hardware-icons";
import {
    buildDefaultAppearanceOverride,
    renderSingleMetricWidgetPngBuffer,
    type SingleMetricVisualTestCase,
} from "./widget-visual-test-support";

const MEMORY_ICON_FRAGMENT = getHardwareIconFragment("memory");
const FREE_CAPACITY_FOOTER_ICON = {
    fragment: renderFreeCapacityIconFragment(30),
    nominalSize: 30,
    opticalYOffsetRatio: FREE_CAPACITY_ICON_OPTICAL_Y_OFFSET_RATIO,
} as const;
const GIBIBYTE = 1024 ** 3;
const USED_BYTES_WIDGET_DATA: WidgetData = {
    current: 18 * GIBIBYTE,
    progress: 0,
    history: [8, 10, 12, 15, 13, 16, 18].map(value => value * GIBIBYTE),
    unit: "B",
    label: "RAM",
    sampleTimestampMilliseconds: 1,
};
const FREE_CAPACITY_WIDGET_DATA = buildMemoryUsageWidgetData({
    usedBytesWidgetData: USED_BYTES_WIDGET_DATA,
    totalBytes: 32 * GIBIBYTE,
    label: "RAM",
    displayMode: "freeCapacity",
});
const FREE_CAPACITY_RENDER_DATA: WidgetData = {
    ...FREE_CAPACITY_WIDGET_DATA,
    valueQualifierIconFragment: renderFreeCapacityIconFragment(30),
};
const USED_CAPACITY_WIDGET_DATA = buildMemoryUsageWidgetData({
    usedBytesWidgetData: USED_BYTES_WIDGET_DATA,
    totalBytes: 32 * GIBIBYTE,
    label: "RAM",
    displayMode: "usedCapacity",
});
const ONE_GIGABYTE_CAPACITY_WIDGET_DATA: WidgetData = {
    ...FREE_CAPACITY_WIDGET_DATA,
    displayValue: "1",
    unit: "GB",
};
const ONE_HUNDRED_TWENTY_THREE_MEGABYTE_CAPACITY_WIDGET_DATA: WidgetData = {
    ...FREE_CAPACITY_WIDGET_DATA,
    displayValue: "123",
    unit: "MB",
};
const THIRTY_SEVEN_GIGABYTE_CAPACITY_WIDGET_DATA: WidgetData = {
    ...FREE_CAPACITY_WIDGET_DATA,
    displayValue: "37",
    unit: "GB",
};
const TWENTY_SEVEN_GIGABYTE_VRAM_CAPACITY_WIDGET_DATA: WidgetData = {
    ...FREE_CAPACITY_WIDGET_DATA,
    displayValue: "27",
    unit: "GB",
    label: "VRAM",
};

function buildPixelWindowAppearance(
    selectedView: "line" | "bar" | "text",
): ResolvedAppearanceSettingsOverride {
    return {
        view: {
            selectedView,
            textVariant: "centered",
        },
        theme: {
            selectedTheme: "pixel-window",
        },
    };
}

function buildFreeCapacityRenderData(usedGigabytes: number, totalGigabytes = 100): WidgetData {
    const totalBytes = totalGigabytes * GIBIBYTE;
    const widgetData = buildMemoryUsageWidgetData({
        usedBytesWidgetData: {
            ...USED_BYTES_WIDGET_DATA,
            current: usedGigabytes * GIBIBYTE,
            history: [usedGigabytes * GIBIBYTE],
        },
        totalBytes,
        label: "RAM",
        displayMode: "freeCapacity",
    });

    return {
        ...widgetData,
        valueQualifierIconFragment: renderFreeCapacityIconFragment(30),
    };
}

const MEMORY_CAPACITY_VISUAL_TEST_CASES: readonly SingleMetricVisualTestCase[] = [
    ...(["line", "bar", "circle", "text"] as const).flatMap(selectedView => [
        {
            snapshotName: `memory-free-capacity-flat-square-${selectedView}`,
            appearance: buildDefaultAppearanceOverride({
                selectedView,
                circleVariant: "full-ring",
            }),
            data: FREE_CAPACITY_RENDER_DATA,
            keySize: WIDGET_LOGICAL_SIZE,
            centerIcon: "",
            topIcon: MEMORY_ICON_FRAGMENT,
        },
        {
            snapshotName: `memory-free-capacity-flat-touch-strip-${selectedView}`,
            appearance: buildDefaultAppearanceOverride({
                selectedView,
                circleVariant: "full-ring",
            }),
            data: FREE_CAPACITY_RENDER_DATA,
            keySize: TOUCH_STRIP_LOGICAL_SIZE,
            centerIcon: "",
            topIcon: MEMORY_ICON_FRAGMENT,
        },
    ]),
    {
        snapshotName: "memory-free-capacity-flat-square-gauge",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: FREE_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        footerIcon: FREE_CAPACITY_FOOTER_ICON,
    },
    {
        snapshotName: "memory-used-capacity-flat-square-circle",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "full-ring",
        }),
        data: USED_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
    },
    {
        snapshotName: "memory-used-capacity-flat-square-gauge",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: USED_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
    },
    {
        snapshotName: "memory-free-capacity-flat-square-gauge-one-gigabyte",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: ONE_GIGABYTE_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        footerIcon: FREE_CAPACITY_FOOTER_ICON,
    },
    {
        snapshotName: "memory-free-capacity-flat-square-gauge-123-megabytes",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: ONE_HUNDRED_TWENTY_THREE_MEGABYTE_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        footerIcon: FREE_CAPACITY_FOOTER_ICON,
    },
    {
        snapshotName: "memory-free-capacity-flat-square-gauge-37-gigabytes",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: THIRTY_SEVEN_GIGABYTE_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        footerIcon: FREE_CAPACITY_FOOTER_ICON,
    },
    {
        snapshotName: "vram-free-capacity-flat-square-gauge-27-gigabytes",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: TWENTY_SEVEN_GIGABYTE_VRAM_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        footerIcon: FREE_CAPACITY_FOOTER_ICON,
    },
    {
        snapshotName: "memory-free-capacity-pixel-window-line",
        appearance: buildPixelWindowAppearance("line"),
        data: FREE_CAPACITY_RENDER_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        renderTarget: "key",
        centerIcon: "",
        topIcon: MEMORY_ICON_FRAGMENT,
    },
    {
        snapshotName: "memory-free-capacity-pixel-window-bar",
        appearance: buildPixelWindowAppearance("bar"),
        data: FREE_CAPACITY_RENDER_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        renderTarget: "key",
        centerIcon: "",
        topIcon: MEMORY_ICON_FRAGMENT,
    },
    {
        snapshotName: "memory-free-capacity-pixel-window-text",
        appearance: buildPixelWindowAppearance("text"),
        data: FREE_CAPACITY_RENDER_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        renderTarget: "key",
        centerIcon: "",
    },
    ...([0, 5, 50, 95, 100] as const).map(usedPercent => ({
        snapshotName: `memory-free-capacity-flat-square-bar-${usedPercent}-percent-used`,
        appearance: buildDefaultAppearanceOverride({
            selectedView: "bar",
        }),
        data: buildFreeCapacityRenderData(usedPercent),
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        topIcon: MEMORY_ICON_FRAGMENT,
    })),
    {
        snapshotName: "memory-free-capacity-flat-square-bar-23-of-63-gigabytes-used",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "bar",
        }),
        data: buildFreeCapacityRenderData(23, 63),
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        topIcon: MEMORY_ICON_FRAGMENT,
    },
];

for (const testCase of MEMORY_CAPACITY_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        expect(renderSingleMetricWidgetPngBuffer(testCase))
            .toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}
