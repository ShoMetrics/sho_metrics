import { renderMetricFrame } from "../../rendering/metric-frame";
import { renderSingleMetricBodyView } from "../../rendering/single-metric-view";
import type { WidgetData } from "../../rendering/widget-data";
import { WIDGET_LOGICAL_SIZE } from "../../rendering/widget-data";
import { buildDefaultAppearanceSettings } from "../../settings/default-appearance-settings";
import { buildMetricRenderAppearance } from "../../settings/visual-adapter";
import { getHardwareIconFragment } from "../../widgets/icons/hardware-icons";
import { getMetricStatusIcon } from "../../widgets/icons/metric-status-icons";
import type { CircleStyle } from "../inspector/settings-types";

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
    const visualSettings = buildMetricRenderAppearance(buildDefaultAppearanceSettings({
        graph: { circleStyle },
        metricColor: { colorMode: "solid" },
    }));
    const body = renderSingleMetricBodyView({
        data: previewData,
        visual: visualSettings,
        renderSize: WIDGET_LOGICAL_SIZE,
        centerIcon: getHardwareIconFragment("memory"),
        statusIcon: getMetricStatusIcon("percentage"),
        circleStyle: visualSettings.circleStyle,
    });
    const svg = renderMetricFrame({
        body,
        graphicStyle: visualSettings.graphicStyle,
        muted: false,
        paints: visualSettings.paints,
        size: WIDGET_LOGICAL_SIZE,
    });

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
