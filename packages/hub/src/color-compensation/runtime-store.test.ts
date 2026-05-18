import assert from "node:assert/strict";
import test from "node:test";
import {
    readStoredGlobalSettings,
} from "../settings/storage/codec";
import { writeStoredColorCompensationProfile } from "../settings/storage/color-compensation-settings";
import { ColorCompensationRuntimeStore } from "./runtime-store";
import { DEFAULT_COLOR_COMPENSATION_PROFILE, type ColorCompensationProfile } from "./types";

test("runtime store defaults to identity profile", () => {
    const store = new ColorCompensationRuntimeStore();

    assert.deepEqual(resolveProfile(store, "action-1"), DEFAULT_COLOR_COMPENSATION_PROFILE);
});

test("runtime store reads committed profile from stored global settings", () => {
    const store = new ColorCompensationRuntimeStore();
    const storedSettings = readStoredGlobalSettings(writeStoredColorCompensationProfile(undefined, {
        brightnessAdjustment: 2,
        shadowAdjustment: -1,
        gammaAdjustment: 3,
        saturationAdjustment: 4,
    })).settings;

    store.updateCommittedProfileFromStoredSettings(storedSettings);

    assert.deepEqual(resolveProfile(store, "action-1"), {
        brightnessAdjustment: 2,
        shadowAdjustment: -1,
        gammaAdjustment: 3,
        saturationAdjustment: 4,
    });
});

test("widget preview overrides only the matching action", () => {
    const store = new ColorCompensationRuntimeStore();
    const storedSettings = readStoredGlobalSettings(writeStoredColorCompensationProfile(undefined, {
        brightnessAdjustment: 1,
        shadowAdjustment: 0,
        gammaAdjustment: 0,
        saturationAdjustment: 0,
    })).settings;
    store.updateCommittedProfileFromStoredSettings(storedSettings);

    store.startPreviewSession({ actionId: "action-1", sessionId: "session-1" });
    store.setWidgetPreview({
        actionId: "action-1",
        sessionId: "session-1",
        profile: {
            brightnessAdjustment: 0,
            shadowAdjustment: 0,
            gammaAdjustment: 0,
            saturationAdjustment: 5,
        },
    });

    assert.deepEqual(resolveProfile(store, "action-1"), {
        brightnessAdjustment: 0,
        shadowAdjustment: 0,
        gammaAdjustment: 0,
        saturationAdjustment: 5,
    });
    assert.deepEqual(resolveProfile(store, "action-2"), {
        brightnessAdjustment: 1,
        shadowAdjustment: 0,
        gammaAdjustment: 0,
        saturationAdjustment: 0,
    });
});

test("pattern preview suppresses only the matching action metric view", () => {
    const store = new ColorCompensationRuntimeStore();

    store.startPreviewSession({ actionId: "action-1", sessionId: "session-1" });
    store.setPatternPreview({ actionId: "action-1", sessionId: "session-1" });

    assert.equal(store.shouldSuppressMetricView("action-1"), true);
    assert.equal(store.shouldSuppressMetricView("action-2"), false);
});

test("clearing preview restores the committed profile", () => {
    const store = new ColorCompensationRuntimeStore();
    const storedSettings = readStoredGlobalSettings(writeStoredColorCompensationProfile(undefined, {
        brightnessAdjustment: 1,
        shadowAdjustment: 2,
        gammaAdjustment: 3,
        saturationAdjustment: 4,
    })).settings;
    store.updateCommittedProfileFromStoredSettings(storedSettings);
    store.startPreviewSession({ actionId: "action-1", sessionId: "session-1" });
    store.setWidgetPreview({
        actionId: "action-1",
        sessionId: "session-1",
        profile: DEFAULT_COLOR_COMPENSATION_PROFILE,
    });

    store.clearPreview("action-1");

    assert.deepEqual(resolveProfile(store, "action-1"), {
        brightnessAdjustment: 1,
        shadowAdjustment: 2,
        gammaAdjustment: 3,
        saturationAdjustment: 4,
    });
});

test("stale session messages do not replace the active preview", () => {
    const store = new ColorCompensationRuntimeStore();

    store.startPreviewSession({ actionId: "action-1", sessionId: "session-new" });
    assert.equal(store.setPatternPreview({ actionId: "action-1", sessionId: "session-old" }), false);
    assert.equal(store.shouldSuppressMetricView("action-1"), false);

    assert.equal(store.setWidgetPreview({
        actionId: "action-1",
        sessionId: "session-new",
        profile: {
            brightnessAdjustment: 0,
            shadowAdjustment: 0,
            gammaAdjustment: 0,
            saturationAdjustment: 6,
        },
    }), true);
    assert.deepEqual(resolveProfile(store, "action-1"), {
        brightnessAdjustment: 0,
        shadowAdjustment: 0,
        gammaAdjustment: 0,
        saturationAdjustment: 6,
    });
});

test("stale session clear does not clear the active preview", () => {
    const store = new ColorCompensationRuntimeStore();

    store.startPreviewSession({ actionId: "action-1", sessionId: "session-new" });
    store.setPatternPreview({ actionId: "action-1", sessionId: "session-new" });

    assert.equal(store.clearPreviewSession({ actionId: "action-1", sessionId: "session-old" }), false);
    assert.equal(store.shouldSuppressMetricView("action-1"), true);

    assert.equal(store.clearPreviewSession({ actionId: "action-1", sessionId: "session-new" }), true);
    assert.equal(store.shouldSuppressMetricView("action-1"), false);
});

test("new session replaces an older preview session", () => {
    const store = new ColorCompensationRuntimeStore();

    store.startPreviewSession({ actionId: "action-1", sessionId: "session-old" });
    store.setPatternPreview({ actionId: "action-1", sessionId: "session-old" });

    store.startPreviewSession({ actionId: "action-1", sessionId: "session-new" });

    assert.equal(store.shouldSuppressMetricView("action-1"), false);
    assert.equal(store.setWidgetPreview({
        actionId: "action-1",
        sessionId: "session-new",
        profile: {
            brightnessAdjustment: 0,
            shadowAdjustment: 0,
            gammaAdjustment: 0,
            saturationAdjustment: 4,
        },
    }), true);
    assert.deepEqual(resolveProfile(store, "action-1"), {
        brightnessAdjustment: 0,
        shadowAdjustment: 0,
        gammaAdjustment: 0,
        saturationAdjustment: 4,
    });
});

test("same session start preserves a preview that already claimed the session", () => {
    const store = new ColorCompensationRuntimeStore();

    assert.equal(store.setPatternPreview({ actionId: "action-1", sessionId: "session-1" }), true);

    store.startPreviewSession({ actionId: "action-1", sessionId: "session-1" });

    assert.equal(store.shouldSuppressMetricView("action-1"), true);
});

function resolveProfile(store: ColorCompensationRuntimeStore, actionId: string): ColorCompensationProfile {
    return store.resolveHardwareProfile({
        actionId,
        streamDeckDeviceId: undefined,
        surfaceId: undefined,
    });
}
