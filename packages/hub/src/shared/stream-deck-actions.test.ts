import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
    resolveStreamDeckActionKind,
    STREAM_DECK_ACTION_UUID_BY_KIND,
    STREAM_DECK_PLUGIN_UUID,
} from "./stream-deck-actions";

const SD_PLUGIN_ROOT = "com.ez.sho-metrics.sdPlugin";

interface StreamDeckManifest {
    UUID?: string;
    CategoryIcon?: string;
    CodePath?: string;
    Icon?: string;
    Nodejs?: {
        Version?: string;
    };
    Actions?: readonly StreamDeckManifestAction[];
}

interface StreamDeckManifestAction {
    Name?: string;
    UUID?: string;
    Icon?: string;
    PropertyInspectorPath?: string;
    Controllers?: readonly string[];
    Encoder?: {
        Icon?: string;
        layout?: string;
    };
    OS?: readonly string[];
    States?: readonly {
        Image?: string;
    }[];
}

test("Stream Deck action UUID constants match the manifest", () => {
    const manifest = readManifest();
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

test("Stream Deck manifest references bundled plugin entry points and assets", () => {
    const manifest = readManifest();

    assert.equal(manifest.CodePath, "bin/plugin.js");
    assert.equal(manifest.Nodejs?.Version, "24");
    // Manifest asset paths are extensionless. Check every root, action, state,
    // and encoder icon resolves to a real bundled SVG or PNG asset.
    assertAssetReferenceExists(manifest.CategoryIcon, "manifest CategoryIcon");
    assertAssetReferenceExists(manifest.Icon, "manifest Icon");

    for (const action of manifest.Actions ?? []) {
        const actionLabel = action.Name ?? action.UUID ?? "unknown action";

        assert.equal(
            action.PropertyInspectorPath,
            "ui/property-inspector.html",
            `${actionLabel} PropertyInspectorPath`,
        );
        assertPluginFileExists(action.PropertyInspectorPath, `${actionLabel} PropertyInspectorPath`);
        assertAssetReferenceExists(action.Icon, `${actionLabel} Icon`);

        for (const state of action.States ?? []) {
            assertAssetReferenceExists(state.Image, `${actionLabel} state image`);
        }

        if (action.Controllers?.includes("Encoder")) {
            assertAssetReferenceExists(action.Encoder?.Icon, `${actionLabel} encoder icon`);
            assertLayoutReferenceExists(action.Encoder?.layout, `${actionLabel} encoder layout`);
        }
    }
});

test("Advanced Sensor action is Windows-only in the action list", () => {
    const manifest = readManifest();
    const advancedSensorAction = (manifest.Actions ?? [])
        .find(action => action.UUID === STREAM_DECK_ACTION_UUID_BY_KIND.catalog);

    assert.deepEqual(advancedSensorAction?.OS, ["windows"]);
});

test("Advanced Sensor action uses a dedicated hardware icon", () => {
    const manifest = readManifest();
    const advancedSensorAction = (manifest.Actions ?? [])
        .find(action => action.UUID === STREAM_DECK_ACTION_UUID_BY_KIND.catalog);

    assert.equal(advancedSensorAction?.Icon, "imgs/actions/catalog-metric/icon");
    assertAssetReferenceExists(advancedSensorAction?.Icon, "Advanced Sensor Icon");

    const iconSvg = readFileSync(`${SD_PLUGIN_ROOT}/imgs/actions/catalog-metric/icon.svg`, "utf8");
    assert.match(iconSvg, /Lucide Computer, ISC License/u);
});

test("Dense Multi Metric action uses a dedicated list icon", () => {
    const manifest = readManifest();
    const denseMultiMetricAction = (manifest.Actions ?? [])
        .find(action => action.UUID === STREAM_DECK_ACTION_UUID_BY_KIND.denseMultiMetric);

    assert.equal(denseMultiMetricAction?.Icon, "imgs/actions/dense-multi-metric/icon");
    assertAssetReferenceExists(denseMultiMetricAction?.Icon, "Dense Multi Metric Icon");

    const iconSvg = readFileSync(`${SD_PLUGIN_ROOT}/imgs/actions/dense-multi-metric/icon.svg`, "utf8");
    assert.match(iconSvg, /Lucide List, ISC License/u);
});

test("Stacked Metric action uses a dedicated file stack icon", () => {
    const manifest = readManifest();
    const stackedMetricAction = (manifest.Actions ?? [])
        .find(action => action.UUID === STREAM_DECK_ACTION_UUID_BY_KIND.stackedMetric);

    assert.equal(stackedMetricAction?.Icon, "imgs/actions/stacked-metric/icon");
    assertAssetReferenceExists(stackedMetricAction?.Icon, "Stacked Metric Icon");

    const iconSvg = readFileSync(`${SD_PLUGIN_ROOT}/imgs/actions/stacked-metric/icon.svg`, "utf8");
    assert.match(iconSvg, /Lucide Files, ISC License/u);
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
        .filter(filePath =>
            !filePath.endsWith("stream-deck-actions.test.ts")
            && !filePath.startsWith("src\\i18n\\")
            && !filePath.startsWith("src/i18n/"));
    const matches = scannedFiles.flatMap((filePath) => {
        const fileText = readFileSync(filePath, "utf8");

        return forbiddenDisplayNames
            .filter(name => fileText.includes(name))
            .map(name => `${filePath}: ${name}`);
    });

    assert.deepEqual(matches, []);
});

function readManifest(): StreamDeckManifest {
    return JSON.parse(
        readFileSync(`${SD_PLUGIN_ROOT}/manifest.json`, "utf8"),
    ) as StreamDeckManifest;
}

function assertPluginFileExists(relativePath: string | undefined, label: string): void {
    assert.ok(relativePath, `${label} is missing`);
    assert.ok(statSync(path.join(SD_PLUGIN_ROOT, relativePath)).isFile(), `${label} missing file: ${relativePath}`);
}

function assertAssetReferenceExists(relativePath: string | undefined, label: string): void {
    assert.ok(relativePath, `${label} is missing`);
    const assetPath = path.join(SD_PLUGIN_ROOT, relativePath);
    const assetCandidates = [
        assetPath,
        `${assetPath}.png`,
        `${assetPath}@2x.png`,
        `${assetPath}.svg`,
    ];

    assert.ok(
        assetCandidates.some(candidatePath => fileExists(candidatePath)),
        `${label} missing asset: ${relativePath}`,
    );
}

function assertLayoutReferenceExists(layoutReference: string | undefined, label: string): void {
    assert.ok(layoutReference, `${label} is missing`);

    if (layoutReference.startsWith("$")) {
        return;
    }

    assertPluginFileExists(`layouts/${layoutReference}.json`, label);
}

function fileExists(filePath: string): boolean {
    try {
        return statSync(filePath).isFile();
    } catch {
        return false;
    }
}

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
