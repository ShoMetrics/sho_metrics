import { expect, test } from "@playwright/test";
import { buildDiskUsageWidgetData } from "../../src/metrics/storage-widget-data";
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
import { getDiskIconFragment } from "../../src/widgets/icons/hardware-icons";
import {
    buildDefaultAppearanceOverride,
    renderSingleMetricWidgetPngBuffer,
    type SingleMetricVisualTestCase,
} from "./widget-visual-test-support";

const GIBIBYTE = 1024 ** 3;
const DISK_ICON_FRAGMENT = getDiskIconFragment("ssd");
const USED_BYTES_WIDGET_DATA: WidgetData = {
    current: 18 * GIBIBYTE,
    progress: 0,
    history: [8, 10, 12, 15, 13, 16, 18].map(value => value * GIBIBYTE),
    unit: "B",
    label: "C:",
    sampleTimestampMilliseconds: 1,
};
const FREE_CAPACITY_FOOTER_ICON = {
    fragment: renderFreeCapacityIconFragment(30),
    nominalSize: 30,
    opticalYOffsetRatio: FREE_CAPACITY_ICON_OPTICAL_Y_OFFSET_RATIO,
} as const;
const FREE_CAPACITY_WIDGET_DATA = buildDiskUsageWidgetData({
    usedBytesWidgetData: USED_BYTES_WIDGET_DATA,
    totalBytes: 32 * GIBIBYTE,
    availableBytes: 14 * GIBIBYTE,
    displayMode: "freeCapacity",
    label: "C:",
    barLabel: "SSD (C:)",
});
const FREE_CAPACITY_RENDER_DATA: WidgetData = {
    ...FREE_CAPACITY_WIDGET_DATA,
    valueQualifierIconFragment: renderFreeCapacityIconFragment(30),
};
const USED_CAPACITY_WIDGET_DATA = buildDiskUsageWidgetData({
    usedBytesWidgetData: USED_BYTES_WIDGET_DATA,
    totalBytes: 32 * GIBIBYTE,
    availableBytes: 14 * GIBIBYTE,
    displayMode: "usedCapacity",
    label: "C:",
    barLabel: "SSD (C:)",
});

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

const DISK_CAPACITY_VISUAL_TEST_CASES: readonly SingleMetricVisualTestCase[] = [
    ...(["line", "bar", "circle", "text"] as const).map(selectedView => ({
        snapshotName: `disk-free-capacity-flat-square-${selectedView}`,
        appearance: buildDefaultAppearanceOverride({
            selectedView,
            circleVariant: "full-ring",
        }),
        data: FREE_CAPACITY_RENDER_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: DISK_ICON_FRAGMENT,
        topIcon: DISK_ICON_FRAGMENT,
    })),
    {
        snapshotName: "disk-free-capacity-flat-touch-strip-bar",
        appearance: buildDefaultAppearanceOverride({ selectedView: "bar" }),
        data: FREE_CAPACITY_RENDER_DATA,
        keySize: TOUCH_STRIP_LOGICAL_SIZE,
        centerIcon: DISK_ICON_FRAGMENT,
        topIcon: DISK_ICON_FRAGMENT,
    },
    {
        snapshotName: "disk-free-capacity-flat-square-gauge",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: FREE_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: DISK_ICON_FRAGMENT,
        footerIcon: FREE_CAPACITY_FOOTER_ICON,
    },
    {
        snapshotName: "disk-used-capacity-flat-square-gauge",
        appearance: buildDefaultAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
        }),
        data: USED_CAPACITY_WIDGET_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        centerIcon: DISK_ICON_FRAGMENT,
    },
    ...(["line", "bar", "text"] as const).map(selectedView => ({
        snapshotName: `disk-free-capacity-pixel-window-${selectedView}`,
        appearance: buildPixelWindowAppearance(selectedView),
        data: FREE_CAPACITY_RENDER_DATA,
        keySize: WIDGET_LOGICAL_SIZE,
        renderTarget: "key" as const,
        centerIcon: DISK_ICON_FRAGMENT,
        topIcon: DISK_ICON_FRAGMENT,
    })),
];

for (const testCase of DISK_CAPACITY_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        expect(renderSingleMetricWidgetPngBuffer(testCase))
            .toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}
