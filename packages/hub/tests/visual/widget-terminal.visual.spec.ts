import { expect, test } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { renderMetricFrame } from "../../src/view-rendering/metric-frame";
import { resolveResvgFontOptions } from "../../src/view-rendering/resvg-font-options";
import { renderSingleMetricBodyView } from "../../src/view-rendering/single-metric-view";
import { WIDGET_LOGICAL_SIZE, type KeySize, type WidgetData } from "../../src/view-rendering/widget-data";
import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import { buildDefaultAppearanceSettings } from "../../src/settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../src/settings/render-appearance-builder";
import { getHardwareIconFragment } from "../../src/widgets/icons/hardware-icons";

const CPU_ICON_FRAGMENT = getHardwareIconFragment("cpu");

const CPU_USAGE_WIDGET_DATA: WidgetData = {
    current: 40,
    progress: 0.4,
    history: [12, 18, 28, 34, 40, 52, 48, 60, 55, 68, 62, 74, 70],
    unit: "%",
    label: "CPU",
    displayValue: "40",
    sampleTimestampMilliseconds: 1,
};

interface TerminalVisualWidgetTestCase {
    readonly snapshotName: string;
    readonly appearance: ResolvedAppearanceSettingsOverride;
    readonly data: WidgetData;
    readonly centerIcon?: string;
    readonly footerIcon?: string;
    readonly topIcon?: string;
}

const TERMINAL_VISUAL_TEST_CASES: readonly TerminalVisualWidgetTestCase[] = [
    {
        snapshotName: "terminal-clean-single-circle-full-ring-terminal-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "circle",
            circleVariant: "full-ring",
            variant: "clean",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "terminal-clean-single-circle-minimal-icon-terminal-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "circle",
            circleVariant: "minimal",
            variant: "clean",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "terminal-clean-single-circle-gauge-terminal-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
            variant: "clean",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "terminal-clean-single-progress-bar-terminal-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "bar",
            circleVariant: "full-ring",
            variant: "clean",
        }),
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            barLabel: "CPU Load",
            secondaryDisplayValue: "OK",
        },
        centerIcon: CPU_ICON_FRAGMENT,
        topIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "terminal-clean-single-sparkline-terminal-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "line",
            circleVariant: "full-ring",
            variant: "clean",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_ICON_FRAGMENT,
        topIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "terminal-vintage-single-circle-full-ring-green-phosphor-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "circle",
            circleVariant: "full-ring",
            variant: "vintage",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "terminal-vintage-single-circle-minimal-icon-green-phosphor-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "circle",
            circleVariant: "minimal",
            variant: "vintage",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "terminal-vintage-single-circle-gauge-green-phosphor-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "circle",
            circleVariant: "gauge",
            variant: "vintage",
        }),
        data: CPU_USAGE_WIDGET_DATA,
    },
    {
        snapshotName: "terminal-vintage-single-progress-bar-green-phosphor-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "bar",
            circleVariant: "full-ring",
            variant: "vintage",
        }),
        data: {
            ...CPU_USAGE_WIDGET_DATA,
            barLabel: "CPU Load",
            secondaryDisplayValue: "OK",
        },
        centerIcon: CPU_ICON_FRAGMENT,
        topIcon: CPU_ICON_FRAGMENT,
    },
    {
        snapshotName: "terminal-vintage-single-sparkline-green-phosphor-screen",
        appearance: buildTerminalAppearanceOverride({
            selectedView: "line",
            circleVariant: "full-ring",
            variant: "vintage",
        }),
        data: CPU_USAGE_WIDGET_DATA,
        centerIcon: CPU_ICON_FRAGMENT,
        topIcon: CPU_ICON_FRAGMENT,
    },
];

for (const testCase of TERMINAL_VISUAL_TEST_CASES) {
    test(`renders ${testCase.snapshotName}`, () => {
        const svg = renderSingleMetricWidgetSvg({
            appearance: testCase.appearance,
            data: testCase.data,
            centerIcon: testCase.centerIcon ?? "",
            footerIcon: testCase.footerIcon,
            topIcon: testCase.topIcon,
            keySize: WIDGET_LOGICAL_SIZE,
        });
        const pngBuffer = renderSvgToPngBuffer(svg, WIDGET_LOGICAL_SIZE);

        expect(pngBuffer).toMatchSnapshot(`${testCase.snapshotName}.png`);
    });
}

function buildTerminalAppearanceOverride(options: {
    selectedView: "circle" | "text" | "bar" | "line";
    circleVariant: "full-ring" | "minimal" | "gauge";
    variant: "clean" | "vintage";
}): ResolvedAppearanceSettingsOverride {
    return {
        view: {
            selectedView: options.selectedView,
            circleVariant: options.circleVariant,
        },
        theme: {
            selectedTheme: "terminal",
            terminal: {
                variant: options.variant,
            },
            flat: {
                paint: {
                    colorMode: "solid",
                    solid: {
                        colors: { usageColor: "#ef4444" },
                    },
                },
            },
        },
    };
}

function renderSingleMetricWidgetSvg(options: {
    appearance: ResolvedAppearanceSettingsOverride;
    data: WidgetData;
    centerIcon: string;
    footerIcon?: string;
    topIcon?: string;
    keySize: KeySize;
}): string {
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings(options.appearance));
    const body = renderSingleMetricBodyView({
        data: options.data,
        visual: visualSettings,
        renderSize: options.keySize,
        centerIcon: options.centerIcon,
        footerIcon: options.footerIcon,
        topIcon: options.topIcon,
        circleVariant: visualSettings.circleVariant,
    });

    return renderMetricFrame({
        bodies: [{ svg: body, muted: false }],
        themePreset: visualSettings.themePreset,
        themePaints: visualSettings.paints,
        themeChromeOpacity: visualSettings.transparentSurface.backgroundOpacity,
        size: options.keySize,
    });
}

function renderSvgToPngBuffer(svg: string, keySize: KeySize): Buffer {
    const renderedImage = new Resvg(svg, {
        fitTo: {
            mode: "width",
            value: keySize.width,
        },
        font: resolveResvgFontOptions(svg),
    }).render();

    return Buffer.from(renderedImage.asPng());
}
