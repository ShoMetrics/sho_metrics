import { action, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import { formatCatalogMetricFreshWidgetData } from "../metrics/catalog-metric-widget-data";
import { formatMetricUnit } from "../metrics/metric-unit-format";
import type { MetricStoreReader } from "../runtime/metric-store";
import { buildCustomHttpMetricReadPlan } from "../runtime/source-routing/custom-http-read-plan";
import type { MetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import {
    customHttpDefinitionRegistry,
    type CustomHttpDefinitionRegistry,
} from "../runtime/sources/custom-http/custom-http-definition-registry";
import {
    buildCustomHttpRuntimeIdentity,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    type CustomHttpRuntimeIdentity,
} from "../runtime/sources/custom-http/custom-http-metric-key";
import { MetricUnit } from "../runtime/sources/metric-source";
import type { MetricValueDisplayHint } from "../runtime/sources/source-client";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import {
    type ResolvedCustomMetricTarget,
    type ResolvedSingleCustomHttpRequest,
    requireResolvedSingleMetricWidget,
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import { setMetricView, type SingleMetricViewOptions } from "../view-updates/runner";
import {
    PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    type WidgetData,
} from "../view-rendering/widget-data";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";

const CUSTOM_METRIC_DEFAULT_LABEL = "HTTP";
const CUSTOM_METRIC_CONFIGURE_RENDER_KEY = "custom-http.configure";
const CUSTOM_METRIC_ERROR_RENDER_KEY = "custom-http.error";
const CUSTOM_METRIC_CONFIGURE_NOTICE_TEXT = "Configure";
const CUSTOM_METRIC_ERROR_NOTICE_TEXT = "Error";

interface CustomMetricOptions {
    readonly definitionRegistry?: CustomHttpDefinitionRegistry;
}

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric })
export class CustomMetric extends MetricAction {
    protected readonly actionKind = "customMetric";

    private readonly definitionRegistry: CustomHttpDefinitionRegistry;
    private readonly activeIdentitiesByActionId = new Map<string, CustomHttpRuntimeIdentity>();

    constructor(options: CustomMetricOptions = {}) {
        super();
        this.definitionRegistry = options.definitionRegistry ?? customHttpDefinitionRegistry;
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const identity = resolveConfiguredCustomHttpIdentity(event, this.resolveSettings(event));
        return identity === undefined ? [] : [identity.metricKey];
    }

    protected override buildMetricCollectionReadPlan(
        event: WillAppearEvent,
        metricKeys: readonly string[],
    ): MetricReadPlan {
        void metricKeys;
        const identity = this.activeIdentitiesByActionId.get(event.action.id);
        if (identity === undefined) {
            throw new Error("Custom Metric read plan requested before runtime definition registration.");
        }

        return buildCustomHttpMetricReadPlan([identity]);
    }

    protected override onResolvedSettingsChanged(event: WillAppearEvent, settings: ResolvedWidgetSettings): void {
        const nextIdentity = resolveConfiguredCustomHttpIdentity(event, settings);
        const previousIdentity = this.activeIdentitiesByActionId.get(event.action.id);

        if (nextIdentity === undefined) {
            if (previousIdentity !== undefined) {
                this.definitionRegistry.unregister(previousIdentity.metricKey);
                this.activeIdentitiesByActionId.delete(event.action.id);
            }
            return;
        }

        if (previousIdentity !== undefined && previousIdentity.metricKey !== nextIdentity.metricKey) {
            this.definitionRegistry.unregister(previousIdentity.metricKey);
        }

        const request = readConfiguredCustomHttpRequest(settings);
        if (request === undefined) {
            throw new Error("Custom Metric identity resolved without a configured HTTP request.");
        }

        if (previousIdentity === undefined || previousIdentity.metricKey !== nextIdentity.metricKey) {
            this.definitionRegistry.register({ identity: nextIdentity, request });
        } else {
            this.definitionRegistry.replace({ identity: nextIdentity, request });
        }
        this.activeIdentitiesByActionId.set(event.action.id, nextIdentity);
    }

    protected override onActionWillDisappear(event: WillDisappearEvent): void {
        const identity = this.activeIdentitiesByActionId.get(event.action.id);
        if (identity !== undefined) {
            this.definitionRegistry.unregister(identity.metricKey);
            this.activeIdentitiesByActionId.delete(event.action.id);
        }
    }

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "customMetric");

        setMetricView(buildCustomMetricViewOptions({
            event,
            settings,
            target,
            ...(target.configuration.state === "configured" ? { metrics: this.getMetricReader(event) } : {}),
        }));
    }
}

