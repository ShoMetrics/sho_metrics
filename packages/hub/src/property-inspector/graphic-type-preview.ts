import { composeSvg } from "../rendering/composer";
import type { WidgetData } from "../rendering/widget-data";
import { WIDGET_LOGICAL_SIZE } from "../rendering/widget-data";
import type { GraphicType } from "../widgets/widget.interface";

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
 * rendering. The PI consumes it as an image data URI so renderer-owned SVG is
 * not injected into the browser DOM.
 */
export function buildGraphicTypePreviewUri(graphicType: GraphicType): string {
    const svg = composeSvg(previewData, {
        graphicType,
        graphicStyle: "flat",
        colorConfig: {
            mode: "solid",
            solidColor: "#3b82f6",
            thresholds: [],
        },
        configOverrides: {
            lineSmoothingPercent: 75,
            gridLineVisibility: "adaptive",
            gridLineType: "horizontal",
        },
    }, WIDGET_LOGICAL_SIZE);

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
