import { helperMessages } from "../../i18n/message-groups/widgets";
import type { I18n } from "../../i18n/react";
import type { SourceClientStatus } from "../../runtime/sources/source-client";

interface HelperStatusGuidanceOptions {
    readonly i18n: I18n;
    readonly installSubject: "catalogMetrics" | "thisMetric";
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
            return options.i18n.t(helperMessages.helperNotInstalledGuidance, {
                subject: options.i18n.t(options.installSubject === "catalogMetrics"
                    ? helperMessages.helperInstallCatalogMetrics
                    : helperMessages.helperInstallThisMetric),
            });
        case "helperStopped":
            return options.i18n.t(helperMessages.helperStoppedGuidance);
        case "protocolMismatch":
            return options.i18n.t(helperMessages.helperProtocolMismatchGuidance);
        default:
            return options.i18n.t(helperMessages.helperDiagnosticsGuidance);
    }
}
