import assert from "node:assert/strict";
import { test } from "vitest";
import {
    PHASED_ROLLOUT_GROUP_COUNT,
    computePhasedRolloutGroup,
    parseWindowsUserSecurityIdentifier,
    readPhasedRolloutGroup,
} from "./phased-rollout";

// UpdatePhasedRolloutTests.cs asserts these exact pairs. They are the only thing
// standing between us and a rollout that reaches the Control Panel but not the
// Property Inspector for the same user, so the two files must be changed
// together or not at all. The third and fourth SIDs hash to a negative int32,
// which is what pins the sign-bit masking rather than the byte order alone.
const ROLLOUT_GROUP_BY_USER_SECURITY_IDENTIFIER = [
    ["S-1-5-21-1111111111-2222222222-3333333333-1001", 1],
    ["S-1-5-21-9876543210-1234567890-1122334455-500", 6],
    ["S-1-5-18", 6],
    ["S-1-5-21-0-0-0-1", 1],
] as const;

test("assigns each Windows user the same rollout group the Control Panel assigns", () => {
    for (const [userSecurityIdentifier, expectedGroup] of ROLLOUT_GROUP_BY_USER_SECURITY_IDENTIFIER) {
        assert.equal(
            computePhasedRolloutGroup(userSecurityIdentifier),
            expectedGroup,
            `${userSecurityIdentifier} must land in group ${expectedGroup}`,
        );
    }
});

test("keeps every rollout group inside the published group count", () => {
    for (let index = 0; index < 200; index++) {
        const group = computePhasedRolloutGroup(`S-1-5-21-0-0-0-${index}`);

        assert.equal(group >= 0 && group < PHASED_ROLLOUT_GROUP_COUNT, true, `group ${group} is out of range`);
    }
});

test("reads the security identifier from the whoami CSV row", () => {
    assert.equal(
        parseWindowsUserSecurityIdentifier('"desktop\\some, user","S-1-5-21-1-2-3-1001"\r\n'),
        "S-1-5-21-1-2-3-1001",
    );
    assert.equal(parseWindowsUserSecurityIdentifier(""), undefined);
    assert.equal(parseWindowsUserSecurityIdentifier('"desktop\\user","not-a-sid"'), undefined);
});

test("skips rollout gating when the security identifier cannot be read", async () => {
    assert.equal(await readPhasedRolloutGroup(() => Promise.resolve(undefined)), undefined);
    assert.equal(await readPhasedRolloutGroup(() => Promise.resolve("")), undefined);
});
