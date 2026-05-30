import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
    resolveStreamDeckActionKind,
    STREAM_DECK_ACTION_UUID_BY_KIND,
    STREAM_DECK_PLUGIN_UUID,
} from "./stream-deck-actions";

interface StreamDeckManifest {
    UUID?: string;
    Actions?: readonly StreamDeckManifestAction[];
}

interface StreamDeckManifestAction {
    UUID?: string;
    OS?: readonly string[];
}

test("Stream Deck action UUID constants match the manifest", () => {
    const manifest = JSON.parse(
        readFileSync("com.ez.sho-metrics.sdPlugin/manifest.json", "utf8"),
    ) as StreamDeckManifest;
    const manifestActionUuids = new Set(
        (manifest.Actions ?? [])
            .map((action) => action.UUID)
            .filter((uuid): uuid is string => typeof uuid === "string"),
    );

    assert.equal(manifest.UUID, STREAM_DECK_PLUGIN_UUID);
    assert.deepEqual(
        [...manifestActionUuids].sort(),
        Object.values(STREAM_DECK_ACTION_UUID_BY_KIND).sort(),
    );
});

test("Stream Deck action kind resolution requires an exact manifest UUID", () => {
    assert.equal(
        resolveStreamDeckActionKind(STREAM_DECK_ACTION_UUID_BY_KIND.network),
        "network",
    );
    assert.equal(resolveStreamDeckActionKind("com.example.network"), "unknown");
});

test("Advanced Sensor action is Windows-only in the action list", () => {
    const manifest = JSON.parse(
        readFileSync("com.ez.sho-metrics.sdPlugin/manifest.json", "utf8"),
    ) as StreamDeckManifest;
    const advancedSensorAction = (manifest.Actions ?? [])
        .find(action => action.UUID === STREAM_DECK_ACTION_UUID_BY_KIND.catalog);

    assert.deepEqual(advancedSensorAction?.OS, ["windows"]);
});

test("old reading-level action names do not remain in source or manifest files", () => {
    const forbiddenActionUuids = [
        `${STREAM_DECK_PLUGIN_UUID}.cpu-usage`,
        `${STREAM_DECK_PLUGIN_UUID}.gpu-usage`,
        `${STREAM_DECK_PLUGIN_UUID}.gpu-temp`,
        `${STREAM_DECK_PLUGIN_UUID}.gpu-power`,
        `${STREAM_DECK_PLUGIN_UUID}.ram-usage`,
        `${STREAM_DECK_PLUGIN_UUID}.net-speed`,
    ];
    const scannedFiles = [
        ...findTextFiles("src"),
        "com.ez.sho-metrics.sdPlugin/manifest.json",
    ].filter(filePath => !filePath.endsWith("stream-deck-actions.test.ts"));
    const matches = scannedFiles.flatMap((filePath) => {
        const fileText = readFileSync(filePath, "utf8");

        return forbiddenActionUuids
            .filter(actionUuid => fileText.includes(actionUuid))
            .map(actionUuid => `${filePath}: ${actionUuid}`);
    });

    assert.deepEqual(matches, []);
});

test("Advanced Sensor display copy does not leak into source identifiers", () => {
    const forbiddenDisplayNames = [
        "Advanced Sensor",
        "AdvancedSensor",
        "advancedSensor",
        "advanced-sensor",
    ];
    const scannedFiles = findTextFiles("src")
        .filter(filePath => !filePath.endsWith("stream-deck-actions.test.ts"));
    const matches = scannedFiles.flatMap((filePath) => {
        const fileText = readFileSync(filePath, "utf8");

        return forbiddenDisplayNames
            .filter(name => fileText.includes(name))
            .map(name => `${filePath}: ${name}`);
    });

    assert.deepEqual(matches, []);
});

function findTextFiles(rootPath: string): string[] {
    const filePaths: string[] = [];

    for (const entryName of readdirSync(rootPath)) {
        const entryPath = path.join(rootPath, entryName);
        const entryStat = statSync(entryPath);

        if (entryStat.isDirectory()) {
            filePaths.push(...findTextFiles(entryPath));
            continue;
        }

        if (/\.(?:ts|tsx|json)$/u.test(entryPath)) {
            filePaths.push(entryPath);
        }
    }

    return filePaths;
}
