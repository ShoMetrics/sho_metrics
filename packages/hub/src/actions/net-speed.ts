import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import type { WidgetData } from "../rendering/widget-data";

/**
 * Network Speed action.
 * A circle visual fits one-way single-value data. Download or upload speed can
 * use a circle independently, but combined download/upload needs another graph.
 */
@action({ UUID: "com.ez.sho-metrics.net-speed" })
export class NetSpeed extends MetricAction {
    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = event.payload.settings as Record<string, unknown>;
        const direction = normalizeNetworkDirection(settings.networkDirection);
        const download = metricStore.getWidgetData("net.down", "Download", "MB/s");
        const upload = metricStore.getWidgetData("net.up", "Upload", "MB/s");

        if (event.action.isDial()) {
            event.action.setFeedback({
                title: "Net Speed",
                value: `D:${download.current.toFixed(1)} U:${upload.current.toFixed(1)}`,
            });
            return;
        }

        if (!direction) {
            event.action.setTitle("Choose\nUpload/Download");
            return;
        }

        setSingleMetricDisplay({
            event,
            widgetData: buildNetworkWidgetData(direction === "download" ? download : upload),
            centerIconFragment: direction === "download" ? renderDownloadIconFragment() : renderUploadIconFragment(),
        });
    }
}

type NetworkDirection = "download" | "upload";

function normalizeNetworkDirection(value: unknown): NetworkDirection | null {
    if (value === "download" || value === "upload") {
        return value;
    }

    return null;
}

function buildNetworkWidgetData(data: WidgetData): WidgetData {
    const historyMaximum = Math.max(...data.history, data.current, 1);
    const scaleMaximum = Math.max(10, Math.ceil(historyMaximum / 10) * 10);

    return {
        ...data,
        progress: Math.min(Math.max(data.current / scaleMaximum, 0), 1),
    };
}

function renderDownloadIconFragment(): string {
    return renderNetworkArrowIconFragment("download");
}

function renderUploadIconFragment(): string {
    return renderNetworkArrowIconFragment("upload");
}

function renderNetworkArrowIconFragment(direction: NetworkDirection): string {
    if (direction === "download") {
        return `
            <g fill="none" stroke="rgba(255,255,255,0.88)" stroke-linecap="round" stroke-linejoin="round">
                <path d="M 0 -28 L 0 12" stroke-width="7" />
                <path d="M -16 -4 L 0 14 L 16 -4" stroke-width="7" />
                <path d="M -22 26 L 22 26" stroke-width="6" opacity="0.82" />
            </g>
        `;
    }

    return `
        <g fill="none" stroke="rgba(255,255,255,0.88)" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 0 28 L 0 -12" stroke-width="7" />
            <path d="M -16 4 L 0 -14 L 16 4" stroke-width="7" />
            <path d="M -22 -26 L 22 -26" stroke-width="6" opacity="0.82" />
        </g>
    `;
}