export function buildCustomMetricViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedCustomMetricTarget;
    readonly metrics?: MetricStoreReader;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const baseOptions = {
        event: options.event,
        metricRenderKind: "singleMetric" as const,
        resolvedSettings: widget.slot.appearance,
        ...buildMetricViewIcons({ hardware: "unknown", status: "percentage" }),
    };

    switch (options.target.configuration.state) {
        case "unconfigured":
            return {
                ...baseOptions,
                metricKey: CUSTOM_METRIC_CONFIGURE_RENDER_KEY,
                widgetData: buildEmptyCustomMetricWidgetData(),
                noticeText: CUSTOM_METRIC_CONFIGURE_NOTICE_TEXT,
            };
        case "invalid":
            return {
                ...baseOptions,
                metricKey: CUSTOM_METRIC_ERROR_RENDER_KEY,
                widgetData: buildEmptyCustomMetricWidgetData(),
                noticeText: CUSTOM_METRIC_ERROR_NOTICE_TEXT,
            };
        case "configured": {
            if (options.metrics === undefined) {
                throw new Error("Configured Custom Metric rendering requires a metric reader.");
            }
            const identity = buildCustomHttpRuntimeIdentity({
                url: options.target.configuration.source.plan.request.url,
                actionId: options.event.action.id,
                consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
            });

            return {
                ...baseOptions,
                metricKey: identity.metricKey,
                widgetData: readCustomHttpWidgetData({
                    metrics: options.metrics,
                    metricKey: identity.metricKey,
                }),
            };
        }
    }
}

function readCustomHttpWidgetData(options: {
    readonly metrics: MetricStoreReader;
    readonly metricKey: string;
}): WidgetData {
    const readResult = options.metrics.getWidgetDataWithAttribution(
        options.metricKey,
        CUSTOM_METRIC_DEFAULT_LABEL,
        "",
    );
    const displayHint = readResult.valueAttribution?.displayHint;
    const label = displayHint?.label ?? CUSTOM_METRIC_DEFAULT_LABEL;
    const unit = resolveCustomHttpUnitText(displayHint);
    const maximum = resolveCustomHttpMaximum(displayHint);
    const progress = maximum === undefined
        ? 0
        : Math.min(Math.max(readResult.widgetData.current / maximum, 0), 1);
    const widgetData = {
        ...readResult.widgetData,
        label,
        unit,
        progress,
        ...(maximum === undefined
            ? {}
            : {
                sparklineScale: {
                    mode: "fixed" as const,
                    minimumValue: 0,
                    maximumValue: maximum,
                },
            }),
    };

    if (widgetData.sampleTimestampMilliseconds === undefined) {
        return {
            ...widgetData,
            unavailableDisplayValue: readResult.unavailableMetric === undefined
                ? PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE
                : undefined,
        };
    }

    // Custom unit text is already the user-facing provider unit; catalog
    // formatting is allowed to rewrite unit text only for known ShoMetrics units.
    if (displayHint?.customUnit !== undefined) {
        return widgetData;
    }

    return displayHint?.unit === undefined
        ? widgetData
        : formatCatalogMetricFreshWidgetData({
            widgetData,
            unit: displayHint.unit,
            category: "other",
        });
}

function resolveCustomHttpUnitText(displayHint: MetricValueDisplayHint | undefined): string {
    if (displayHint?.customUnit !== undefined) {
        return displayHint.customUnit;
    }

    return displayHint?.unit === undefined ? "" : formatMetricUnit(displayHint.unit);
}

function resolveCustomHttpMaximum(displayHint: MetricValueDisplayHint | undefined): number | undefined {
    if (displayHint?.maximum !== undefined) {
        return displayHint.maximum;
    }

    return displayHint?.unit === MetricUnit.PERCENT ? 100 : undefined;
}

function buildEmptyCustomMetricWidgetData(): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        label: CUSTOM_METRIC_DEFAULT_LABEL,
        unit: "",
    };
}

function resolveConfiguredCustomHttpIdentity(
    event: WillAppearEvent,
    settings: ResolvedWidgetSettings,
): CustomHttpRuntimeIdentity | undefined {
    const request = readConfiguredCustomHttpRequest(settings);
    return request === undefined
        ? undefined
        : buildCustomHttpRuntimeIdentity({
            url: request.url,
            actionId: event.action.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });
}

function readConfiguredCustomHttpRequest(
    settings: ResolvedWidgetSettings,
): ResolvedSingleCustomHttpRequest | undefined {
    const target = readResolvedMetricTarget(settings, "customMetric");
    if (target.configuration.state !== "configured") {
        return undefined;
    }

    const source = target.configuration.source;
    if (source.kind !== "http") {
        return undefined;
    }

    const plan = source.plan;
    return plan.kind === "singleRequest" ? plan.request : undefined;
}
