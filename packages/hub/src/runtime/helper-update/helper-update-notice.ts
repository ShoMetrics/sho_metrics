import type { AppcastItem } from "./appcast-parser";
import { tryCompareAppcastVersions } from "./appcast-version";

/**
 * How soon the publisher is asking the user to install a Helper release.
 *
 * This says how urgently to act, not what kind of defect prompted the release: a
 * security fix and a serious functional regression both need the user to move
 * now, and a value named after either one would lie about the other. The feed
 * expresses the top level with Sparkle's existing criticalUpdate marker, whose
 * published meaning already is "install before continuing".
 */
export type HelperUpdateUrgency = "routine" | "required";

/** A Helper release the installed Helper is behind, if there is one. */
export type HelperUpdateNotice =
    | { readonly state: "none" }
    | {
        readonly state: "updateAvailable";
        readonly urgency: HelperUpdateUrgency;
        readonly availableVersion: string;
    };

/**
 * Update channel the Property Inspector reads the feed as.
 *
 * The Control Panel has a third channel, Dev, reachable through an environment
 * variable at run time. The Property Inspector deliberately has no runtime
 * channel override at all: what feed a plugin reads is fixed when it is built.
 * There is therefore no way for it to be a dev client, and an item published to
 * the dev channel is invisible to every user's panel. That is the intent, and
 * leaving "dev" in this union would make it look accidental.
 */
export type HelperUpdateChannel = "prod" | "staging";

interface HelperUpdateNoticeSelection {
    readonly items: readonly AppcastItem[];
    readonly installedVersion: string;
    readonly channel: HelperUpdateChannel;
    readonly phasedRolloutGroup: number | undefined;
    readonly nowTimestampMilliseconds: number;
}

/**
 * Selects the notice for every release the installed Helper is behind.
 *
 * Urgency is the strongest urgency among all newer releases, not the urgency of
 * the newest one. A user still on 0.1.0 when 0.2.0 was critical and 0.2.1 was
 * routine is exactly the user the critical release was published for, and
 * reading only the newest item would leave them with a routine notice. The
 * offered version stays the newest release, because that is the one they should
 * install; which intermediate release carried the fix is not something the user
 * needs to act on.
 *
 * SelectMissedUpdates in UpdateAppcastClient.cs answers the same question for the
 * Control Panel and is kept in step with this, with one PENDING exception
 * documented there: the panel also drops any release whose download link is not
 * one it will let the user click, and dropping it takes its critical marker with
 * it. Nothing here can drop an item for that reason, because the plugin reads no
 * URL from the feed at all: the download button opens a fixed page. So a release
 * published with a wrong link reads as required here and routine there.
 */
export function selectHelperUpdateNotice(selection: HelperUpdateNoticeSelection): HelperUpdateNotice {
    const eligibleItems = selection.items.filter(item => (
        isAllowedChannel(item.channel, selection.channel)
        && isNewerVersion(item.version, selection.installedVersion)
        && isReadyForPhasedRollout(item, selection.phasedRolloutGroup, selection.nowTimestampMilliseconds)
    ));

    const newestItem = eligibleItems.reduce<AppcastItem | undefined>(
        (newest, item) => (newest === undefined || isNewerVersion(item.version, newest.version) ? item : newest),
        undefined,
    );
    if (newestItem === undefined) {
        return { state: "none" };
    }

    return {
        state: "updateAvailable",
        urgency: eligibleItems.some(item => item.isCritical) ? "required" : "routine",
        availableVersion: newestItem.version,
    };
}

/** Reports whether one version is newer, treating a version neither side can read as not newer. */
function isNewerVersion(version: string, otherVersion: string): boolean {
    const result = tryCompareAppcastVersions(version, otherVersion);
    return result.ok && result.comparison > 0;
}

function isAllowedChannel(itemChannel: string | undefined, channel: HelperUpdateChannel): boolean {
    // An item without a channel is published to every channel, matching
    // UpdateAppcastClient.IsAllowedChannel.
    if (itemChannel === undefined) {
        return true;
    }

    return itemChannel.toLowerCase() === channel;
}

function isReadyForPhasedRollout(
    item: AppcastItem,
    phasedRolloutGroup: number | undefined,
    nowTimestampMilliseconds: number,
): boolean {
    if (
        item.isCritical
        || phasedRolloutGroup === undefined
        || item.phasedRolloutIntervalSeconds === undefined
        || item.publishedAtTimestampMilliseconds === undefined
    ) {
        return true;
    }

    // Sparkle exposes one more rollout group after each interval from the item's
    // pubDate. A required update intentionally bypasses the gate: staging the
    // rollout of a release the user must install would be staging the fix.
    const elapsedMilliseconds = nowTimestampMilliseconds - item.publishedAtTimestampMilliseconds;
    const groupDelayMilliseconds = item.phasedRolloutIntervalSeconds * 1000 * phasedRolloutGroup;
    return elapsedMilliseconds >= groupDelayMilliseconds;
}
