import path from "node:path";
import { expect, test } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { renderMetricFrame } from "../../src/view-rendering/frame/metric-frame";
import { renderSingleMetricBodyView } from "../../src/view-rendering/views/single-metric-view";
import {
    WIDGET_LOGICAL_SIZE,
    type WidgetData,
} from "../../src/view-rendering/widget-data";
import { buildDefaultAppearanceSettings } from "../../src/settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../src/settings/render-appearance-builder";

const INTER_FONT_FILE = path.resolve(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf");

const UNIT_CASES: readonly {
    readonly snapshotSegment: string;
    readonly unit: string;
    readonly renderedUnit: string;
    readonly label: string;
}[] = [
    { snapshotSegment: "percent", unit: "%", renderedUnit: "%", label: "CPU" },
    { snapshotSegment: "temperature", unit: "°C", renderedUnit: "°C", label: "GPU" },
];

const VALUE_CASES: readonly {
    readonly snapshotSegment: string;
    readonly value: string;
    readonly progress: number;
}[] = [
    { snapshotSegment: "1-digit", value: "8", progress: 0.08 },
    { snapshotSegment: "2-digits", value: "38", progress: 0.38 },
    { snapshotSegment: "100-percent", value: "100", progress: 1 },
    { snapshotSegment: "3-digits", value: "128", progress: 1 },
    { snapshotSegment: "4-digits", value: "1024", progress: 1 },
];

for (const valueCase of VALUE_CASES) {
    for (const unitCase of UNIT_CASES) {
        test(`renders single gauge ${valueCase.snapshotSegment} ${unitCase.snapshotSegment}`, () => {
            const svg = renderSingleGaugeWidgetSvg({
                valueText: valueCase.value,
                unitText: unitCase.unit,
                labelText: unitCase.label,
                progress: valueCase.progress,
            });
            const pngBuffer = renderSingleGaugeWidgetPng(svg);

            expect(Array.from(unitCase.renderedUnit).length).toBeLessThanOrEqual(2);
            expect(svg).toContain(`>${unitCase.renderedUnit}</text>`);
            expect(pngBuffer).toMatchSnapshot(
                `single-gauge-${valueCase.snapshotSegment}-${unitCase.snapshotSegment}.png`,
            );
        });
    }
}

function renderSingleGaugeWidgetPng(svg: string): Buffer {
    const renderedImage = new Resvg(svg, {
        fitTo: {
            mode: "width",
            value: WIDGET_LOGICAL_SIZE.width,
        },
        font: {
            loadSystemFonts: false,
            fontFiles: [INTER_FONT_FILE],
            defaultFontFamily: "Inter",
            sansSerifFamily: "Inter",
        },
    }).render();

    return Buffer.from(renderedImage.asPng());
}

function renderSingleGaugeWidgetSvg(options: {
    readonly valueText: string;
    readonly unitText: string;
    readonly labelText: string;
    readonly progress: number;
}): string {
    const widgetData: WidgetData = {
        current: Number(options.valueText),
        progress: options.progress,
        history: [],
        unit: options.unitText,
        label: options.labelText,
        displayValue: options.valueText,
        sampleTimestampMilliseconds: 1,
    };
    const resolvedSettings = buildDefaultAppearanceSettings({
        view: {
            selectedView: "circle",
            circleVariant: "gauge",
        },
    });
    const visual = buildMetricRenderAppearance(resolvedSettings);
    const body = renderSingleMetricBodyView({
        data: widgetData,
        visual,
        renderSize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        circleVariant: "gauge",
    });

    return renderMetricFrame({
        bodies: [{ svg: body, muted: false }],
        themePreset: visual.themePreset,
        themePaints: visual.paints,
        themeChromeOpacity: visual.transparentSurface.backgroundOpacity,
        size: WIDGET_LOGICAL_SIZE,
    });
}
