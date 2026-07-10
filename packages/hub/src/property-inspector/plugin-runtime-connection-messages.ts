export const PROPERTY_INSPECTOR_PLUGIN_RUNTIME_CONNECTION_MESSAGE_TYPE =
    "shoMetrics.propertyInspectorPluginRuntimeConnection";

// A type alias rather than an interface so message objects are structurally
// assignable to the SDK's JsonValue payloads without casting: TypeScript
// applies implicit index-signature compatibility to type aliases but not to
// interfaces.
type PluginRuntimeConnectionMessage = {
    readonly type: typeof PROPERTY_INSPECTOR_PLUGIN_RUNTIME_CONNECTION_MESSAGE_TYPE;
    readonly command: "ping" | "pong";
    readonly requestId: string;
};

export type PropertyInspectorPluginRuntimePingMessage = PluginRuntimeConnectionMessage & {
    readonly command: "ping";
};

export type PropertyInspectorPluginRuntimePongMessage = PluginRuntimeConnectionMessage & {
    readonly command: "pong";
};

export function buildPropertyInspectorPluginRuntimePingMessage(
    requestId: string,
): PropertyInspectorPluginRuntimePingMessage {
    return {
        type: PROPERTY_INSPECTOR_PLUGIN_RUNTIME_CONNECTION_MESSAGE_TYPE,
        command: "ping",
        requestId,
    };
}

export function buildPropertyInspectorPluginRuntimePongMessage(
    requestId: string,
): PropertyInspectorPluginRuntimePongMessage {
    return {
        type: PROPERTY_INSPECTOR_PLUGIN_RUNTIME_CONNECTION_MESSAGE_TYPE,
        command: "pong",
        requestId,
    };
}

export function readPropertyInspectorPluginRuntimePingMessage(
    value: unknown,
): PropertyInspectorPluginRuntimePingMessage | null {
    const message = readPluginRuntimeConnectionMessage(value);

    if (message?.command !== "ping") {
        return null;
    }

    return {
        type: message.type,
        command: "ping",
        requestId: message.requestId,
    };
}

export function readPropertyInspectorPluginRuntimePongMessage(
    value: unknown,
): PropertyInspectorPluginRuntimePongMessage | null {
    const message = readPluginRuntimeConnectionMessage(value);

    if (message?.command !== "pong") {
        return null;
    }

    return {
        type: message.type,
        command: "pong",
        requestId: message.requestId,
    };
}

function readPluginRuntimeConnectionMessage(value: unknown): PluginRuntimeConnectionMessage | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const record = value as Record<string, unknown>;
    if (
        record.type !== PROPERTY_INSPECTOR_PLUGIN_RUNTIME_CONNECTION_MESSAGE_TYPE
        || (record.command !== "ping" && record.command !== "pong")
        || typeof record.requestId !== "string"
        || record.requestId.length === 0
    ) {
        return null;
    }

    return {
        type: PROPERTY_INSPECTOR_PLUGIN_RUNTIME_CONNECTION_MESSAGE_TYPE,
        command: record.command,
        requestId: record.requestId,
    };
}
