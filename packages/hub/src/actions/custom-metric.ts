import {
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
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "../runtime/sources/custom-http/custom-http-metric-key";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import {
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import { setMetricView } from "../view-updates/runner";
import {
    CustomHttpActionConnector,
    type CustomHttpActionConnectorDependencies,
} from "./custom-metric/custom-http-action-connector";
import { buildCustomMetricViewOptions } from "./custom-metric/single-metric-view-options";
import {
    resolveCustomHttpMetricDefinition,
    resolveCustomHttpRuntimeIdentity,
} from "./custom-metric/runtime-source-definition";

export { buildCustomMetricViewOptions } from "./custom-metric/single-metric-view-options";

type CustomMetricActionDependencies = CustomHttpActionConnectorDependencies;

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric })
export class CustomMetric extends MetricAction {
    protected readonly actionKind = "customMetric";

    private readonly customHttpConnector: CustomHttpActionConnector;

    constructor(options: CustomMetricActionDependencies = {}) {
        super();
        this.customHttpConnector = new CustomHttpActionConnector(options);
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const target = readResolvedMetricTarget(this.resolveSettings(event), "customMetric");
        const identity = resolveCustomHttpRuntimeIdentity(event, target, CUSTOM_HTTP_SINGLE_CONSUMER_SLUG);
        return identity === undefined ? [] : [identity.metricKey];
    }

    protected override buildMetricCollectionReadPlan(event: WillAppearEvent): MetricReadPlan {
        const target = readResolvedMetricTarget(this.resolveSettings(event), "customMetric");
        const definition = resolveCustomHttpMetricDefinition({
            target,
            actionId: event.action.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });

        return buildCustomHttpMetricReadPlan(definition === undefined ? [] : [definition.identity]);
    }

    protected override onResolvedSettingsChanged(event: WillAppearEvent, settings: ResolvedWidgetSettings): void {
        const target = readResolvedMetricTarget(settings, "customMetric");
        const definition = resolveCustomHttpMetricDefinition({
            target,
            actionId: event.action.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });
        this.customHttpConnector.syncActionDefinitions(event.action.id, definition === undefined ? [] : [definition]);
    }

    protected override onActionWillDisappear(event: WillDisappearEvent): void {
        this.customHttpConnector.clearAction(event.action.id);
    }

    override onSendToPlugin(event: SendToPluginEvent<never, Record<string, never>>): void {
        super.onSendToPlugin(event);
        this.customHttpConnector.handleSendToPlugin(event);
    }

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "customMetric");

        setMetricView(this.withManualRefreshIndicator(event, buildCustomMetricViewOptions({
            event,
            settings,
            target,
            ...(target.configuration.state === "configured" ? { metrics: this.getMetricReader(event) } : {}),
        })));
    }

}
