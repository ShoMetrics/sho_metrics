import { logger } from "../../logging/logger";
import { formatMetricKeyFieldsForLog } from "../../logging/log-format";
import { backgroundMetricCollection } from "../../runtime/metric-collection/background-metric-collection";
import { createFallbackMetricStoreReader } from "../../runtime/metric-collection/fallback-composer";
import { metricStore } from "../../runtime/metric-store";
import type { MetricSubscription } from "../../runtime/metric-collection/metric-subscription-registry";
import {
    buildMetricReadPlanKey,
    listMetricReadPlanKeys,
    type MetricReadPlan,
} from "../../runtime/source-routing/metric-read-plan";

const log = logger.for("BackgroundCollectionBinding");
// Startup-only first-reading check: 500ms x 20 = 10s. It runs faster than a
// long user render interval so a 60s widget can repaint after the first
// background reading, but it stops quickly when the collector is unavailable.
const FIRST_READING_CHECK_INTERVAL_MILLISECONDS = 500;
const FIRST_READING_CHECK_ATTEMPT_LIMIT = 20;

type BackgroundCollectionRegistration = (
    options: Pick<BackgroundCollectionBindingRefreshOptions, "subscriberId" | "metricSubscriptions">,
) => () => void;

export interface BackgroundCollectionBindingRefreshOptions {
    readonly subscriberId: string;
    /**
     * Render-side fallback plan used for MetricStore reads and first-reading checks.
     *
     * Collector registration uses `metricSubscriptions`. Keep both derived from
     * the same action state until the fallback reader accepts subscriptions
     * directly.
     */
    readonly readPlan: MetricReadPlan;
    readonly metricSubscriptions: readonly MetricSubscription[];
    readonly pollingIntervalMilliseconds: number;
    /** Matches the render-time fallback freshness budget for the same action. */
    readonly maximumSampleAgeMilliseconds: number;
    readonly onTick: () => void;
}

export interface BackgroundCollectionBindingTimer {
    set(callback: () => void, intervalMilliseconds: number): unknown;
    clear(handle: unknown): void;
}

const defaultTimer: BackgroundCollectionBindingTimer = {
    set: (callback, intervalMilliseconds) => setInterval(callback, intervalMilliseconds),
    clear: handle => clearInterval(handle as NodeJS.Timeout),
};

/**
 * Binds one action to background collection plus an action-owned render timer.
 *
 * Background collection keeps MetricStore fresh. The render timer only calls
 * the action's existing tick callback; it never polls sources itself. A short
 * first-reading warmup closes the initial N/A gap for long-interval actions
 * without turning MetricStore writes into general render events.
 */
export class BackgroundCollectionBinding {
    private cleanupCollection: (() => void) | null = null;
    private renderTimerHandle: unknown | null = null;
    /**
     * Holds the startup-only first-reading timer separately from the render timer.
     *
     * The render timer follows the user's configured interval. This timer only
     * closes the initial placeholder gap for long-interval actions and then
     * stops independently. It renders once when any subscribed metric has a
     * reading; it intentionally does not track per-metric progressive fill until
     * a real multi-hardware widget requires that behavior.
     */
    private firstReadingTimerHandle: unknown | null = null;
    private readPlanSignature: string | null = null;
    private pollingIntervalMilliseconds: number | null = null;
    private subscriberId: string | null = null;
    private metricCount = 0;

    constructor(
        private readonly registerCollection: BackgroundCollectionRegistration
            = options => backgroundMetricCollection.registerSubscriptions({
                subscriberId: options.subscriberId,
                subscriptions: options.metricSubscriptions,
            }),
        private readonly timer: BackgroundCollectionBindingTimer = defaultTimer,
        private readonly hasAnyMetricReading: (
            readPlan: MetricReadPlan,
            maximumSampleAgeMilliseconds: number,
        ) => boolean
            = hasAnyMetricStoreReading,
    ) {}

    refresh(options: BackgroundCollectionBindingRefreshOptions): void {
        const nextReadPlanSignature = buildMetricReadPlanKey(options.readPlan);

        if (
            this.readPlanSignature === nextReadPlanSignature
            && this.pollingIntervalMilliseconds === options.pollingIntervalMilliseconds
            && this.subscriberId === options.subscriberId
        ) {
            return;
        }

        this.dispose();
        this.cleanupCollection = this.registerCollection({
            subscriberId: options.subscriberId,
            metricSubscriptions: options.metricSubscriptions,
        });
        this.renderTimerHandle = this.timer.set(options.onTick, options.pollingIntervalMilliseconds);
        this.startFirstReadingRenderWarmup(options);
        this.readPlanSignature = nextReadPlanSignature;
        this.pollingIntervalMilliseconds = options.pollingIntervalMilliseconds;
        this.subscriberId = options.subscriberId;
        const metricKeys = listMetricReadPlanKeys(options.readPlan);
        this.metricCount = metricKeys.length;

        log.info(() => [
            "backgroundCollectionBindingStarted",
            `subscriberId=${options.subscriberId}`,
            `intervalMs=${options.pollingIntervalMilliseconds}`,
            ...formatMetricKeyFieldsForLog(metricKeys),
        ].join(" "));
    }

    dispose(): void {
        if (this.renderTimerHandle !== null) {
            this.timer.clear(this.renderTimerHandle);
            this.renderTimerHandle = null;
        }
        this.stopFirstReadingRenderWarmup();

        this.cleanupCollection?.();
        if (this.subscriberId) {
            log.info(() => [
                "backgroundCollectionBindingStopped",
                `subscriberId=${this.subscriberId}`,
                `metricCount=${this.metricCount}`,
            ].join(" "));
        }

        this.cleanupCollection = null;
        this.readPlanSignature = null;
        this.pollingIntervalMilliseconds = null;
        this.subscriberId = null;
        this.metricCount = 0;
    }

    private startFirstReadingRenderWarmup(options: BackgroundCollectionBindingRefreshOptions): void {
        this.stopFirstReadingRenderWarmup();
        let attemptCount = 0;

        this.firstReadingTimerHandle = this.timer.set(() => {
            attemptCount += 1;
            const hasAnyReading = this.hasAnyMetricReading(
                options.readPlan,
                options.maximumSampleAgeMilliseconds,
            );

            if (hasAnyReading) {
                options.onTick();
            }

            if (hasAnyReading || attemptCount >= FIRST_READING_CHECK_ATTEMPT_LIMIT) {
                this.stopFirstReadingRenderWarmup();
            }
        }, FIRST_READING_CHECK_INTERVAL_MILLISECONDS);
    }

    private stopFirstReadingRenderWarmup(): void {
        if (this.firstReadingTimerHandle !== null) {
            this.timer.clear(this.firstReadingTimerHandle);
            this.firstReadingTimerHandle = null;
        }
    }
}

function hasAnyMetricStoreReading(
    readPlan: MetricReadPlan,
    maximumSampleAgeMilliseconds: number,
): boolean {
    const reader = createFallbackMetricStoreReader(metricStore, readPlan, {
        maximumSampleAgeMilliseconds,
    });

    return listMetricReadPlanKeys(readPlan).some(metricKey => (
        reader.getWidgetData(metricKey, "", "").sampleTimestampMilliseconds !== undefined
        || reader.getTextValue(metricKey) !== undefined
    ));
}
