import { Component, type ErrorInfo, type ReactNode } from "react";
import { buildPropertyInspectorDiagnosticMessage, type PropertyInspectorDiagnosticLevel } from "./diagnostic-messages";
import { monotonicNowMilliseconds } from "../shared/clock";
import type { StreamDeckPropertyInspectorClient } from "./stream-deck/stream-deck-client";

const DIAGNOSTIC_THROTTLE_WINDOW_MILLISECONDS = 60_000;
const DIAGNOSTIC_MESSAGES_PER_WINDOW = 5;

// Browser-side throttling keeps a crashing PI from flooding the plugin over
// sendToPlugin; the plugin receiver still has its own log throttle as a backup.
let diagnosticWindowStartedAtMilliseconds = 0;
let diagnosticMessageCount = 0;
let suppressedDiagnosticCount = 0;
let hasWrittenSuppressionNotice = false;

interface PropertyInspectorErrorBoundaryProps {
    readonly client: StreamDeckPropertyInspectorClient;
    readonly children: ReactNode;
}

interface PropertyInspectorErrorBoundaryState {
    readonly hasError: boolean;
}

/** Reports rare PI crashes to the plugin log without logging normal startup timings. */
export class PropertyInspectorErrorBoundary
    extends Component<PropertyInspectorErrorBoundaryProps, PropertyInspectorErrorBoundaryState> {
    constructor(props: PropertyInspectorErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): PropertyInspectorErrorBoundaryState {
        return { hasError: true };
    }

    override componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
        writePropertyInspectorErrorLog(this.props.client, "reactErrorBoundary", error, {
            componentStack: errorInfo.componentStack === undefined || errorInfo.componentStack === null
                ? undefined
                : sanitizeDiagnosticText(errorInfo.componentStack),
        });
    }

    override render(): ReactNode {
        if (this.state.hasError) {
            return null;
        }

        return this.props.children;
    }
}

export function installPropertyInspectorErrorDiagnostics(
    client: StreamDeckPropertyInspectorClient,
    targetWindow: Window,
): void {
    targetWindow.addEventListener("error", (event) => {
        writePropertyInspectorErrorLog(client, "windowError", event.error ?? event.message);
    });
    targetWindow.addEventListener("unhandledrejection", (event) => {
        writePropertyInspectorErrorLog(client, "unhandledRejection", event.reason);
    });
}

/** Sends a bounded, redacted PI warning diagnostic to the plugin log. */
export function writePropertyInspectorWarningLog(
    client: StreamDeckPropertyInspectorClient,
    eventName: string,
    fields: Record<string, string | undefined> = {},
): void {
    writePropertyInspectorDiagnosticLog(client, "warn", `propertyInspectorWarning event=${eventName}`, fields);
}

function writePropertyInspectorErrorLog(
    client: StreamDeckPropertyInspectorClient,
    eventName: string,
    error: unknown,
    fields: Record<string, string | undefined> = {},
): void {
    writePropertyInspectorDiagnosticLog(client, "error", `propertyInspectorError event=${eventName}`, {
        ...readErrorDiagnosticFields(error),
        ...fields,
    });
}

function writePropertyInspectorDiagnosticLog(
    client: StreamDeckPropertyInspectorClient,
    level: PropertyInspectorDiagnosticLevel,
    summary: string,
    fields: Record<string, string | undefined>,
): void {
    const throttleResult = reserveDiagnosticMessageSlot(monotonicNowMilliseconds());
    if (throttleResult === "suppressed") {
        return;
    }

    if (throttleResult === "suppressionNotice") {
        sendPropertyInspectorDiagnostic(
            client,
            "warn",
            [
                "propertyInspectorWarning event=diagnosticRateLimited",
                `suppressedCount=${suppressedDiagnosticCount}`,
                `windowMs=${DIAGNOSTIC_THROTTLE_WINDOW_MILLISECONDS}`,
            ].join(" "),
        );
        return;
    }

    const message = [
        summary,
        ...Object.entries(fields)
            .flatMap(([key, value]) => value === undefined ? [] : [`${key}=${sanitizeDiagnosticText(value)}`]),
    ].join(" ");

    sendPropertyInspectorDiagnostic(client, level, message);
}

function sendPropertyInspectorDiagnostic(
    client: StreamDeckPropertyInspectorClient,
    level: PropertyInspectorDiagnosticLevel,
    message: string,
): void {
    // PI diagnostics should never block rendering or create an error loop when
    // the Stream Deck host is already disconnecting the property inspector.
    client.send("sendToPlugin", buildPropertyInspectorDiagnosticMessage(level, message))
        .catch(() => undefined);
}

function readErrorDiagnosticFields(error: unknown): Record<string, string | undefined> {
    if (error instanceof Error) {
        return {
            errorName: sanitizeDiagnosticText(error.name),
            errorMessage: sanitizeDiagnosticText(error.message),
        };
    }

    return {
        errorMessage: sanitizeDiagnosticText(String(error)),
    };
}

function sanitizeDiagnosticText(value: string): string {
    return value
        // Redacts URLs, including query strings that may carry tokens.
        .replaceAll(/\bhttps?:\/\/\S+/gu, "[url-redacted]")
        // Redacts usernames from Windows user-profile paths.
        .replaceAll(/\b[A-Za-z]:\\Users\\[^\\\s]+/gu, "[user-path]")
        // Redacts usernames from macOS user-home paths.
        .replaceAll(/\/Users\/[^/\s]+/gu, "[user-path]")
        // Redacts usernames from user-home paths.
        .replaceAll(/\/home\/[^/\s]+/gu, "[user-path]")
        .replaceAll(/\s+/gu, "_")
        .slice(0, 500);
}

type DiagnosticThrottleResult = "allowed" | "suppressionNotice" | "suppressed";

function reserveDiagnosticMessageSlot(nowMilliseconds: number): DiagnosticThrottleResult {
    if (
        diagnosticWindowStartedAtMilliseconds === 0
        || nowMilliseconds - diagnosticWindowStartedAtMilliseconds >= DIAGNOSTIC_THROTTLE_WINDOW_MILLISECONDS
    ) {
        diagnosticWindowStartedAtMilliseconds = nowMilliseconds;
        diagnosticMessageCount = 0;
        suppressedDiagnosticCount = 0;
        hasWrittenSuppressionNotice = false;
    }

    if (diagnosticMessageCount < DIAGNOSTIC_MESSAGES_PER_WINDOW) {
        diagnosticMessageCount += 1;
        return "allowed";
    }

    suppressedDiagnosticCount += 1;
    if (!hasWrittenSuppressionNotice) {
        hasWrittenSuppressionNotice = true;
        return "suppressionNotice";
    }

    return "suppressed";
}
