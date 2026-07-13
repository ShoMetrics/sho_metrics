import assert from "node:assert/strict";
import { test } from "vitest";
import { tryCompareAppcastVersions } from "./appcast-version";

// The first vectors in each group are the ones UpdateVersionComparerTests.cs
// asserts. Both programs read the same feed, so a version they order differently
// makes the Control Panel and the Property Inspector disagree about whether an
// update exists. Change these vectors on both sides or not at all.
const NEWER_LEFT_VERSION_PAIRS = [
    ["0.2.0", "0.1.9"],
    ["1.0.0", "1.0.0-beta.1"],
    ["1.0.0-beta.2", "1.0.0-beta.1"],
    ["v1.0.1+build.5", "1.0.0"],
    ["1.0.0-beta.1", "1.0.0-alpha.9"],
    ["1.0.0-beta", "1.0.0-9"],
    ["1.0.0-beta.1", "1.0.0-beta"],
    ["1.10.0", "1.9.0"],
    // int.MaxValue is the largest segment the Control Panel can read, so it is
    // the largest one this may read. A version no release will ever carry, and
    // the only place the two languages' number types can be made to disagree.
    ["2147483647.0.0", "1.0.0"],
] as const;

const EQUIVALENT_VERSION_PAIRS = [
    ["0.1.0", "0.1"],
    ["v1.0.0+build.1", "1.0.0+build.2"],
    ["1.0.0-BETA.1", "1.0.0-beta.1"],
] as const;

// int.MaxValue + 1 overflows the Control Panel's int.TryParse, which skips the
// item. JavaScript would read it without complaint, so without this vector one
// program offers an update the other behaves as though nobody published.
const MALFORMED_VERSIONS = [
    "", "v", "1.bad.0", "1..0", "1.0.0-", "1.-1.0", "0x10", "2147483648.0.0",
] as const;

test("orders a newer appcast version above an older one", () => {
    for (const [newerVersion, olderVersion] of NEWER_LEFT_VERSION_PAIRS) {
        const forward = tryCompareAppcastVersions(newerVersion, olderVersion);
        const reverse = tryCompareAppcastVersions(olderVersion, newerVersion);

        assert.equal(forward.ok, true, `${newerVersion} vs ${olderVersion} must be readable`);
        assert.equal(reverse.ok, true, `${olderVersion} vs ${newerVersion} must be readable`);
        assert.equal(forward.ok && forward.comparison > 0, true, `${newerVersion} must outrank ${olderVersion}`);
        assert.equal(reverse.ok && reverse.comparison < 0, true, `${olderVersion} must rank below ${newerVersion}`);
    }
});

test("treats equivalent appcast versions as the same release", () => {
    for (const [left, right] of EQUIVALENT_VERSION_PAIRS) {
        const result = tryCompareAppcastVersions(left, right);

        assert.equal(result.ok, true, `${left} vs ${right} must be readable`);
        assert.equal(result.ok && result.comparison, 0, `${left} must equal ${right}`);
    }
});

test("reports malformed appcast versions instead of throwing", () => {
    for (const malformedVersion of MALFORMED_VERSIONS) {
        assert.equal(
            tryCompareAppcastVersions(malformedVersion, "0.1.0").ok,
            false,
            `${malformedVersion} must not be readable`,
        );
        assert.equal(
            tryCompareAppcastVersions("0.1.0", malformedVersion).ok,
            false,
            `${malformedVersion} must not be readable on either side`,
        );
    }
});
