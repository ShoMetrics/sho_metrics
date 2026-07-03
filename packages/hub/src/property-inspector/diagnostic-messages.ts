/** Identifies PI-originated diagnostic messages sent through sendToPlugin. */
export const PROPERTY_INSPECTOR_DIAGNOSTIC_MESSAGE_TYPE = "propertyInspectorDiagnostic";

/** Severity levels accepted from the browser-side Property Inspector. */
export type PropertyInspectorDiagnosticLevel = "warn" | "error";

/** Carries bounded PI diagnostics across the Stream Deck sendToPlugin boundary. */
export interface PropertyInspectorDiagnosticMessage {
    readonly type: typeof PROPERTY_INSPECTOR_DIAGNOSTIC_MESSAGE_TYPE;
    readonly level: PropertyInspectorDiagnosticLevel;
    readonly message: string;
}

/** Builds the typed diagnostic envelope sent by the PI browser bundle. */
export function buildPropertyInspectorDiagnosticMessage(
    level: PropertyInspectorDiagnosticLevel,
    message: string,
): PropertyInspectorDiagnosticMessage {
    return {
        type: PROPERTY_INSPECTOR_DIAGNOSTIC_MESSAGE_TYPE,
        level,
        message,
    };
}

/** Reads only Sho Metrics PI diagnostic envelopes from mixed sendToPlugin traffic. */
export function readPropertyInspectorDiagnosticMessage(value: unknown): PropertyInspectorDiagnosticMessage | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const message = value as Partial<PropertyInspectorDiagnosticMessage>;
    if (
        message.type !== PROPERTY_INSPECTOR_DIAGNOSTIC_MESSAGE_TYPE
        || !isPropertyInspectorDiagnosticLevel(message.level)
        || typeof message.message !== "string"
    ) {
        return null;
    }

    return {
        type: PROPERTY_INSPECTOR_DIAGNOSTIC_MESSAGE_TYPE,
        level: message.level,
        message: message.message,
    };
}

function isPropertyInspectorDiagnosticLevel(value: unknown): value is PropertyInspectorDiagnosticLevel {
    return value === "warn" || value === "error";
}
