import assert from "node:assert/strict";
import { test } from "vitest";
import { SPARKLE_NAMESPACE_URI, parseAppcastItems } from "./appcast-parser";

test("reads the fields the update notice decides on", () => {
    const items = parseAppcastItems(buildAppcast(`
        <item>
            <title>Version 0.2.0</title>
            <sparkle:version>0.2.0</sparkle:version>
            <sparkle:channel>staging</sparkle:channel>
            <pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate>
            <sparkle:phasedRolloutInterval>86400</sparkle:phasedRolloutInterval>
            <sparkle:criticalUpdate />
        </item>
    `));

    assert.deepEqual(items, [{
        version: "0.2.0",
        channel: "staging",
        isCritical: true,
        publishedAtTimestampMilliseconds: Date.parse("Wed, 01 Jan 2025 00:00:00 GMT"),
        phasedRolloutIntervalSeconds: 86_400,
    }]);
});

test("reads a critical marker nested in the Sparkle tags wrapper", () => {
    // The Control Panel accepts both spellings. A release marked critical in the
    // wrapper must not read as routine here, or the panel and the Property
    // Inspector would disagree about how urgent the same release is.
    const items = parseAppcastItems(buildAppcast(`
        <item>
            <sparkle:version>0.2.0</sparkle:version>
            <sparkle:tags><sparkle:criticalUpdate /></sparkle:tags>
        </item>
    `));

    assert.equal(items[0]?.isCritical, true);
});

test("resolves the Sparkle namespace by declaration rather than by prefix text", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
        <rss version="2.0" xmlns:s="${SPARKLE_NAMESPACE_URI}" xmlns:sparkle="https://impostor.example/sparkle">
          <channel>
            <item>
              <s:version>0.3.0</s:version>
              <s:criticalUpdate />
              <sparkle:version>9.9.9</sparkle:version>
            </item>
          </channel>
        </rss>`;

    const items = parseAppcastItems(xml);

    // The real namespace is bound to "s", so that is the version to read. An
    // element that only looks like Sparkle because it borrowed the usual prefix
    // must not be able to claim a version.
    assert.equal(items.length, 1);
    assert.equal(items[0]?.version, "0.3.0");
    assert.equal(items[0]?.isCritical, true);
});

test("skips an item it cannot read instead of failing the whole feed", () => {
    const items = parseAppcastItems(buildAppcast(`
        <item><title>No version at all</title></item>
        <item>
            <sparkle:version>0.2.0</sparkle:version>
            <pubDate>not a date</pubDate>
        </item>
        <item>
            <sparkle:version>0.3.0</sparkle:version>
            <sparkle:phasedRolloutInterval>-5</sparkle:phasedRolloutInterval>
        </item>
        <item><sparkle:version>0.4.0</sparkle:version></item>
    `));

    // One bad entry must not hide the others. The entry that still parses could
    // be the critical one.
    assert.deepEqual(items.map(item => item.version), ["0.4.0"]);
});

test("refuses to expand any entity a feed tries to declare", () => {
    const entityFeeds = {
        "internal entity": `<!DOCTYPE rss [<!ENTITY payload "0.9.9">]><rss version="2.0"><channel><item>&payload;</item></channel></rss>`,
        "external entity": `<!DOCTYPE rss [<!ENTITY payload SYSTEM "file:///c:/windows/win.ini">]><rss version="2.0"><channel><item>&payload;</item></channel></rss>`,
        "expanding entity": `<!DOCTYPE rss [<!ENTITY a "aa"><!ENTITY b "&a;&a;&a;">]><rss version="2.0"><channel><item>&b;</item></channel></rss>`,
    };

    for (const [name, xml] of Object.entries(entityFeeds)) {
        // The parser never defines entities, so a reference to one always fails
        // the parse. That is what makes external-entity and expansion feeds
        // unrepresentable rather than merely bounded.
        assert.throws(() => parseAppcastItems(xml), `${name} must not parse`);
    }
});

test("rejects a document that is not an appcast", () => {
    assert.throws(() => parseAppcastItems("<rss>"));
    assert.throws(() => parseAppcastItems("<html><body>login</body></html>"));
    assert.throws(() => parseAppcastItems(`<rss version="2.0"></rss>`));
});

function buildAppcast(itemsXml: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
        <rss version="2.0" xmlns:sparkle="${SPARKLE_NAMESPACE_URI}">
          <channel>
            <title>ShoMetrics Helper Windows Updates</title>
            ${itemsXml}
          </channel>
        </rss>`;
}
