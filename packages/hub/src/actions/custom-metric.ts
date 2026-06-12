import streamDeck, {
    action,
    type SendToPluginEvent,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
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
import { NodeCustomHttpFetcher, type CustomHttpFetcher } from "../runtime/sources/custom-http/custom-http-fetcher";
import {
    buildCustomHttpRuntimeIdentity,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    type CustomHttpRuntimeIdentity,
} from "../runtime/sources/custom-http/custom-http-metric-key";
import {
    readCustomHttpPiTestRequest,
    type CustomHttpPiFetchSampleResult,
    type CustomHttpPiTestResponse,
    type CustomHttpPiTransformResult,
} from "../runtime/sources/custom-http/custom-http-pi-test-messages";
import { validateCustomHttpMetricTransformOutput } from "../runtime/sources/custom-http/custom-http-output-schema";
import {
    CustomHttpTransformWorkerPool,
    type CustomHttpTransformRunner,
} from "../runtime/sources/custom-http/custom-http-transform-worker-pool";
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
import {
    getCustomMetricIconFragment,
    getDefaultCustomMetricIconFragment,
} from "../widgets/icons/custom-metric-icons";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS } from "../widgets/primitives/progress-circle-label";

const CUSTOM_METRIC_DEFAULT_LABEL = "HTTP";
const CUSTOM_METRIC_CONFIGURE_RENDER_KEY = "custom-http.configure";
const CUSTOM_METRIC_ERROR_RENDER_KEY = "custom-http.error";
const CUSTOM_METRIC_CONFIGURE_NOTICE_TEXT = "Configure";
const CUSTOM_METRIC_ERROR_NOTICE_TEXT = "Error";
const CUSTOM_METRIC_SAMPLE_PREVIEW_LIMIT_CHARACTERS = 4096;

interface CustomMetricOptions {
    readonly definitionRegistry?: CustomHttpDefinitionRegistry;
    readonly fetcher?: CustomHttpFetcher;
    readonly transformRunner?: CustomHttpTransformRunner;
}

interface CustomHttpWidgetDataResult {
    readonly widgetData: WidgetData;
    readonly suggestedLucideIconId: string | undefined;
}

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric })
export class CustomMetric extends MetricAction {
    protected readonly actionKind = "customMetric";

    private readonly definitionRegistry: CustomHttpDefinitionRegistry;
    private readonly fetcher: CustomHttpFetcher;
    // PI transform tests use an action-local lazy runner instead of sharing the
    // runtime source client. This keeps preview/test work out of polling state.
    private readonly transformRunner: CustomHttpTransformRunner;
    private readonly activeIdentitiesByActionId = new Map<string, CustomHttpRuntimeIdentity>();
    // Sample bodies are action-local PI scratch state only. They are never
    // persisted, and transform tests must match the URL that produced them.
    private readonly sampleCacheByActionId = new Map<string, {
        readonly url: string;
        readonly responseText: string;
    }>();

    constructor(options: CustomMetricOptions = {}) {
        super();
        this.definitionRegistry = options.definitionRegistry ?? customHttpDefinitionRegistry;
        this.fetcher = options.fetcher ?? new NodeCustomHttpFetcher();
        this.transformRunner = options.transformRunner ?? new CustomHttpTransformWorkerPool();
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
        this.sampleCacheByActionId.delete(event.action.id);
    }

    override onSendToPlugin(event: SendToPluginEvent<never, Record<string, never>>): void {
        super.onSendToPlugin(event);

        const request = readCustomHttpPiTestRequest(event.payload);
        if (request === undefined) {
            return;
        }

        if (request.command === "fetchSample") {
            void this.fetchSampleForPropertyInspector(event.action.id, request.url)
                .then(result => this.sendCustomMetricTestResponse(event, {
                    type: request.type,
                    command: request.command,
                    requestId: request.requestId,
                    result,
                }));
            return;
        }

        void this.testTransformForPropertyInspector(event.action.id, request.url, request.jqTransform)
            .then(result => this.sendCustomMetricTestResponse(event, {
                type: request.type,
                command: request.command,
                requestId: request.requestId,
                result,
            }));
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

    protected sendCustomMetricTestResponse(
        event: SendToPluginEvent<never, Record<string, never>>,
        response: CustomHttpPiTestResponse,
    ): Promise<void> {
        if (streamDeck.ui.action?.id !== event.action.id) {
            return Promise.resolve();
        }

        return streamDeck.ui.sendToPropertyInspector(
            response as unknown as Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0],
        );
    }

    private async fetchSampleForPropertyInspector(
        actionId: string,
        url: string,
    ): Promise<CustomHttpPiFetchSampleResult> {
        const fetchResult = await this.fetcher.fetchJson(url);
        if (!fetchResult.ok) {
            this.sampleCacheByActionId.delete(actionId);
            return {
                ok: false,
                stage: fetchResult.reason,
                detail: fetchResult.detail,
            };
        }

        this.sampleCacheByActionId.set(actionId, {
            url,
            responseText: fetchResult.responseText,
        });
        const samplePreview = buildSamplePreview(fetchResult.responseText, CUSTOM_METRIC_SAMPLE_PREVIEW_LIMIT_CHARACTERS);

        return {
            ok: true,
            responseBytes: Buffer.byteLength(fetchResult.responseText, "utf8"),
            samplePreview: samplePreview.text,
            isSamplePreviewTruncated: samplePreview.isTruncated,
        };
    }

