import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_APPEARANCE_SETTINGS } from "./default-appearance-settings";
import { mergeResolvedAppearanceSettings } from "./appearance-overrides";

test("appearance override merges pixel window transparent surface fields", () => {
    const appearance = mergeResolvedAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS, {
        theme: {
            pixelWindow: {
                transparentSurface: {
                    enabled: true,
                    backgroundOpacityPercent: 25,
                },
            },
        },
    });

    assert.deepEqual(appearance.theme.pixelWindow.transparentSurface, {
        enabled: true,
        backgroundOpacityPercent: 25,
        textOutlinePercent: 70,
        shapeOutlinePercent: 30,
    });
});
