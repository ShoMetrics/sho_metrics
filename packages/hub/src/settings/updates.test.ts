import assert from "node:assert/strict";
import test from "node:test";
import { updateWidgetSettingsBranch } from "./updates";

test("updating appearance writes sparse overrides only", () => {
    const nextSettings = updateWidgetSettingsBranch({}, "appearanceOverrides", {
        usageColors: {
            solidColor: "#123456",
        },
    });

    assert.deepEqual(nextSettings, {
        appearanceOverrides: {
            usageColors: {
                solidColor: "#123456",
            },
        },
    });
});
