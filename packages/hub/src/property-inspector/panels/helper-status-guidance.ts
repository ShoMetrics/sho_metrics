import type { SourceClientStatus } from "../../runtime/sources/source-client";

interface HelperStatusGuidanceOptions {
    readonly installSubject: "advanced sensors" | "this metric";
}

/**
 * Maps helper source status to ordinary PI next-action copy.
 *
 * Keep this separate from DEBUG status labels: ordinary PI copy tells users
 * what to do next, while DEBUG compresses source state for support context.
 */
export function resolveHelperStatusGuidanceText(
    sourceStatus: SourceClientStatus | undefined,
    options: HelperStatusGuidanceOptions,
): string | undefined {
    if (sourceStatus?.state !== "unavailable") {
        return undefined;
    }

    switch (sourceStatus.reason) {
        case "helperNotInstalled":
            return `Install ShoMetrics Helper to use ${options.installSubject}.`;
        case "helperStopped":
            return "Start ShoMetrics Helper from ShoMetrics Control Panel.";
        case "protocolMismatch":
            return "Update ShoMetrics Helper and Hub to the latest version.";
        default:
            return "Open ShoMetrics Control Panel for helper diagnostics.";
    }
}
