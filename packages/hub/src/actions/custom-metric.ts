import streamDeck, {
    action,
    type SendToPluginEvent,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import { buildCustomHttpMetricReadPlan } from "../runtime/source-routing/custom-http-read-plan";
import type { MetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import {
    customHttpDefinitionRegistry,
    type CustomHttpDefinitionRegistry,
} from "../runtime/sources/custom-http/custom-http-definition-registry";
import {
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "../runtime/sources/custom-http/custom-http-metric-key";
import {
    type CustomHttpSourceEditorResponse,
} from "../runtime/sources/custom-http/custom-http-source-editor-messages";
import type { CustomHttpFetcher } from "../runtime/sources/custom-http/custom-http-fetcher";
import type { CustomHttpTransformRunner } from "../runtime/sources/custom-http/custom-http-transform-worker-pool";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import {
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import { setMetricView } from "../view-updates/runner";
import { CustomHttpSourceEditorRequestHandler } from "./custom-metric/source-editor-request-handler";
import { buildCustomMetricViewOptions } from "./custom-metric/single-metric-view-options";
import {
    resolveCustomHttpMetricDefinition,
    resolveCustomHttpRuntimeIdentity,
} from "./custom-metric/runtime-source-definition";
import {
    type RegisteredCustomHttpMetricKeysByActionId,
    syncCustomHttpRuntimeDefinitionsForAction,
    unregisterCustomHttpRuntimeDefinitionsForAction,
} from "./custom-metric/runtime-source-registration";

export { buildCustomMetricViewOptions } from "./custom-metric/single-metric-view-options";

interface CustomMetricActionDependencies {
    /** Injectable dependency for unit tests; production uses the shared Custom HTTP registry. */
    readonly customHttpDefinitionRegistry?: CustomHttpDefinitionRegistry;
    /** Injectable dependency for unit tests; production performs real HTTP sample fetches. */
    readonly fetcher?: CustomHttpFetcher;
    /** Injectable dependency for unit tests; production runs jq through the worker pool. */
    readonly transformRunner?: CustomHttpTransformRunner;
}

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric })
export class CustomMetric extends MetricAction {
    protected readonly actionKind = "customMetric";

    private readonly customHttpDefinitionRegistry: CustomHttpDefinitionRegistry;
    private readonly sourceEditorRequestHandler: CustomHttpSourceEditorRequestHandler;
    private readonly registeredMetricKeysByActionId: RegisteredCustomHttpMetricKeysByActionId = new Map();

    constructor(options: CustomMetricActionDependencies = {}) {
        super();
        this.customHttpDefinitionRegistry = options.customHttpDefinitionRegistry ?? customHttpDefinitionRegistry;
        this.sourceEditorRequestHandler = new CustomHttpSourceEditorRequestHandler({
            fetcher: options.fetcher,
            transformRunner: options.transformRunner,
            sendResponse: (event, response) => this.sendCustomHttpSourceEditorResponse(event, response),
        });
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const target = readResolvedMetricTarget(this.resolveSettings(event), "customMetric");
        const identity = resolveCustomHttpRuntimeIdentity(event, target, CUSTOM_HTTP_SINGLE_CONSUMER_SLUG);
        return identity === undefined ? [] : [identity.metricKey];
    }

    protected override buildMetricCollectionReadPlan(
        event: WillAppearEvent,
        metricKeys: readonly string[],
    ): MetricReadPlan {
        void metricKeys;
        const activeMetricKeys = this.registeredMetricKeysByActionId.get(event.action.id);
        const metricKey = activeMetricKeys?.values().next().value;
        if (metricKey === undefined) {
            throw new Error("Custom Metric read plan requested before runtime definition registration.");
        }
        const definition = this.customHttpDefinitionRegistry.read(metricKey);
        if (definition === undefined) {
            throw new Error("Custom Metric read plan requested after runtime definition was removed.");
        }

        return buildCustomHttpMetricReadPlan([definition.identity]);
    }

    protected override onResolvedSettingsChanged(event: WillAppearEvent, settings: ResolvedWidgetSettings): void {
        const target = readResolvedMetricTarget(settings, "customMetric");
        const definition = resolveCustomHttpMetricDefinition({
            target,
            actionId: event.action.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });
        syncCustomHttpRuntimeDefinitionsForAction({
            customHttpDefinitionRegistry: this.customHttpDefinitionRegistry,
            registeredMetricKeysByActionId: this.registeredMetricKeysByActionId,
            actionId: event.action.id,
            definitions: definition === undefined ? [] : [definition],
        });
    }

    protected override onActionWillDisappear(event: WillDisappearEvent): void {
        unregisterCustomHttpRuntimeDefinitionsForAction({
            customHttpDefinitionRegistry: this.customHttpDefinitionRegistry,
            registeredMetricKeysByActionId: this.registeredMetricKeysByActionId,
            actionId: event.action.id,
        });
        this.sourceEditorRequestHandler.clearAction(event.action.id);
    }

    override onSendToPlugin(event: SendToPluginEvent<never, Record<string, never>>): void {
        super.onSendToPlugin(event);
        this.sourceEditorRequestHandler.handle(event);
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

    protected sendCustomHttpSourceEditorResponse(
        event: SendToPluginEvent<never, Record<string, never>>,
        response: CustomHttpSourceEditorResponse,
    ): Promise<void> {
        if (streamDeck.ui.action?.id !== event.action.id) {
            return Promise.resolve();
        }

        return streamDeck.ui.sendToPropertyInspector(
            response as unknown as Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0],
        );
    }

}
