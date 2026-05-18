import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
} from "../../color-compensation/types";
import { readStoredGlobalSettings } from "./codec";
import {
    clearStoredColorCompensationProfile,
    readStoredColorCompensationProfile,
    writeStoredColorCompensationProfile,
} from "./color-compensation-settings";

describe("stored color compensation settings", () => {
    it("reads undefined stored settings as the identity profile", () => {
        assert.deepEqual(
            readStoredColorCompensationProfile(undefined),
            DEFAULT_COLOR_COMPENSATION_PROFILE,
        );
    });

    it("reads missing fallback profile as the identity profile", () => {
        const storedSettings = readStoredGlobalSettings(undefined).settings;

        assert.deepEqual(
            readStoredColorCompensationProfile(storedSettings),
            DEFAULT_COLOR_COMPENSATION_PROFILE,
        );
    });

    it("reads fallback profile while defaulting omitted adjustments", () => {
        const storedSettings = readStoredGlobalSettings({
            colorCompensation: {
                fallbackProfile: {
                    brightnessAdjustment: 2,
                    saturationAdjustment: -3,
                },
            },
        }).settings;

        assert.deepEqual(readStoredColorCompensationProfile(storedSettings), {
            brightnessAdjustment: 2,
            shadowAdjustment: 0,
            gammaAdjustment: 0,
            saturationAdjustment: -3,
        });
    });

    it("writes normalized fallback profile without rewriting other global settings", () => {
        const json = writeStoredColorCompensationProfile({
            defaultSourceProfileId: "local",
        }, {
            brightnessAdjustment: 30,
            shadowAdjustment: -30,
            gammaAdjustment: 1.6,
            saturationAdjustment: 4,
        });

        assert.deepEqual(json, {
            defaultSourceProfileId: "local",
            colorCompensation: {
                fallbackProfile: {
                    brightnessAdjustment: 10,
                    shadowAdjustment: -10,
                    gammaAdjustment: 2,
                    saturationAdjustment: 4,
                },
            },
        });
    });

    it("write then read produces the same profile", () => {
        const profile = {
            brightnessAdjustment: 3,
            shadowAdjustment: -2,
            gammaAdjustment: 1,
            saturationAdjustment: 5,
        };

        const writtenSettings = writeStoredColorCompensationProfile({}, profile);
        const decodedSettings = readStoredGlobalSettings(writtenSettings).settings;

        assert.deepEqual(readStoredColorCompensationProfile(decodedSettings), profile);
    });

    it("clear is a no-op when color compensation is absent", () => {
        const json = clearStoredColorCompensationProfile({
            defaultSourceProfileId: "local",
        });

        assert.deepEqual(json, {
            defaultSourceProfileId: "local",
        });
    });

    it("preserves target profiles when writing fallback profile", () => {
        const json = writeStoredColorCompensationProfile({
            colorCompensation: {
                targetProfiles: [
                    {
                        target: {
                            id: {
                                streamDeckDeviceId: "device-1",
                                surfaceId: "keypad",
                            },
                            deviceDisplayName: "Desk XL",
                        },
                        profile: {
                            saturationAdjustment: 3,
                        },
                    },
                ],
            },
        }, {
            brightnessAdjustment: 1,
            shadowAdjustment: 2,
            gammaAdjustment: 3,
            saturationAdjustment: 4,
        });

        assert.deepEqual(json, {
            colorCompensation: {
                fallbackProfile: {
                    brightnessAdjustment: 1,
                    shadowAdjustment: 2,
                    gammaAdjustment: 3,
                    saturationAdjustment: 4,
                },
                targetProfiles: [
                    {
                        target: {
                            id: {
                                streamDeckDeviceId: "device-1",
                                surfaceId: "keypad",
                            },
                            deviceDisplayName: "Desk XL",
                        },
                        profile: {
                            saturationAdjustment: 3,
                        },
                    },
                ],
            },
        });
    });

    it("clears only fallback profile and preserves color compensation parent", () => {
        const json = clearStoredColorCompensationProfile({
            colorCompensation: {
                fallbackProfile: {
                    brightnessAdjustment: 3,
                    shadowAdjustment: 2,
                    gammaAdjustment: 1,
                    saturationAdjustment: 4,
                },
                targetProfiles: [
                    {
                        target: {
                            id: {
                                streamDeckDeviceId: "device-1",
                            },
                        },
                        profile: {
                            brightnessAdjustment: 2,
                        },
                    },
                ],
            },
        });

        assert.deepEqual(json, {
            colorCompensation: {
                targetProfiles: [
                    {
                        target: {
                            id: {
                                streamDeckDeviceId: "device-1",
                            },
                        },
                        profile: {
                            brightnessAdjustment: 2,
                        },
                    },
                ],
            },
        });
    });
});
