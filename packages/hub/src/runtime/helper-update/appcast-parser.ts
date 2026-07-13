import { XmlElement, parseXml } from "@rgrove/parse-xml";

/**
 * Reads the fields the update notice needs out of a Sparkle appcast.
 *
 * This parser reads strictly less than the Control Panel's UpdateAppcastParser:
 * the Property Inspector's download button opens the fixed download page, so no
 * URL in the feed is ever read, resolved, or shown. Feed data reaches the user
 * only as a version string and an urgency, which keeps release links out of the
 * plugin's trust surface entirely.
 *
 * Entity expansion is not a risk here: the parser never defines entities, so any
 * entity reference, including one a DOCTYPE tried to declare, fails the parse.
 * That covers XXE and entity-expansion feeds without a DTD switch.
 */

export const SPARKLE_NAMESPACE_URI = "http://www.andymatuschak.org/xml-namespaces/sparkle";

/** One release the appcast offers, reduced to what the update notice decides on. */
export interface AppcastItem {
    readonly version: string;
    readonly channel: string | undefined;
    readonly isCritical: boolean;
    readonly publishedAtTimestampMilliseconds: number | undefined;
    readonly phasedRolloutIntervalSeconds: number | undefined;
}

/**
 * Parses an appcast into its items, skipping any item it cannot read.
 *
 * A malformed item is release-owned data, not a client fault: skipping it keeps
 * one bad entry from hiding every other update, which matters most when the
 * entry that still parses is the critical one.
 *
 * This reads the ShoMetrics feed and only the ShoMetrics feed. Its shape is fixed
 * by UpdateAppcast.xsd and every published feed is validated against it in CI, so
 * a release is always a `sparkle:version` element. Sparkle also allows the
 * version as an attribute on `enclosure`, and UpdateAppcastParser.cs accepts that
 * form while this does not. That reads like a divergence and is not one: the XSD
 * has no such attribute, so no feed we publish can carry it. The Control Panel is
 * the more permissive of the two because it is the one that can be pointed at a
 * foreign feed, through an environment variable at run time. The plugin cannot:
 * the URL it reads is fixed when it is built. Each parser is exactly as tolerant
 * as the feeds it can be made to read, and widening this one would be writing
 * code for a document our own schema forbids.
 *
 * @throws When the document itself is not readable XML.
 */
export function parseAppcastItems(xml: string): readonly AppcastItem[] {
    const document = parseXml(xml);
    const rootElement = document.root;
    if (rootElement === null || rootElement.name !== "rss") {
        throw new Error("Appcast root element is missing.");
    }

    // parse-xml reports qualified names such as "sparkle:version" and does not
    // resolve namespaces, so the prefix bound to the Sparkle namespace has to be
    // read from the declarations. Matching the literal "sparkle:" prefix instead
    // would silently misread a feed that binds the namespace to another prefix,
    // and would just as silently accept an unrelated namespace that happens to
    // use the prefix.
    const sparklePrefix = resolveSparklePrefix(rootElement);
    const channelElement = findChildElement(rootElement, "channel");
    if (channelElement === undefined) {
        throw new Error("Appcast RSS channel is missing.");
    }

    const items: AppcastItem[] = [];
    for (const itemElement of findChildElements(channelElement, "item")) {
        const item = readAppcastItem(itemElement, sparklePrefix);
        if (item !== undefined) {
            items.push(item);
        }
    }

    return items;
}

function readAppcastItem(itemElement: XmlElement, sparklePrefix: string | undefined): AppcastItem | undefined {
    const version = readSparkleElementText(itemElement, sparklePrefix, "version");
    if (version === undefined) {
        return undefined;
    }

    const publishedAt = readOptionalRfc822Timestamp(readChildElementText(itemElement, "pubDate"));
    const phasedRolloutInterval = readOptionalPhasedRolloutIntervalSeconds(
        readSparkleElementText(itemElement, sparklePrefix, "phasedRolloutInterval"),
    );
    if (publishedAt.isMalformed || phasedRolloutInterval.isMalformed) {
        return undefined;
    }

    return {
        version,
        channel: readSparkleElementText(itemElement, sparklePrefix, "channel"),
        isCritical: hasCriticalUpdateElement(itemElement, sparklePrefix),
        publishedAtTimestampMilliseconds: publishedAt.value,
        phasedRolloutIntervalSeconds: phasedRolloutInterval.value,
    };
}

function resolveSparklePrefix(rootElement: XmlElement): string | undefined {
    for (const [attributeName, attributeValue] of Object.entries(rootElement.attributes)) {
        if (attributeName.startsWith("xmlns:") && attributeValue === SPARKLE_NAMESPACE_URI) {
            return attributeName.slice("xmlns:".length);
        }
    }

    return undefined;
}

function hasCriticalUpdateElement(itemElement: XmlElement, sparklePrefix: string | undefined): boolean {
    if (sparklePrefix === undefined) {
        return false;
    }

    if (findChildElement(itemElement, `${sparklePrefix}:criticalUpdate`) !== undefined) {
        return true;
    }

    // Sparkle also allows the marker inside a <sparkle:tags> wrapper. The
    // Control Panel accepts both spellings; so must this reader, or the two
    // would disagree on how urgent the same release is.
    const tagsElement = findChildElement(itemElement, `${sparklePrefix}:tags`);
    return tagsElement !== undefined
        && findChildElement(tagsElement, `${sparklePrefix}:criticalUpdate`) !== undefined;
}

function readSparkleElementText(
    itemElement: XmlElement,
    sparklePrefix: string | undefined,
    localName: string,
): string | undefined {
    if (sparklePrefix === undefined) {
        return undefined;
    }

    return readChildElementText(itemElement, `${sparklePrefix}:${localName}`);
}

function readChildElementText(parentElement: XmlElement, qualifiedName: string): string | undefined {
    const text = findChildElement(parentElement, qualifiedName)?.text.trim();
    return text === undefined || text.length === 0 ? undefined : text;
}

function findChildElement(parentElement: XmlElement, qualifiedName: string): XmlElement | undefined {
    return findChildElements(parentElement, qualifiedName)[0];
}

function findChildElements(parentElement: XmlElement, qualifiedName: string): readonly XmlElement[] {
    return parentElement.children.filter(
        (child): child is XmlElement => child instanceof XmlElement && child.name === qualifiedName,
    );
}

/** Reports a parsed optional value, separating "absent" from "present but unreadable". */
interface OptionalFeedValue<TValue> {
    readonly value: TValue | undefined;
    readonly isMalformed: boolean;
}

function readOptionalRfc822Timestamp(value: string | undefined): OptionalFeedValue<number> {
    if (value === undefined) {
        return { value: undefined, isMalformed: false };
    }

    const timestampMilliseconds = Date.parse(value);
    return Number.isNaN(timestampMilliseconds)
        ? { value: undefined, isMalformed: true }
        : { value: timestampMilliseconds, isMalformed: false };
}

function readOptionalPhasedRolloutIntervalSeconds(value: string | undefined): OptionalFeedValue<number> {
    if (value === undefined) {
        return { value: undefined, isMalformed: false };
    }

    if (!/^\d+$/u.test(value)) {
        return { value: undefined, isMalformed: true };
    }

    const seconds = Number(value);
    return seconds > 0 && Number.isSafeInteger(seconds)
        ? { value: seconds, isMalformed: false }
        : { value: undefined, isMalformed: true };
}
