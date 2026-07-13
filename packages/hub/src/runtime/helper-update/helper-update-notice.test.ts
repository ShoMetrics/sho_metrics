import assert from "node:assert/strict";
import { test } from "vitest";
import type { AppcastItem } from "./appcast-parser";
import {
    selectHelperUpdateNotice,
    type HelperUpdateChannel,
    type HelperUpdateNotice,
} from "./helper-update-notice";

const PUBLISHED_AT_MILLISECONDS = Date.parse("2025-01-01T00:00:00Z");
const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * Every release the feed under test publishes, oldest first.
 *
 * One fixed feed, so a row varies only in what the user has installed and which
 * releases carry the critical marker. Those are the two inputs urgency is a
 * function of, and holding the feed still is what makes a row's outcome
 * attributable to them. Whenever an update is offered it is 0.2.1, because the
 * newest missed release is always the one to install.
 */
const FEED_VERSIONS = ["0.0.9", "0.1.0", "0.2.0", "0.2.1"] as const;

// UpdateAppcastClientTests.CheckAsyncClassifiesUrgencyOnlyFromMissedReleases is
// this same table. Both surfaces read the same feed, and a user told to install
// something urgently in one and casually in the other trusts neither.
const URGENCY_CASES: readonly {
    readonly name: string;
    readonly installedVersion: string;
    readonly criticalVersions: readonly string[];
    readonly expected: HelperUpdateNotice;
}[] = [
    {
        name: "requires the offer when the newest missed release is critical",
        installedVersion: "0.1.0",
        criticalVersions: ["0.2.1"],
        expected: requiredNotice("0.2.1"),
    },
    {
        name: "requires the offer when a missed release before it is critical",
        // The version-skip case. The user stopped before the critical release, so
        // reading urgency off the newest release alone tells exactly the user it
        // was published for that the fix is optional. Installing 0.2.1 still
        // carries the fix, so it stays the offer; only the pressure changes.
        installedVersion: "0.1.0",
        criticalVersions: ["0.2.0"],
        expected: requiredNotice("0.2.1"),
    },
    {
        name: "requires the offer when every missed release is critical",
        installedVersion: "0.1.0",
        criticalVersions: ["0.2.0", "0.2.1"],
        expected: requiredNotice("0.2.1"),
    },
    {
        name: "leaves the offer routine when no missed release is critical",
        installedVersion: "0.1.0",
        criticalVersions: [],
        expected: routineNotice("0.2.1"),
    },
    {
        name: "leaves the offer routine when the installed release is the critical one",
        // A release the user is already on is not one they are behind. This is the
        // marker that would fire forever if urgency were read from the whole feed.
        installedVersion: "0.1.0",
        criticalVersions: ["0.1.0"],
        expected: routineNotice("0.2.1"),
    },
    {
        name: "leaves the offer routine when a release older than the installed one is critical",
        installedVersion: "0.1.0",
        criticalVersions: ["0.0.9"],
        expected: routineNotice("0.2.1"),
    },
    {
        name: "leaves the offer routine when every critical release is already behind the user",
        installedVersion: "0.1.0",
        criticalVersions: ["0.0.9", "0.1.0"],
        expected: routineNotice("0.2.1"),
    },
    {
        name: "says nothing when the critical release is the newest and it is installed",
        installedVersion: "0.2.1",
        criticalVersions: ["0.2.1"],
        expected: { state: "none" },
    },
    {
        name: "says nothing when a critical release is behind a fully updated user",
        installedVersion: "0.2.1",
        criticalVersions: ["0.2.0"],
        expected: { state: "none" },
    },
];

test.each(URGENCY_CASES)("$name", ({ installedVersion, criticalVersions, expected }) => {
    const notice = selectHelperUpdateNotice(buildSelection({
        installedVersion,
        items: FEED_VERSIONS.map(version => buildItem({
            version,
            isCritical: criticalVersions.includes(version),
        })),
    }));

    assert.deepEqual(notice, expected);
});

test("does not let a critical release on another channel raise urgency", () => {
    // Urgency is read from the releases this user could install, not from every
    // marker in the feed. A release filtered out for its channel is one of the
    // former, and counting it would press a user to install something they are
    // never going to be offered.
    const notice = selectHelperUpdateNotice(buildSelection({
        installedVersion: "0.1.0",
        channel: "prod",
        items: [
            buildItem({ version: "0.2.0", channel: "dev", isCritical: true }),
            buildItem({ version: "0.2.1", channel: "prod" }),
        ],
    }));

    assert.deepEqual(notice, routineNotice("0.2.1"));
});

