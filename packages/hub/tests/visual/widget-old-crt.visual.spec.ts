import path from "node:path";
import { expect, test } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { renderMetricFrame } from "../../src/rendering/metric-frame";
import { renderSingleMetricBodyView } from "../../src/rendering/single-metric-view";
import { WIDGET_LOGICAL_SIZE, type KeySize, type WidgetData } from "../../src/rendering/widget-data";
import { buildDefaultAppearanceSettings } from "../../src/settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../src/settings/render-appearance-builder";

const INTER_FONT_FILE = path.resolve(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf");

const CPU_USAGE_WIDGET_DATA: WidgetData = {
    current: 40,
    progress: 0.4,
    history: [12, 18, 28, 34, 40, 52, 48, 60, 55, 68, 62, 74, 70],
    unit: "%",
    label: "CPU",
    displayValue: "40",
    sampleTimestampMilliseconds: 1,
};

test("renders old-crt-single-circular-value-fixed-phosphor-screen", () => {
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings({
        graph: {
            viewLayout: "circular",
            circleStyle: "value",
        },
        theme: {
            selectedTheme: "old-crt",
        },
        paint: {
            metric: {
                colorMode: "solid",
                solid: {
                    colors: { usageColor: "#ef4444" },
                },
            },
        },
    }));
    const body = renderSingleMetricBodyView({
        data: CPU_USAGE_WIDGET_DATA,
        visual: visualSettings,
        renderSize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        circleStyle: visualSettings.circleStyle,
    });
    const svg = renderMetricFrame({
        body,
        graphicStyle: visualSettings.graphicStyle,
        muted: false,
        paints: visualSettings.paints,
        size: WIDGET_LOGICAL_SIZE,
    });
    const pngBuffer = renderSvgToPngBuffer(svg, WIDGET_LOGICAL_SIZE);

    expect(pngBuffer).toMatchSnapshot("old-crt-single-circular-value-fixed-phosphor-screen.png");
});

function renderSvgToPngBuffer(svg: string, keySize: KeySize): Buffer {
    const renderedImage = new Resvg(svg, {
        fitTo: {
            mode: "width",
            value: keySize.width,
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
