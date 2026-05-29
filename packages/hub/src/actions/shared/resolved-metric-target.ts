import type {
    ResolvedMetricTarget,
    ResolvedWidgetSettings,
} from "../../settings/resolved-settings";

export type ActionMetricTargetDomain = ResolvedMetricTarget["domain"];
export type ActionMetricTarget<TDomain extends ActionMetricTargetDomain> = Extract<
    ResolvedMetricTarget,
    { readonly domain: TDomain }
>;

export function readResolvedMetricTarget<TDomain extends ActionMetricTargetDomain>(
    settings: ResolvedWidgetSettings,
    domain: TDomain,
): ActionMetricTarget<TDomain> {
    const target = settings.widget.slot.metric.target;

    assertResolvedMetricTargetDomain(target, domain);

    return target;
}

function assertResolvedMetricTargetDomain<TDomain extends ActionMetricTargetDomain>(
    target: ResolvedMetricTarget,
    domain: TDomain,
): asserts target is ActionMetricTarget<TDomain> {
    if (target.domain !== domain) {
        throw new Error(`Expected ${domain} metric settings.`);
    }
}
