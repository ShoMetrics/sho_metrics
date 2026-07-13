import assert from "node:assert/strict";
import { test } from "vitest";
import type { AppcastItem } from "./appcast-parser";
import type { HelperUpdateReleases } from "./helper-update-feed";
import { HelperUpdateNotifier } from "./helper-update-notifier";
import type { HelperUpdateNotice } from "./helper-update-notice";

const ONE_SECOND_MILLISECONDS = 1000;
const ONE_MINUTE_MILLISECONDS = 60 * ONE_SECOND_MILLISECONDS;
const ONE_HOUR_MILLISECONDS = 60 * ONE_MINUTE_MILLISECONDS;

test("reads no feed during plugin startup", async () => {
    // Startup already connects to Stream Deck, loads settings, opens the Helper
    // pipe, and renders every visible key. An update feed is the least urgent
    // thing in that window and must not compete for it.
    const context = buildNotifierContext();

    context.notifier.start();
    await context.settle();

    assert.equal(context.readReleasesCalls, 0);
    assert.equal(context.pendingDelayMilliseconds(), 15 * ONE_SECOND_MILLISECONDS);

    await context.fireTimer();

    assert.deepEqual(context.notifier.readCachedNotice(), routineNotice("0.2.0"));
});

test("retries quickly while the installed Helper version is unknown", async () => {
    // The Helper identifies itself in the health call the source client makes
    // when it first connects, which the descriptor preload opens at plugin
    // startup. The first checks can land before that handshake finishes and find
    // no version to compare against. If the retry is slower than the Helper is to
    // answer, the notice is simply missing for that long.
    const context = buildNotifierContext({ installedVersion: undefined });

    context.notifier.start();
    await context.fireTimer();

    assert.equal(context.readReleasesCalls, 0);
    assert.deepEqual(context.notifier.readCachedNotice(), { state: "none" });
    assert.equal(context.pendingDelayMilliseconds(), 15 * ONE_SECOND_MILLISECONDS);

    context.installedVersion = "0.1.0";
    await context.fireTimer();

    assert.deepEqual(context.notifier.readCachedNotice(), routineNotice("0.2.0"));
});

test("resolves the first notice for a panel that opens before the schedule does", async () => {
    // Opening the panel is the moment the notice matters. Making that user wait
    // out the startup delay would leave them with no notice for no reason.
    const context = buildNotifierContext();

    context.notifier.start();
    context.notifier.refreshNotice();
    await context.settle();

    assert.deepEqual(context.notifier.readCachedNotice(), routineNotice("0.2.0"));
    assert.equal(context.readReleasesCalls, 1);
    // The early check replaces the pending one rather than racing it.
    assert.equal(context.pendingDelayMilliseconds(), 24 * ONE_HOUR_MILLISECONDS);
});

test("drops the notice once the user installs the update it asked for", async () => {
    // This is the whole reason the feed and the notice are read apart. The user
    // acted on the notice, so the Helper that reports itself now is a newer one,
    // and the releases we already hold say nothing new. Tying the recomputation
    // to the next feed read would leave the panel telling them to install what
    // they just installed, for up to a day.
    const context = buildNotifierContext();

    context.notifier.start();
    await context.fireTimer();

    assert.deepEqual(context.notifier.readCachedNotice(), routineNotice("0.2.0"));

    context.installedVersion = "0.2.0";
    context.notifier.refreshNotice();

    assert.deepEqual(context.notifier.readCachedNotice(), { state: "none" });
    assert.equal(context.readReleasesCalls, 1);
});

test("pushes the dropped notice to a panel that is already open", async () => {
    const context = buildNotifierContext();
    const pushedNotices: HelperUpdateNotice[] = [];
    context.notifier.subscribe(notice => pushedNotices.push(notice));

    context.notifier.start();
    await context.fireTimer();

    context.installedVersion = "0.2.0";
    context.notifier.refreshNotice();

    assert.deepEqual(pushedNotices, [routineNotice("0.2.0"), { state: "none" }]);
});

test("recomputes the notice without reading the feed again", async () => {
    const context = buildNotifierContext();

    context.notifier.start();
    await context.fireTimer();

    for (let openCount = 0; openCount < 10; openCount++) {
        context.notifier.refreshNotice();
    }

    assert.equal(context.readReleasesCalls, 1);
    assert.deepEqual(context.notifier.readCachedNotice(), routineNotice("0.2.0"));
});

test("caps how often the feed is read even while no notice has resolved", async () => {
    // A panel that keeps opening while the feed keeps failing is the case the
    // per-caller guards miss: no releases have been read, so every open is
    // entitled to ask for them. The cap does not depend on the caller behaving.
    const context = buildNotifierContext();
    context.failNextReads = true;

    context.notifier.start();
    await context.fireTimer();

    assert.equal(context.readReleasesCalls, 1);

    for (let openCount = 0; openCount < 5; openCount++) {
        context.advanceMilliseconds(5 * ONE_SECOND_MILLISECONDS);
        context.notifier.refreshNotice();
        await context.settle();
    }

    assert.equal(context.readReleasesCalls, 1);

    context.advanceMilliseconds(ONE_MINUTE_MILLISECONDS);
    context.failNextReads = false;
    context.notifier.refreshNotice();
    await context.settle();

    assert.equal(context.readReleasesCalls, 2);
    assert.deepEqual(context.notifier.readCachedNotice(), routineNotice("0.2.0"));
});

