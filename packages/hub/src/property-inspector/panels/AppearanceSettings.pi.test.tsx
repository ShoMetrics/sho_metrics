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

test("appearance settings patches transparent surface for the active theme", async () => {
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
                theme: {
                    flat: {
                        transparentSurface: {
                            enabled: true,
                        },
                    },
                },
            },
        },
        {
            appearance: {
                theme: {
                    flat: {
                        transparentSurface: {
                            backgroundOpacityPercent: 25,
                        },
                    },
                },
            },
        },
    ]);
});

test("appearance settings disables transparent surface sliders until enabled", async () => {
    const user = userEvent.setup();

    renderAppearanceSettings([]);

    const backgroundOpacity = screen.getByRole("slider", { name: /^background opacity:$/i });
    const textOutline = screen.getByRole("slider", { name: /^text outline:$/i });
    const shapeOutline = screen.getByRole("slider", { name: /^shape outline:$/i });

    assert.equal(backgroundOpacity.hasAttribute("disabled"), true);
    assert.equal(textOutline.hasAttribute("disabled"), true);
    assert.equal(shapeOutline.hasAttribute("disabled"), true);

    await user.click(screen.getByRole("checkbox", { name: /^transparent background$/i }));

    assert.equal(backgroundOpacity.hasAttribute("disabled"), false);
    assert.equal(textOutline.hasAttribute("disabled"), false);
    assert.equal(shapeOutline.hasAttribute("disabled"), false);
});

test("appearance settings patches pixel window transparent surface when it is active", () => {
    const settingsPatches: StoredWidgetSettingsPatch[] = [];

    renderAppearanceSettings(settingsPatches, {
        appearance: {
            theme: {
                selectedTheme: "pixel-window",
            },
        },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /^transparent background$/i }));
    fireEvent.change(screen.getByRole("slider", { name: /^text outline:$/i }), {
        target: { value: "70" },
    });

    assert.deepEqual(settingsPatches, [
        {
            appearance: {
                theme: {
                    pixelWindow: {
                        transparentSurface: {
                            enabled: true,
                        },
                    },
                },
            },
        },
        {
            appearance: {
                theme: {
                    pixelWindow: {
                        transparentSurface: {
                            textOutlinePercent: 70,
                        },
                    },
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
