import type { ActionKind } from "../settings/widget-settings";

export const STREAM_DECK_PLUGIN_UUID = "com.ez.sho-metrics";

type StreamDeckActionKind = Exclude<ActionKind, "unknown">;

export const STREAM_DECK_ACTION_UUID_BY_KIND = {
    "cpu-usage": `${STREAM_DECK_PLUGIN_UUID}.cpu-usage`,
    "net-speed": `${STREAM_DECK_PLUGIN_UUID}.net-speed`,
    ram: `${STREAM_DECK_PLUGIN_UUID}.ram`,
    disk: `${STREAM_DECK_PLUGIN_UUID}.disk`,
    "gpu-usage": `${STREAM_DECK_PLUGIN_UUID}.gpu-usage`,
    "gpu-temp": `${STREAM_DECK_PLUGIN_UUID}.gpu-temp`,
    "gpu-vram": `${STREAM_DECK_PLUGIN_UUID}.gpu-vram`,
    "gpu-power": `${STREAM_DECK_PLUGIN_UUID}.gpu-power`,
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
