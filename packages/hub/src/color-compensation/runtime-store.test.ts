import assert from "node:assert/strict";
import test from "node:test";
import {
    readStoredGlobalSettings,
} from "../settings/storage/codec";
import { writeStoredColorCompensationProfile } from "../settings/storage/color-compensation-settings";
import { ColorCompensationRuntimeStore } from "./runtime-store";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "./types";

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

    store.setWidgetPreview("action-1", {
        brightnessAdjustment: 0,
        shadowAdjustment: 0,
        gammaAdjustment: 0,
        saturationAdjustment: 5,
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

    store.setPatternPreview("action-1");

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
    store.setWidgetPreview("action-1", DEFAULT_COLOR_COMPENSATION_PROFILE);

    store.clearPreview("action-1");

    assert.deepEqual(resolveProfile(store, "action-1"), {
        brightnessAdjustment: 1,
        shadowAdjustment: 2,
        gammaAdjustment: 3,
        saturationAdjustment: 4,
    });
});

function resolveProfile(store: ColorCompensationRuntimeStore, actionId: string) {
    return store.resolveHardwareProfile({
        actionId,
        streamDeckDeviceId: undefined,
        surfaceId: undefined,
    });
}
