import { logger } from "../../logging/node-logger";
import { resolveProductionLogThrottleMilliseconds } from "../../logging/log-throttle";
import { monotonicNowMilliseconds, wallClockNowMilliseconds } from "../../shared/clock";
import { WINDOWS_HELPER_SOURCE_ID } from "../sources/source-ids";
import { backgroundMetricCollection } from "../metric-collection/background-metric-collection";
import {
    helperUpdateFeed,
    type HelperUpdateFeed,
    type HelperUpdateReleases,
} from "./helper-update-feed";
import { selectHelperUpdateNotice, type HelperUpdateNotice } from "./helper-update-notice";

const log = logger.for("HelperUpdateNotifier");

const SUCCESSFUL_CHECK_INTERVAL_MILLISECONDS = 24 * 60 * 60 * 1000;
const FAILED_CHECK_RETRY_MILLISECONDS = 30 * 60 * 1000;

/**
 * Delay before the first check, so the feed is not fetched during plugin startup.
 *
 * Plugin startup already connects to Stream Deck, loads settings, opens the
 * Helper pipe, and renders every visible key. An update feed is the least urgent
 * thing happening in that window, and nothing about it needs to compete for it.
 */
const INITIAL_CHECK_DELAY_MILLISECONDS = 15 * 1000;

/**
 * Delay before retrying once the installed Helper version is still unknown.
 *
 * The Helper identifies itself in exactly one call, GetSourceHealth, which the
 * source client makes when it first connects. That connection is opened by the
 * descriptor preload at plugin startup, whether or not any widget reads a Helper
 * metric, so this is a race with that handshake rather than with the user placing
 * a widget. It is a race the Helper usually wins within seconds, but not always:
 * the preload keeps retrying while the Helper service is still starting, and a
 * machine with no Helper installed never resolves a version at all.
 *
 * Retrying at this cadence costs nothing either way. With no version the feed is
 * never fetched, and this reads one cached field.
 */
const UNKNOWN_VERSION_RETRY_MILLISECONDS = 15 * 1000;

/**
 * Shortest time between two reads of the feed, whatever asked for them.
 *
 * The schedule already spaces its own checks out, so this exists for the checks
 * it does not control: an opening panel asks for one, and a panel is opened by
 * whatever the user or a bug in the Property Inspector does. A cap that does not
 * depend on the caller behaving is the only kind that holds, and this one costs
 * a correct caller nothing.
 */
const MINIMUM_FEED_READ_INTERVAL_MILLISECONDS = 60 * 1000;

/**
 * Throttles the skip logs, which repeat at the retry cadence and never change.
 *
 * A user who never installed the Helper has no version, so the unknown-version
 * skip is not a transient state for them: it is the steady one, and at the retry
 * cadence it would write a line every fifteen seconds for as long as Stream Deck
 * runs. Repeating an identical line adds nothing after the first one, and the
 * question it answers ("why is there no notice?") is answered just as well by
 * one line an hour. The feed-read skip is throttled because nothing bounds how
 * often a panel may open.
 *
 * Development and staging keep both unthrottled, so a local retry sequence can
 * still be read event by event.
 */
const UNKNOWN_VERSION_LOG_INTERVAL_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60 * 60 * 1000);
const FEED_READ_THROTTLED_LOG_INTERVAL_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60 * 1000);

type HelperUpdateCheckTimer = ReturnType<typeof setTimeout>;

interface HelperUpdateNotifierDependencies {
    readonly feed: HelperUpdateFeed;
    readInstalledHelperVersion(): string | undefined;
    /** Monotonic: this measures elapsed time, which a clock correction must not rewrite. */
    monotonicNowMilliseconds(): number;
    /** Wall clock: this is compared against the pubDate a feed publishes, a calendar time. */
    nowTimestampMilliseconds(): number;
    setTimer(callback: () => void, delayMilliseconds: number): HelperUpdateCheckTimer;
    clearTimer(timer: HelperUpdateCheckTimer): void;
}

/** Reads the Helper update notice, bringing it up to date first. */
export interface HelperUpdateNoticeReader {
    /** Returns the last resolved notice without doing any I/O. */
    readCachedNotice(): HelperUpdateNotice;

    /**
     * Makes the notice describe the Helper that is installed right now.
     *
     * Opening the Property Inspector is the only moment the notice is read, so it
     * is also the moment it has to be true. Two things can have made it stale, and
     * they cost differently:
     *
     * The user may have installed the update we asked them for. Recomputing the
     * notice against the releases already read answers that with no I/O at all,
     * and skipping it would keep telling them to install what they just installed
     * until the next scheduled read, up to a day later.
     *
     * Or the schedule may not have read the feed yet, because the first checks
     * after startup can still be waiting on the Helper handshake that reports its
     * version. That needs the network, so it happens at most once and is capped
     * like any other feed read.
     */
    refreshNotice(): void;
}