test("does not let a critical release with an unreadable version raise urgency", () => {
    // The same rule for the other reason an item is skipped. A version nothing can
    // compare cannot be shown to be newer than the installed one, so it cannot be
    // shown to be missed either.
    const notice = selectHelperUpdateNotice(buildSelection({
        installedVersion: "0.1.0",
        items: [
            buildItem({ version: "9.bad.0", isCritical: true }),
            buildItem({ version: "0.2.1" }),
        ],
    }));

    assert.deepEqual(notice, routineNotice("0.2.1"));
});

function routineNotice(availableVersion: string): HelperUpdateNotice {
    return { state: "updateAvailable", urgency: "routine", availableVersion };
}

function requiredNotice(availableVersion: string): HelperUpdateNotice {
    return { state: "updateAvailable", urgency: "required", availableVersion };
}

test("offers only releases published to the configured channel", () => {
    const notice = selectHelperUpdateNotice(buildSelection({
        installedVersion: "0.1.0",
        channel: "prod",
        items: [
            buildItem({ version: "0.9.0", channel: "dev" }),
            buildItem({ version: "0.3.0", channel: "prod" }),
            // An item without a channel is published to every channel.
            buildItem({ version: "0.2.0" }),
        ],
    }));

    assert.deepEqual(notice, {
        state: "updateAvailable",
        urgency: "routine",
        availableVersion: "0.3.0",
    });
});

test("holds a routine release back until this user's rollout group is reached", () => {
    const selection = {
        installedVersion: "0.1.0",
        items: [buildItem({ version: "0.2.0", phasedRolloutIntervalSeconds: 86_400 })],
        phasedRolloutGroup: 3,
    };

    const beforeGroup = selectHelperUpdateNotice(buildSelection({
        ...selection,
        nowTimestampMilliseconds: PUBLISHED_AT_MILLISECONDS + (2 * ONE_DAY_MILLISECONDS),
    }));
    const atGroup = selectHelperUpdateNotice(buildSelection({
        ...selection,
        nowTimestampMilliseconds: PUBLISHED_AT_MILLISECONDS + (3 * ONE_DAY_MILLISECONDS),
    }));

    assert.deepEqual(beforeGroup, { state: "none" });
    assert.equal(atGroup.state, "updateAvailable");
});

test("lets a required release bypass the rollout gate", () => {
    // Staging the rollout of a release the user must install would be staging the
    // fix itself.
    const notice = selectHelperUpdateNotice(buildSelection({
        installedVersion: "0.1.0",
        items: [buildItem({ version: "0.2.0", isCritical: true, phasedRolloutIntervalSeconds: 86_400 })],
        phasedRolloutGroup: 6,
        nowTimestampMilliseconds: PUBLISHED_AT_MILLISECONDS,
    }));

    assert.deepEqual(notice, {
        state: "updateAvailable",
        urgency: "required",
        availableVersion: "0.2.0",
    });
});

test("ignores a release whose version cannot be read", () => {
    const notice = selectHelperUpdateNotice(buildSelection({
        installedVersion: "0.1.0",
        items: [buildItem({ version: "9.bad.0" }), buildItem({ version: "0.2.0" })],
    }));

    assert.deepEqual(notice, {
        state: "updateAvailable",
        urgency: "routine",
        availableVersion: "0.2.0",
    });
});

function buildSelection(overrides: {
    readonly items: readonly AppcastItem[];
    readonly installedVersion: string;
    // The channel a panel reads as, which is never "dev": a feed item may be
    // published to the dev channel, and no panel is ever in it.
    readonly channel?: HelperUpdateChannel;
    readonly phasedRolloutGroup?: number;
    readonly nowTimestampMilliseconds?: number;
}) {
    return {
        items: overrides.items,
        installedVersion: overrides.installedVersion,
        channel: overrides.channel ?? "prod",
        phasedRolloutGroup: overrides.phasedRolloutGroup,
        nowTimestampMilliseconds: overrides.nowTimestampMilliseconds ?? PUBLISHED_AT_MILLISECONDS,
    };
}

function buildItem(overrides: {
    readonly version: string;
    readonly channel?: string;
    readonly isCritical?: boolean;
    readonly phasedRolloutIntervalSeconds?: number;
}): AppcastItem {
    return {
        version: overrides.version,
        channel: overrides.channel,
        isCritical: overrides.isCritical ?? false,
        publishedAtTimestampMilliseconds: PUBLISHED_AT_MILLISECONDS,
        phasedRolloutIntervalSeconds: overrides.phasedRolloutIntervalSeconds,
    };
}
