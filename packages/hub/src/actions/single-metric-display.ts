import type { WillAppearEvent } from "@elgato/streamdeck";
import { composeSvg } from "../rendering/composer";
import { rasterizeSvgToPngDataUrl } from "../rendering/rasterizer";
import { KEY_SIZE_144 } from "../rendering/widget-data";
import type { WidgetData } from "../rendering/widget-data";
import { resolveMetricVisualSettings } from "./metric-visual-settings";

export interface SingleMetricDisplayOptions {
    event: WillAppearEvent;
    widgetData: WidgetData;
    centerIconFragment: string;
}

export function setSingleMetricDisplay(options: SingleMetricDisplayOptions): void {
    const settings = options.event.payload.settings as Record<string, unknown>;
    const visualSettings = resolveMetricVisualSettings(settings);

    options.event.action.setTitle("");

    const svg = composeSvg(options.widgetData, {
        ...visualSettings,
        configOverrides: buildSingleMetricConfigOverrides(settings, visualSettings.graphicType, options.centerIconFragment),
    }, KEY_SIZE_144);
    const pngDataUrl = rasterizeSvgToPngDataUrl(svg, KEY_SIZE_144.width);

    if (pngDataUrl) {
        options.event.action.setImage(pngDataUrl);
    }
}

function buildSingleMetricConfigOverrides(
    settings: Record<string, unknown>,
    graphicType: string,
    centerIconFragment: string,
): Record<string, unknown> {
    if (graphicType !== "circular") {
        return {};
    }

    return {
        centerContent: settings.circularCenterContent === "icon" ? "icon" : "value",
        centerIconFragment,
    };
}