    private async testTransformForPropertyInspector(
        actionId: string,
        url: string,
        jqTransform: string,
    ): Promise<CustomHttpPiTransformResult> {
        const cachedSample = this.sampleCacheByActionId.get(actionId);
        if (cachedSample === undefined || cachedSample.url !== url) {
            return {
                ok: false,
                stage: "sample",
                detail: "Fetch a sample for the current URL before testing the transform.",
            };
        }

        let inputJson: unknown;
        try {
            inputJson = JSON.parse(cachedSample.responseText);
        } catch {
            return {
                ok: false,
                stage: "json",
                detail: "HTTP response was not valid JSON.",
            };
        }

        const transformResult = await this.transformRunner.runTransform({ inputJson, jqTransform });
        if (!transformResult.ok) {
            return {
                ok: false,
                stage: transformResult.reason === "jqFailure" ? "jq" : transformResult.reason,
                detail: transformResult.detail,
            };
        }

        const validationResult = validateCustomHttpMetricTransformOutput(transformResult.output);
        if (!validationResult.ok) {
            return {
                ok: false,
                stage: "schema",
                detail: validationResult.reason,
            };
        }

        const output = validationResult.output;
        return {
            ok: true,
            metric: {
                label: output.label,
                value: output.value,
                unitText: output.customUnit ?? formatMetricUnit(output.unit),
                ...(output.maximum === undefined ? {} : { maximum: output.maximum }),
                ...(output.suggestedLucideIconId === undefined ? {} : {
                    suggestedLucideIconId: output.suggestedLucideIconId,
                }),
            },
        };
    }
}

export function buildCustomMetricViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedCustomMetricTarget;
    readonly metrics?: MetricStoreReader;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const baseIcons = buildCustomMetricViewIcons({
        storedIconId: options.target.iconId,
        suggestedIconId: undefined,
    });
    const baseOptions = {
        event: options.event,
        metricRenderKind: "singleMetric" as const,
        resolvedSettings: widget.slot.appearance,
        ...baseIcons,
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

            const widgetDataResult = readCustomHttpWidgetData({
                metrics: options.metrics,
                metricKey: identity.metricKey,
                shouldCompactCircleLabel: widget.slot.appearance.view.selectedView === "circle"
                    && widget.slot.appearance.view.circleVariant !== "minimal",
            });

            return {
                ...baseOptions,
                centerIconFragment: buildCustomMetricViewIcons({
                    storedIconId: options.target.iconId,
                    suggestedIconId: widgetDataResult.suggestedLucideIconId,
                }).centerIconFragment,
                metricKey: identity.metricKey,
                widgetData: widgetDataResult.widgetData,
            };
        }
    }
}

function buildCustomMetricViewIcons(options: {
    readonly storedIconId: string | undefined;
    readonly suggestedIconId: string | undefined;
}): ReturnType<typeof buildMetricViewIcons> {
    const fallbackIcons = buildMetricViewIcons({ hardware: "unknown", status: "percentage" });
    return {
        ...fallbackIcons,
        centerIconFragment: getCustomMetricIconFragment(options.storedIconId)
            ?? getCustomMetricIconFragment(options.suggestedIconId)
            ?? getDefaultCustomMetricIconFragment(),
    };
}

function readCustomHttpWidgetData(options: {
    readonly metrics: MetricStoreReader;
    readonly metricKey: string;
    readonly shouldCompactCircleLabel: boolean;
}): CustomHttpWidgetDataResult {
    const readResult = options.metrics.getWidgetDataWithAttribution(
        options.metricKey,
        CUSTOM_METRIC_DEFAULT_LABEL,
        "",
    );
    const displayHint = readResult.valueAttribution?.displayHint;
    const label = resolveCustomHttpLabel(displayHint, options.shouldCompactCircleLabel);
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
            widgetData: {
                ...widgetData,
                unavailableDisplayValue: readResult.unavailableMetric === undefined
                    ? PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE
                    : undefined,
            },
            suggestedLucideIconId: displayHint?.suggestedLucideIconId,
        };
    }

    // Custom unit text is already the user-facing provider unit; catalog
    // formatting is allowed to rewrite unit text only for known ShoMetrics units.
    if (displayHint?.customUnit !== undefined) {
        return {
            widgetData,
            suggestedLucideIconId: displayHint.suggestedLucideIconId,
        };
    }

    return {
        widgetData: displayHint?.unit === undefined
            ? widgetData
            : formatCatalogMetricFreshWidgetData({
            widgetData,
            unit: displayHint.unit,
            category: "other",
        }),
        suggestedLucideIconId: displayHint?.suggestedLucideIconId,
    };
}

function resolveCustomHttpLabel(
    displayHint: MetricValueDisplayHint | undefined,
    shouldCompactCircleLabel: boolean,
): string {
    const trimmedLabel = (displayHint?.label ?? CUSTOM_METRIC_DEFAULT_LABEL).trim();
    const label = trimmedLabel.length === 0 ? CUSTOM_METRIC_DEFAULT_LABEL : trimmedLabel;
    if (!shouldCompactCircleLabel) {
        return label;
    }

    const labelCharacters = Array.from(label);
    if (labelCharacters.length <= PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS) {
        return label;
    }

    // Custom HTTP labels come from user or AI-authored transforms. The
    // full-ring and gauge circle renderers have a four-character center-label
    // contract, while text/bar/line views can keep the full source label.
    const wordInitials = label
        .split(/[\s._-]+/u)
        .filter(word => word.length > 0)
        .map(word => Array.from(word)[0])
        .join("");
    const compactLabel = wordInitials.length >= 2 ? wordInitials : label;
    return Array.from(compactLabel.toUpperCase())
        .slice(0, PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS)
        .join("");
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

function buildSamplePreview(value: string, maxCharacters: number): {
    readonly text: string;
    readonly isTruncated: boolean;
} {
    return value.length <= maxCharacters
        ? {
            text: value,
            isTruncated: false,
        }
        : {
            text: `${value.slice(0, maxCharacters)}...`,
            isTruncated: true,
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
