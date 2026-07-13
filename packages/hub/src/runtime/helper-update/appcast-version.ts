/**
 * Compares the update version shapes ShoMetrics publishes in its appcast.
 *
 * This is a deliberate port of the Control Panel's UpdateVersionComparer.cs, not
 * a general package-version parser: both programs read the same feed and must
 * agree on which release is newer, or the panel and the Property Inspector will
 * disagree about whether an update exists. The shared test vectors in
 * appcast-version.test.ts and UpdateVersionComparerTests.cs guard that.
 *
 * Supported shapes: numeric segments with an optional v-prefix, SemVer-style
 * prerelease identifiers, and build metadata. If eligibility ever needs more
 * than this, both sides adopt a library together.
 */

interface ParsedAppcastVersion {
    readonly numericIdentifiers: readonly number[];
    readonly prereleaseIdentifiers: readonly string[];
}

/**
 * Compares two appcast versions, or reports that either one is unreadable.
 *
 * Malformed feed versions are a normal outcome rather than a fault: one bad item
 * must not fail the whole update check, so callers skip what they cannot read.
 */
export function tryCompareAppcastVersions(
    left: string,
    right: string,
): { readonly ok: true; readonly comparison: number } | { readonly ok: false } {
    const leftVersion = parseAppcastVersion(left);
    const rightVersion = parseAppcastVersion(right);
    if (leftVersion === undefined || rightVersion === undefined) {
        return { ok: false };
    }

    const numericComparison = compareNumericIdentifiers(
        leftVersion.numericIdentifiers,
        rightVersion.numericIdentifiers,
    );
    if (numericComparison !== 0) {
        return { ok: true, comparison: numericComparison };
    }

    const hasLeftPrerelease = leftVersion.prereleaseIdentifiers.length > 0;
    const hasRightPrerelease = rightVersion.prereleaseIdentifiers.length > 0;
    if (!hasLeftPrerelease && !hasRightPrerelease) {
        return { ok: true, comparison: 0 };
    }

    // A release outranks any prerelease of the same numeric version.
    if (!hasLeftPrerelease) {
        return { ok: true, comparison: 1 };
    }

    if (!hasRightPrerelease) {
        return { ok: true, comparison: -1 };
    }

    return {
        ok: true,
        comparison: comparePrereleaseIdentifiers(
            leftVersion.prereleaseIdentifiers,
            rightVersion.prereleaseIdentifiers,
        ),
    };
}

function parseAppcastVersion(value: string): ParsedAppcastVersion | undefined {
    let coreVersion = value.trim();
    if (coreVersion.toLowerCase().startsWith("v")) {
        coreVersion = coreVersion.slice(1);
    }

    if (coreVersion.length === 0) {
        return undefined;
    }

    const metadataIndex = coreVersion.indexOf("+");
    if (metadataIndex >= 0) {
        coreVersion = coreVersion.slice(0, metadataIndex);
    }

    const prereleaseIndex = coreVersion.indexOf("-");
    const numericText = (prereleaseIndex >= 0 ? coreVersion.slice(0, prereleaseIndex) : coreVersion).trim();
    const prereleaseText = prereleaseIndex >= 0 ? coreVersion.slice(prereleaseIndex + 1).trim() : undefined;

    const numericIdentifiers: number[] = [];
    for (const numericIdentifierText of numericText.split(".")) {
        const numericIdentifier = parseNumericIdentifier(numericIdentifierText.trim());
        if (numericIdentifier === undefined) {
            return undefined;
        }

        numericIdentifiers.push(numericIdentifier);
    }

    if (prereleaseText === undefined) {
        return { numericIdentifiers, prereleaseIdentifiers: [] };
    }

    const prereleaseIdentifiers = prereleaseText
        .split(".")
        .map(identifier => identifier.trim())
        .filter(identifier => identifier.length > 0);

    // A dash with nothing readable after it is a malformed version, not a
    // release: refusing it keeps "1.0.0-" from ranking as newer than "1.0.0".
    return prereleaseIdentifiers.length === 0
        ? undefined
        : { numericIdentifiers, prereleaseIdentifiers };
}

/**
 * Largest numeric segment a version may carry, which is int.MaxValue.
 *
 * The Control Panel parses these with int.TryParse, so a segment past this is a
 * version it cannot read and skips. JavaScript would read it happily, all the way
 * to Number.MAX_SAFE_INTEGER, and the two programs would then disagree about
 * whether the item exists at all: one would offer the update and the other would
 * act as though it had never been published. No release will ever carry a segment
 * this large, which is exactly why the limit has to be written down rather than
 * left to whichever language happens to be reading.
 */
const MAXIMUM_VERSION_NUMERIC_IDENTIFIER = 2_147_483_647;

function parseNumericIdentifier(value: string): number | undefined {
    // Digits only, matching the C# NumberStyles.None parse: no sign, no
    // exponent, and no leading "0x" that Number() would otherwise accept.
    if (!/^\d+$/u.test(value)) {
        return undefined;
    }

    const numericValue = Number(value);
    return Number.isSafeInteger(numericValue) && numericValue <= MAXIMUM_VERSION_NUMERIC_IDENTIFIER
        ? numericValue
        : undefined;
}

function compareNumericIdentifiers(left: readonly number[], right: readonly number[]): number {
    // Missing trailing segments read as zero, so "1.2" and "1.2.0" are the same
    // release.
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index++) {
        const comparison = compareNumbers(left[index] ?? 0, right[index] ?? 0);
        if (comparison !== 0) {
            return comparison;
        }
    }

    return 0;
}

function comparePrereleaseIdentifiers(left: readonly string[], right: readonly string[]): number {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index++) {
        const leftIdentifier = left[index];
        const rightIdentifier = right[index];
        // A shorter prerelease is the earlier one once every shared identifier
        // matches: "alpha" precedes "alpha.1".
        if (leftIdentifier === undefined) {
            return -1;
        }

        if (rightIdentifier === undefined) {
            return 1;
        }

        const comparison = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
        if (comparison !== 0) {
            return comparison;
        }
    }

    return 0;
}

function comparePrereleaseIdentifier(left: string, right: string): number {
    const leftNumber = parseNumericIdentifier(left);
    const rightNumber = parseNumericIdentifier(right);

    if (leftNumber !== undefined && rightNumber !== undefined) {
        return compareNumbers(leftNumber, rightNumber);
    }

    // Numeric identifiers rank below alphanumeric ones, as in SemVer.
    if (leftNumber !== undefined) {
        return -1;
    }

    if (rightNumber !== undefined) {
        return 1;
    }

    // Case-insensitive ordinal comparison, matching the C# side. Published
    // prerelease identifiers are ASCII, where uppercasing both operands is
    // equivalent to the invariant ordinal-ignore-case ordering.
    const leftUpper = left.toUpperCase();
    const rightUpper = right.toUpperCase();
    if (leftUpper === rightUpper) {
        return 0;
    }

    return leftUpper < rightUpper ? -1 : 1;
}

function compareNumbers(left: number, right: number): number {
    if (left === right) {
        return 0;
    }

    return left < right ? -1 : 1;
}
