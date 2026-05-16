import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultSourceRegistry } from "./source-registry";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "./source-ids";

test("default source registry registers the Windows helper before fallback on Windows", () => {
    const sourceRegistry = createDefaultSourceRegistry({ platform: "win32" });

    try {
        assert.equal(
            sourceRegistry.resolveSourceClient(WINDOWS_HELPER_SOURCE_ID)?.sourceId,
            WINDOWS_HELPER_SOURCE_ID,
        );
        assert.equal(
            sourceRegistry.resolveSourceClient(NODE_SYSTEM_SOURCE_ID)?.sourceId,
            NODE_SYSTEM_SOURCE_ID,
        );
    } finally {
        sourceRegistry.dispose();
    }
});

test("default source registry excludes the Windows helper outside Windows", () => {
    const sourceRegistry = createDefaultSourceRegistry({ platform: "darwin" });

    try {
        assert.equal(sourceRegistry.resolveSourceClient(WINDOWS_HELPER_SOURCE_ID), undefined);
        assert.equal(
            sourceRegistry.resolveSourceClient(NODE_SYSTEM_SOURCE_ID)?.sourceId,
            NODE_SYSTEM_SOURCE_ID,
        );
    } finally {
        sourceRegistry.dispose();
    }
});