test("checks once a day after a successful check", async () => {
    const context = buildNotifierContext();

    context.notifier.start();
    await context.fireTimer();

    assert.equal(context.pendingDelayMilliseconds(), 24 * ONE_HOUR_MILLISECONDS);

    await context.fireTimer();

    assert.equal(context.readReleasesCalls, 2);
});

test("keeps the last notice and retries sooner when the feed cannot be read", async () => {
    const context = buildNotifierContext();
    context.notifier.start();
    await context.fireTimer();

    context.failNextReads = true;
    await context.fireTimer();

    // A feed the user cannot act on is not worth showing them a network error
    // over, and the notice they already have stays true.
    assert.deepEqual(context.notifier.readCachedNotice(), routineNotice("0.2.0"));
    assert.equal(context.pendingDelayMilliseconds(), 30 * ONE_MINUTE_MILLISECONDS);

    context.failNextReads = false;
    await context.fireTimer();

    assert.equal(context.pendingDelayMilliseconds(), 24 * ONE_HOUR_MILLISECONDS);
});

test("pushes a notice that resolves after a panel is already open", async () => {
    const context = buildNotifierContext();
    const pushedNotices: HelperUpdateNotice[] = [];
    context.notifier.subscribe(notice => pushedNotices.push(notice));

    context.notifier.start();
    await context.fireTimer();

    assert.deepEqual(pushedNotices, [routineNotice("0.2.0")]);
});

test("pushes only when the notice actually changes", async () => {
    const context = buildNotifierContext();
    const pushedNotices: HelperUpdateNotice[] = [];
    context.notifier.subscribe(notice => pushedNotices.push(notice));

    context.notifier.start();
    await context.fireTimer();
    await context.fireTimer();

    assert.equal(pushedNotices.length, 1);

    context.releases = buildReleases(criticalItem("0.2.1"));
    await context.fireTimer();

    assert.deepEqual(pushedNotices[1], {
        state: "updateAvailable",
        urgency: "required",
        availableVersion: "0.2.1",
    });
});

test("stops checking once disposed", async () => {
    const context = buildNotifierContext();

    context.notifier.start();
    await context.fireTimer();
    context.notifier.dispose();

    assert.equal(context.pendingTimer, undefined);
});

function routineNotice(availableVersion: string): HelperUpdateNotice {
    return { state: "updateAvailable", urgency: "routine", availableVersion };
}

function routineItem(version: string): AppcastItem {
    return {
        version,
        channel: undefined,
        isCritical: false,
        publishedAtTimestampMilliseconds: undefined,
        phasedRolloutIntervalSeconds: undefined,
    };
}

function criticalItem(version: string): AppcastItem {
    return { ...routineItem(version), isCritical: true };
}

function buildReleases(...items: readonly AppcastItem[]): HelperUpdateReleases {
    return { items, channel: "prod", phasedRolloutGroup: undefined };
}

function buildNotifierContext(options: { readonly installedVersion?: string | undefined } = {}) {
    const context = {
        releases: buildReleases(routineItem("0.2.0")),
        installedVersion: "installedVersion" in options ? options.installedVersion : "0.1.0",
        failNextReads: false,
        readReleasesCalls: 0,
        monotonicMilliseconds: 0,
        advanceMilliseconds(milliseconds: number): void {
            context.monotonicMilliseconds += milliseconds;
        },
        pendingTimer: undefined as { callback: () => void; delayMilliseconds: number } | undefined,
        pendingDelayMilliseconds(): number | undefined {
            return context.pendingTimer?.delayMilliseconds;
        },
        /** Lets the in-flight check settle so its rescheduled timer is registered. */
        async settle(): Promise<void> {
            await new Promise(resolve => setImmediate(resolve));
        },
        /** Advances the clock by the scheduled delay, fires the check, and lets it settle. */
        async fireTimer(): Promise<void> {
            const timer = context.pendingTimer;
            if (timer === undefined) {
                throw new Error("No check is scheduled.");
            }

            // Firing a timer means its delay elapsed. Leaving the clock behind
            // would let the feed-read cap fire against checks the schedule spaced
            // out correctly, which is the opposite of what it is for.
            context.advanceMilliseconds(timer.delayMilliseconds);
            context.pendingTimer = undefined;
            timer.callback();
            await context.settle();
        },
        notifier: undefined as unknown as HelperUpdateNotifier,
    };

    context.notifier = new HelperUpdateNotifier({
        feed: {
            readReleases: () => {
                context.readReleasesCalls++;
                return context.failNextReads
                    ? Promise.reject(new Error("feed unreachable"))
                    : Promise.resolve(context.releases);
            },
        },
        readInstalledHelperVersion: () => context.installedVersion,
        monotonicNowMilliseconds: () => context.monotonicMilliseconds,
        // No item under test carries a pubDate, so the phased rollout gate never
        // consults this: the releases are eligible from the moment they exist.
        nowTimestampMilliseconds: () => 0,
        setTimer: (callback, delayMilliseconds) => {
            context.pendingTimer = { callback, delayMilliseconds };
            return context.pendingTimer as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: () => {
            context.pendingTimer = undefined;
        },
    });

    return context;
}
