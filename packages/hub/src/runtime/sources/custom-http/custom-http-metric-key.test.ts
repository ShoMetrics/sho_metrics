import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
    buildCustomHttpHostSlug,
    buildCustomHttpRuntimeIdentity,
    buildDenseCustomHttpConsumerSlug,
    buildStackedCustomHttpConsumerSlug,
    CUSTOM_HTTP_METRIC_KEY_PREFIX,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "./custom-http-metric-key";

test("buildCustomHttpHostSlug keeps only a bounded sanitized hostname", () => {
    assert.equal(
        buildCustomHttpHostSlug("https://api.open-meteo.com/v1/forecast?latitude=35"),
        "api-open-meteo-com",
    );
    assert.equal(buildCustomHttpHostSlug("http://localhost:8085/data.json"), "localhost");
    assert.equal(buildCustomHttpHostSlug("http://127.0.0.1:8085/data.json"), "127-0-0-1");
    assert.equal(buildCustomHttpHostSlug("http://192.168.4.48:8085/data.json"), "192-168-4-48");
    assert.equal(
        buildCustomHttpHostSlug("https://Very-Long.Host.Name.With.Many.Parts.example.com/path"),
        "very-long-host-name-with-many-pa",
    );
});

test("buildCustomHttpHostSlug falls back for invalid URLs", () => {
    assert.equal(buildCustomHttpHostSlug("not a url"), "unknown-host");
});

test("buildCustomHttpRuntimeIdentity uses action and consumer identity", () => {
    const firstIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.open-meteo.com/v1/forecast?latitude=35",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });
    const secondIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.open-meteo.com/other?secret=not-in-key",
        actionId: "action-1",
        consumerSlug: "single",
    });
    const thirdIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.open-meteo.com/v1/forecast?latitude=35",
        actionId: "action-2",
        consumerSlug: "single",
    });

    assert.equal(firstIdentity.metricKey, "custom-http:api-open-meteo-com:action-1:single");
    assert.equal(firstIdentity.sourceScopeId, firstIdentity.metricKey);
    assert.equal(secondIdentity.metricKey, firstIdentity.metricKey);
    assert.notEqual(thirdIdentity.metricKey, firstIdentity.metricKey);
});

test("consumer slug helpers prevent multi-slot collisions", () => {
    const denseFirstIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.open-meteo.com/v1/forecast",
        actionId: "action-1",
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-a"),
    });
    const denseSecondIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.open-meteo.com/v1/forecast",
        actionId: "action-1",
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-b"),
    });
    const stackedIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.open-meteo.com/v1/forecast",
        actionId: "action-1",
        consumerSlug: buildStackedCustomHttpConsumerSlug("slot-a"),
    });

    assert.notEqual(denseFirstIdentity.metricKey, denseSecondIdentity.metricKey);
    assert.notEqual(denseFirstIdentity.metricKey, stackedIdentity.metricKey);
});

test("consumer slug helpers reject unexpected slot id characters instead of rewriting identity", () => {
    assert.throws(() => buildDenseCustomHttpConsumerSlug("slot-A"), {
        message: "Custom HTTP consumer slug must contain only lowercase ASCII letters, digits, or dashes.",
    });
    assert.throws(() => buildStackedCustomHttpConsumerSlug("slot_a"), {
        message: "Custom HTTP consumer slug must contain only lowercase ASCII letters, digits, or dashes.",
    });
});

test("custom-http metric keys are built only by the shared helper", async () => {
    const sourceRoot = path.resolve("src");
    const files = await listSourceFiles(sourceRoot);
    const offenders: string[] = [];

    for (const file of files) {
        const content = await readFile(file, "utf8");
        if (!content.includes(CUSTOM_HTTP_METRIC_KEY_PREFIX)) {
            continue;
        }

        const relativeFile = path.relative(sourceRoot, file).replaceAll("\\", "/");
        if (
            relativeFile !== "runtime/sources/custom-http/custom-http-metric-key.ts"
            && relativeFile !== "runtime/sources/custom-http/custom-http-metric-key.test.ts"
        ) {
            offenders.push(relativeFile);
        }
    }

    assert.deepEqual(offenders, []);
});

async function listSourceFiles(root: string): Promise<readonly string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(entries.flatMap(async entry => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            return listSourceFiles(entryPath);
        }

        return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
            ? [entryPath]
            : [];
    }));

    return files.flat();
}
