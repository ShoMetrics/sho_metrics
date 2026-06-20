import type { MetricStoreReader } from "../../runtime/metric-store";
import { isBuiltInMetricHelperOnly } from "../../runtime/source-routing/metric-source-preferences";
import type {
    SourceClientStatus,
} from "../../runtime/sources/source-client";
import { wallClockNowMilliseconds } from "../../shared/clock";
import {
    PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    type WidgetData,
} from "../../view-rendering/widget-data";

// Hub-side stale-sample guard. Source-side fresh/retained metadata in
// docs/development/runtime-sources/03-windows-helper/02-helper-source-reliability-implementation-plan.md
// will make this a fallback check instead of the primary helper freshness signal.
const HELPER_BACKED_SAMPLE_FRESHNESS_MILLISECONDS = 7000;
export const HELPER_INSTALL_NOTICE_TEXT = "Install helper";

interface HelperBackedWidgetDataReadOptions {
    readonly metrics: MetricStoreReader;
    readonly metricKey: string;
    readonly label: string;
    readonly unit: string;
    readonly maxValue?: number;
    readonly helperStatus: SourceClientStatus | undefined;
    readonly transformFreshWidgetData?: (widgetData: WidgetData) => WidgetData;
}

/**
 * Reads a helper-backed metric and strips stale values before rendering.
 *
 * Ordinary helper-backed no-data states intentionally fall back to renderer
 * `N/A`; only source-confirmed pending refresh keeps special key copy here.
 */
export function readHelperBackedWidgetData(options: HelperBackedWidgetDataReadOptions): WidgetData {
    const readResult = options.metrics.getWidgetDataReadResult(
        options.metricKey,
        options.label,
        options.unit,
        options.maxValue ?? 100,
    );
    const { widgetData } = readResult;

    if (isFreshHelperBackedWidgetData(widgetData)) {
        return options.transformFreshWidgetData?.(widgetData) ?? widgetData;
    }

    const {
        displayValue: ignoredDisplayValue,
        secondaryDisplayValue: ignoredSecondaryDisplayValue,
        sampleTimestampMilliseconds: ignoredSampleTimestampMilliseconds,
        ...baseWidgetData
    } = widgetData;

    void ignoredDisplayValue;
    void ignoredSecondaryDisplayValue;
    void ignoredSampleTimestampMilliseconds;

    const unavailableDisplayValue = options.helperStatus?.state === "available"
        && readResult.unavailableMetric?.reason === "pendingRefresh"
        ? PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE
        : undefined;

    return {
        ...baseWidgetData,
        current: 0,
        progress: 0,
        history: [],
        ...(unavailableDisplayValue === undefined ? {} : { unavailableDisplayValue }),
    };
}

/**
 * Resolves install-helper onboarding copy for surfaces that are already known
 * to require the Windows helper.
 *
 * Callers must decide whether their surface is helper-required. This function
 * only checks the runtime status and avoids replacing a still-fresh value.
 */
export function resolveHelperRequiredInstallNoticeText(options: {
    readonly helperStatus: SourceClientStatus | undefined;
    readonly widgetData: WidgetData;
}): string | undefined {
    if (
        options.helperStatus?.state === "unavailable"
        && options.helperStatus.reason === "helperNotInstalled"
        && options.widgetData.sampleTimestampMilliseconds === undefined
    ) {
        return HELPER_INSTALL_NOTICE_TEXT;
    }

    return undefined;
}

/**
 * Resolves install-helper onboarding copy for built-in stable metrics.
 *
 * The helper-required decision comes from the static source-routing table, not
 * from momentary sample freshness or hardware probing. This prevents GPU
 * fallback metrics from flashing install guidance during fallback warmup.
 */
export function resolveBuiltInHelperInstallNoticeText(options: {
    readonly metricKey: string;
    readonly helperStatus: SourceClientStatus | undefined;
    readonly widgetData: WidgetData;
}): string | undefined {
    if (!isBuiltInMetricHelperOnly(options.metricKey)) {
        return undefined;
    }

    return resolveHelperRequiredInstallNoticeText({
        helperStatus: options.helperStatus,
        widgetData: options.widgetData,
    });
}

function isFreshHelperBackedWidgetData(widgetData: WidgetData): boolean {
    if (widgetData.sampleTimestampMilliseconds == null) {
        return false;
    }

    return wallClockNowMilliseconds() - widgetData.sampleTimestampMilliseconds
        <= HELPER_BACKED_SAMPLE_FRESHNESS_MILLISECONDS;
}
