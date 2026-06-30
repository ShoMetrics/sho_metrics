import type { DisplayedMetricReadTrace } from "../../runtime/widget-runtime-cache";
import { cpuMessages, gpuMessages, helperMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import { InspectorItem } from "../components/InspectorItem";
import { HelperDownloadLink } from "./helper-download-link";

/** Reports whether Windows GPU settings should explain a missing runtime value. */
export function shouldShowGpuNoValueGuidance(
    isWindows: boolean,
    trace: DisplayedMetricReadTrace | undefined,
): boolean {
    if (!isWindows || trace?.metricKey.startsWith("gpu.") !== true) {
        return false;
    }

    if (trace.outcome?.kind === "value") {
        return false;
    }

    return true;
}

/** Renders the GPU no-value guidance with a clickable Helper download link. */
export function GpuNoValueGuidanceNote(): React.JSX.Element {
    const { t } = useI18n();

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">
                {t(gpuMessages.gpuNoValueGuidanceIntro)}{" "}
                <HelperDownloadLink>
                    {t(helperMessages.helperDownloadLink)}
                </HelperDownloadLink>{" "}
                {t(gpuMessages.gpuNoValueGuidanceTroubleshooting)}
            </p>
        </InspectorItem>
    );
}

/** Renders the CPU summary Helper requirement note with a clickable Helper download link. */
export function CpuSummaryHelperGuidanceNote(): React.JSX.Element {
    const { t } = useI18n();

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">
                {t(cpuMessages.cpuSummaryHelperGuidanceIntro)}{" "}
                <HelperDownloadLink>
                    {t(helperMessages.helperDownloadLink)}
                </HelperDownloadLink>
            </p>
        </InspectorItem>
    );
}