type HelperUpdateNoticeListener = (notice: HelperUpdateNotice) => void;

/**
 * Keeps the Helper update notice fresh in the background so the Property
 * Inspector has an answer the moment it opens.
 *
 * Reading the feed only when the Property Inspector opens would put a network
 * round trip between the user opening the panel and the notice appearing, and by
 * the time it arrived they would already have scrolled past it. That is the whole
 * point of the notice, so the feed is read on a schedule and the panel reads the
 * result. What the panel does do on open is recompute the notice from that
 * result, which costs nothing and is the only way it can be right about a Helper
 * the user installed since.
 */
export class HelperUpdateNotifier implements HelperUpdateNoticeReader {
    private readonly dependencies: HelperUpdateNotifierDependencies;
    private readonly listeners = new Set<HelperUpdateNoticeListener>();
    private notice: HelperUpdateNotice = { state: "none" };
    private releases: HelperUpdateReleases | undefined;
    private isStarted = false;
    private lastFeedReadAtMonotonicMilliseconds: number | undefined;
    private inFlightCheck: Promise<void> | undefined;
    private checkTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(dependencies: HelperUpdateNotifierDependencies) {
        this.dependencies = dependencies;
    }

    /** Starts checking after the startup delay, and reschedules itself after each check. */
    start(): void {
        if (this.isStarted) {
            return;
        }

        this.isStarted = true;
        log.info(() => "helperUpdateNotifierStarted");
        this.scheduleNextCheck(INITIAL_CHECK_DELAY_MILLISECONDS);
    }

    readCachedNotice(): HelperUpdateNotice {
        return this.notice;
    }

    refreshNotice(): void {
        if (!this.isStarted) {
            return;
        }

        if (this.releases === undefined) {
            // check() dedupes against an in-flight one itself.
            void this.check();
            return;
        }

        // The releases already read still describe what the publisher offers, so
        // the only thing that can have changed is which of them this user is
        // behind. That is a pure recomputation: no feed read, no Helper call.
        const notice = this.selectNotice(this.releases);
        if (notice === undefined) {
            return;
        }

        const hasChanged = this.applyNotice(notice);
        if (hasChanged) {
            this.logNoticeResolved(notice, { trigger: "installedVersionChanged", hasChanged });
        }
    }

