import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import { buildVisibilityContext } from "../testing/test-context";
import { AppearanceSettings } from "./AppearanceSettings";

test("appearance settings patches widget transparent surface", async () => {
    const settingsPatches: StoredWidgetSettingsPatch[] = [];
    const user = userEvent.setup();

    renderAppearanceSettings(settingsPatches);

    await user.click(screen.getByRole("checkbox", { name: /^transparent background$/i }));
    fireEvent.change(screen.getByRole("slider", { name: /^background opacity:$/i }), {
        target: { value: "25" },
    });

    assert.deepEqual(settingsPatches, [
        {
            appearance: {
                transparentSurface: {
                    enabled: true,
                },
            },
        },
        {
            appearance: {
                transparentSurface: {
                    backgroundOpacityPercent: 25,
                },
            },
        },
    ]);
});

test("appearance settings disables transparent surface sliders until enabled", async () => {
    renderAppearanceSettings([]);

    const backgroundOpacity = screen.getByRole("slider", { name: /^background opacity:$/i });
    const textOutline = screen.getByRole("slider", { name: /^text outline:$/i });
    const shapeOutline = screen.getByRole("slider", { name: /^shape outline:$/i });

    assert.equal(backgroundOpacity.hasAttribute("disabled"), true);
    assert.equal(textOutline.hasAttribute("disabled"), true);
    assert.equal(shapeOutline.hasAttribute("disabled"), true);
});

test("appearance settings enables transparent surface sliders from resolved enabled state", () => {
    renderAppearanceSettings([], {
        appearance: {
            transparentSurface: {
                enabled: true,
            },
        },
    });

    assert.equal(screen.getByRole("slider", { name: /^background opacity:$/i }).hasAttribute("disabled"), false);
    assert.equal(screen.getByRole("slider", { name: /^text outline:$/i }).hasAttribute("disabled"), false);
    assert.equal(screen.getByRole("slider", { name: /^shape outline:$/i }).hasAttribute("disabled"), false);
});

test("appearance settings keeps transparent surface patch shape when pixel window is active", () => {
    const settingsPatches: StoredWidgetSettingsPatch[] = [];

    renderAppearanceSettings(settingsPatches, {
        appearance: {
            theme: {
                selectedTheme: "pixel-window",
            },
            transparentSurface: {
                enabled: true,
            },
        },
    });

    fireEvent.change(screen.getByRole("slider", { name: /^text outline:$/i }), {
        target: { value: "60" },
    });

    assert.deepEqual(settingsPatches, [
        {
            appearance: {
                transparentSurface: {
                    textOutlinePercent: 60,
                },
            },
        },
    ]);
});

function renderAppearanceSettings(
    settingsPatches: StoredWidgetSettingsPatch[],
    initialPatch: StoredWidgetSettingsPatch = {},
): void {
    render(
        <AppearanceSettings
            context={buildVisibilityContext({
                actionKind: "cpu",
                settings: writeStoredWidgetSettingsPatch(
                    resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings,
                    initialPatch,
                ),
            })}
            onSettingsPatch={(patch) => {
                settingsPatches.push(patch);
            }}
        />,
    );
}
