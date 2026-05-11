import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
        resolveStreamDeckActionKind(STREAM_DECK_ACTION_UUID_BY_KIND["net-speed"]),
        "net-speed",
    );
    assert.equal(resolveStreamDeckActionKind("com.example.net-speed"), "unknown");
});