    /** Subscribes to notice changes so a check that lands later still reaches an open panel. */
    subscribe(listener: HelperUpdateNoticeListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Stops checking. */
    dispose(): void {
        this.isStarted = false;
        if (this.checkTimer !== undefined) {
            this.dependencies.clearTimer(this.checkTimer);
            this.checkTimer = undefined;
        }

        this.listeners.clear();
    }

    /**
     * Reads the feed and schedules the next check from what this one found.
     *
     * Each outcome asks for a different delay, so the check schedules its own
     * successor rather than being polled by a fixed tick. A tick would have to be
     * at least as short as the shortest delay to honor it, which means running
     * far more often than any outcome actually needs, and getting it wrong is
     * silent: a tick coarser than a retry delay simply makes that retry late.
     */
    private check(): Promise<void> {
        // The schedule and an opening panel can both ask for a check, so one is
        // never started while another is running.
        this.inFlightCheck ??= this.runScheduledCheck().finally(() => {
            this.inFlightCheck = undefined;
        });

        return this.inFlightCheck;
    }

    private async runScheduledCheck(): Promise<void> {
        try {
            this.scheduleNextCheck(await this.runCheck());
        } catch (error) {
            // A feed that cannot be read is not something the user can act on, and
            // the update they may be missing is not urgent enough to justify
            // showing them a network error. Retry sooner and stay quiet.
            log.info(() => `Helper update check failed: ${String(error)}`);
            this.scheduleNextCheck(FAILED_CHECK_RETRY_MILLISECONDS);
        }
    }

    /** Runs one check and reports how long to wait before the next one. */
    private async runCheck(): Promise<number> {
        const installedVersion = this.dependencies.readInstalledHelperVersion();
        if (installedVersion === undefined) {
            // Without the installed version there is nothing to compare a release
            // against. Guessing here would mean telling users who already run the
            // newest Helper that they must update, so the feed is left alone until
            // the Helper reports itself. This reads one cached field: it does no
            // I/O, and never touches the Helper or the network.
            //
            // It is logged rather than skipped silently because it is the state a
            // missing notice is almost always in, and a check that only reports
            // itself when it succeeds cannot tell anyone why nothing happened.
            log.atInfo()
                .everyMs("helper-update-version-unknown", UNKNOWN_VERSION_LOG_INTERVAL_MILLISECONDS)
                .log(() => "helperUpdateCheckSkipped reason=installedHelperVersionUnknown");
            return UNKNOWN_VERSION_RETRY_MILLISECONDS;
        }

        const throttledMilliseconds = this.readFeedThrottleRemainderMilliseconds();
        if (throttledMilliseconds > 0) {
            log.atInfo()
                .everyMs("helper-update-feed-read-throttled", FEED_READ_THROTTLED_LOG_INTERVAL_MILLISECONDS)
                .log(() => `helperUpdateCheckSkipped reason=feedReadThrottled retryInMs=${throttledMilliseconds}`);
            return throttledMilliseconds;
        }

        log.info(() => `helperUpdateCheckStarted installedVersion=${installedVersion}`);
        this.lastFeedReadAtMonotonicMilliseconds = this.dependencies.monotonicNowMilliseconds();
        this.releases = await this.dependencies.feed.readReleases();

        // Read the version again rather than reusing the one above: the feed read
        // went over the network, and the Helper may well have been installed while
        // it was in flight.
        const notice = this.selectNotice(this.releases) ?? { state: "none" };
        this.logNoticeResolved(notice, {
            trigger: "feedRead",
            hasChanged: this.applyNotice(notice),
        });
        return SUCCESSFUL_CHECK_INTERVAL_MILLISECONDS;
    }

    /** Recomputes the notice from known releases, or nothing while no Helper reports itself. */
    private selectNotice(releases: HelperUpdateReleases): HelperUpdateNotice | undefined {
        const installedVersion = this.dependencies.readInstalledHelperVersion();
        if (installedVersion === undefined) {
            return undefined;
        }

        return selectHelperUpdateNotice({
            items: releases.items,
            installedVersion,
            channel: releases.channel,
            phasedRolloutGroup: releases.phasedRolloutGroup,
            nowTimestampMilliseconds: this.dependencies.nowTimestampMilliseconds(),
        });
    }

    /** Reports how long the feed must be left alone, or zero when it may be read. */
    private readFeedThrottleRemainderMilliseconds(): number {
        if (this.lastFeedReadAtMonotonicMilliseconds === undefined) {
            return 0;
        }

        const elapsedMilliseconds = this.dependencies.monotonicNowMilliseconds()
            - this.lastFeedReadAtMonotonicMilliseconds;
        return Math.max(0, MINIMUM_FEED_READ_INTERVAL_MILLISECONDS - elapsedMilliseconds);
    }

    private scheduleNextCheck(delayMilliseconds: number): void {
        if (!this.isStarted) {
            return;
        }

        // An early check from an opening panel replaces the pending one rather
        // than racing it, so the next check is always measured from the last one
        // that actually ran.
        if (this.checkTimer !== undefined) {
            this.dependencies.clearTimer(this.checkTimer);
        }

        this.checkTimer = this.dependencies.setTimer(() => {
            void this.check();
        }, delayMilliseconds);
    }

    /** Records the notice and pushes it to open panels, reporting whether it changed. */
    private applyNotice(notice: HelperUpdateNotice): boolean {
        const hasChanged = notice.state !== this.notice.state
            || (notice.state === "updateAvailable"
                && this.notice.state === "updateAvailable"
                && (notice.urgency !== this.notice.urgency
                    || notice.availableVersion !== this.notice.availableVersion));
        this.notice = notice;
        if (!hasChanged) {
            return false;
        }

        for (const listener of this.listeners) {
            listener(notice);
        }

        return true;
    }

    /**
     * Reports one resolution, whichever path resolved it.
     *
     * Both paths write the same event with the same fields, so a support question
     * is one grep. Letting each caller word its own tail is how "changed=false"
     * and a bare "installedVersionChanged" ended up under one event name, which
     * meant grepping changed= silently missed every resolution the panel drove.
     */
    private logNoticeResolved(
        notice: HelperUpdateNotice,
        outcome: {
            readonly trigger: "feedRead" | "installedVersionChanged";
            readonly hasChanged: boolean;
        },
    ): void {
        log.info(() => [
            "helperUpdateNoticeResolved",
            `state=${notice.state}`,
            `urgency=${notice.state === "updateAvailable" ? notice.urgency : "none"}`,
            `availableVersion=${notice.state === "updateAvailable" ? notice.availableVersion : "none"}`,
            `trigger=${outcome.trigger}`,
            `changed=${outcome.hasChanged}`,
        ].join(" "));
    }
}

/** Tracks Helper updates for the published plugin. */
export const helperUpdateNotifier = new HelperUpdateNotifier({
    feed: helperUpdateFeed,
    readInstalledHelperVersion: () => (
        backgroundMetricCollection.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID)?.helperVersion
    ),
    monotonicNowMilliseconds,
    nowTimestampMilliseconds: wallClockNowMilliseconds,
    setTimer: (callback, delayMilliseconds) => {
        const timer = setTimeout(callback, delayMilliseconds);
        // A pending check must not hold the plugin process open at shutdown.
        timer.unref?.();
        return timer;
    },
    clearTimer: timer => {
        clearTimeout(timer);
    },
});
