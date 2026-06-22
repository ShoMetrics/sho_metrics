import assert from "node:assert/strict";
import { test } from "vitest";

import { DEFAULT_APPEARANCE_SETTINGS } from "./default-appearance-settings";
import { mergeResolvedAppearanceSettings } from "./appearance-overrides";

test("appearance override merges widget transparent surface fields", () => {
    const appearance = mergeResolvedAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS, {
        transparentSurface: {
            enabled: true,
            backgroundOpacityPercent: 25,
        },
    });

    assert.deepEqual(appearance.transparentSurface, {
        enabled: true,
        backgroundOpacityPercent: 25,
        textOutlinePercent: 70,
        shapeOutlinePercent: 30,
    });
});
