import { renderMetricFrame } from "../../rendering/metric-frame";
import { renderSingleMetricBodyView } from "../../rendering/single-metric-view";
import type { WidgetData } from "../../rendering/widget-data";
import { WIDGET_LOGICAL_SIZE } from "../../rendering/widget-data";
import type { GraphicType } from "../inspector/settings-types";

const previewData: WidgetData = {
    current: 68,
    progress: 0.68,
    history: [18, 24, 21, 36, 31, 47, 42, 58, 53, 69, 62, 76, 68],
    unit: "%",
    label: "CPU",
    displayValue: "68",
    sampleTimestampMilliseconds: 1,
};

/**
 * Generates static preview art through the same widget renderer used by key
 * rendering. The Property Inspector consumes it as an image data URI so renderer-owned SVG is
 * not injected into the browser DOM.
 */
export function buildGraphicTypePreviewUri(graphicType: GraphicType): string {
    const body = renderSingleMetricBodyView({
        data: previewData,
        visual: {
            graphicType,
            colorConfig: {
                mode: "solid",
                solidColor: "#3b82f6",
                thresholds: [],
            },
            lineSmoothingPercent: 75,
            gridLineVisibility: "adaptive",
            gridLineType: "horizontal",
        },
        renderSize: WIDGET_LOGICAL_SIZE,
        centerIcon: "",
        circleStyle: "value",
    });
    const svg = renderMetricFrame({
        body,
        graphicStyle: "flat",
        muted: false,
        size: WIDGET_LOGICAL_SIZE,
    });

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
