import { renderMetricFrame } from "../../rendering/metric-frame";
import { renderSingleMetricBodyView } from "../../rendering/single-metric-view";
import type { WidgetData } from "../../rendering/widget-data";
import { WIDGET_LOGICAL_SIZE } from "../../rendering/widget-data";
import { getHardwareIconFragment } from "../../widgets/icons/hardware-icons";
import { getMetricStatusIcon } from "../../widgets/icons/metric-status-icons";
import type { CircleStyle } from "../inspector/action-kind";

const previewData: WidgetData = {
    current: 68,
    progress: 0.68,
    history: [18, 24, 21, 36, 31, 47, 42, 58, 53, 69, 62, 76, 68],
    unit: "%",
    label: "VRAM",
    displayValue: "68",
    sampleTimestampMilliseconds: 1,
};

export function buildCircleStylePreviewUri(circleStyle: CircleStyle): string {
    const body = renderSingleMetricBodyView({
        data: previewData,
        visual: {
            graphicType: "circular",
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
        centerIcon: getHardwareIconFragment("memory"),
        statusIcon: getMetricStatusIcon("percentage"),
        circleStyle,
    });
    const svg = renderMetricFrame({
        body,
        graphicStyle: "flat",
        muted: false,
        size: WIDGET_LOGICAL_SIZE,
    });

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
