import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Number of groups a phased rollout is spread across.
 *
 * This must stay equal to UpdatePhasedRollout.GroupCount in UpdatePhasedRollout.cs,
 * which Test-WindowsInstallerInvariants.ps1 asserts.
 * The Control Panel and the Property Inspector place the same user in the same
 * group, so a staged release either reaches both or neither. A user who sees an
 * update in one surface and not the other reads it as a bug in whichever surface
 * disagrees with the one they trust.
 */
export const PHASED_ROLLOUT_GROUP_COUNT = 7;

/**
 * Assigns the current user to a phased-rollout group, or reports that it cannot.
 *
 * The group is derived from the Windows user SID exactly as the Control Panel
 * derives it: SHA-256 of the SID text, then the first four bytes read as a
 * little-endian signed 32-bit integer, cleared of its sign bit, modulo the group
 * count. The cross-language vectors in phased-rollout.test.ts and
 * UpdatePhasedRolloutTests.cs pin that byte order: two of them hash to a negative
 * int32, so dropping the sign-bit mask fails on both sides.
 *
 * An unresolved SID means no group, which the caller treats the way the Control
 * Panel does: rollout gating is skipped rather than guessed.
 */
export async function readPhasedRolloutGroup(
    readUserSecurityIdentifier: () => Promise<string | undefined> = readWindowsUserSecurityIdentifier,
): Promise<number | undefined> {
    const userSecurityIdentifier = await readUserSecurityIdentifier();
    if (userSecurityIdentifier === undefined || userSecurityIdentifier.length === 0) {
        return undefined;
    }

    return computePhasedRolloutGroup(userSecurityIdentifier);
}

/** Computes the phased-rollout group for one Windows user SID. */
export function computePhasedRolloutGroup(userSecurityIdentifier: string): number {
    const hash = createHash("sha256").update(userSecurityIdentifier, "utf8").digest();
    // BitConverter.ToInt32 on a little-endian host, then & int.MaxValue: read the
    // same four bytes in the same order and drop the sign bit.
    const hashPrefix = hash.readInt32LE(0) & 0x7fff_ffff;
    return hashPrefix % PHASED_ROLLOUT_GROUP_COUNT;
}

async function readWindowsUserSecurityIdentifier(): Promise<string | undefined> {
    if (process.platform !== "win32") {
        return undefined;
    }

    try {
        const { stdout } = await execFileAsync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true });
        return parseWindowsUserSecurityIdentifier(stdout);
    } catch {
        // No SID means no rollout gating, which is the same outcome the Control
        // Panel takes when Windows refuses the identity lookup.
        return undefined;
    }
}

/** Reads the SID out of `whoami /user /fo csv /nh` output. */
export function parseWindowsUserSecurityIdentifier(commandOutput: string): string | undefined {
    // The unquoted row is "DOMAIN\user","S-1-5-21-...". Take the last quoted
    // field rather than splitting on commas, because the account name can
    // contain one.
    const match = /"(S-1-[0-9-]+)"\s*$/mu.exec(commandOutput.trim());
    return match?.[1];
}
