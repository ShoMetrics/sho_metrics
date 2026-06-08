export type ActionKind =
    | "cpu"
    | "gpu"
    | "memory"
    | "disk"
    | "catalog"
    | "denseMultiMetric"
    | "stackedMetric"
    | "network"
    | "unknown";

export const STREAM_DECK_PLUGIN_UUID = "com.ez.sho-metrics";
export const STREAM_DECK_STACKED_METRIC_ACTION_UUID = `${STREAM_DECK_PLUGIN_UUID}.stacked-metric`;

type StreamDeckActionKind = Exclude<ActionKind, "unknown">;

export const STREAM_DECK_ACTION_UUID_BY_KIND = {
    cpu: `${STREAM_DECK_PLUGIN_UUID}.cpu`,
    gpu: `${STREAM_DECK_PLUGIN_UUID}.gpu`,
    memory: `${STREAM_DECK_PLUGIN_UUID}.memory`,
    disk: `${STREAM_DECK_PLUGIN_UUID}.disk`,
    catalog: `${STREAM_DECK_PLUGIN_UUID}.catalog-metric`,
    denseMultiMetric: `${STREAM_DECK_PLUGIN_UUID}.dense-multi-metric`,
    stackedMetric: STREAM_DECK_STACKED_METRIC_ACTION_UUID,
    network: `${STREAM_DECK_PLUGIN_UUID}.network`,
} as const satisfies Record<StreamDeckActionKind, string>;

const actionKindByUuid: Readonly<Partial<Record<string, ActionKind>>> = Object.fromEntries(
    Object.entries(STREAM_DECK_ACTION_UUID_BY_KIND).map(([actionKind, actionUuid]) => [
        actionUuid,
        actionKind as StreamDeckActionKind,
    ]),
);

export function resolveStreamDeckActionKind(actionUuid: string): ActionKind {
    return actionKindByUuid[actionUuid] ?? "unknown";
}
