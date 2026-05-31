import { strict as assert } from "node:assert";
import { test } from "node:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import type { ResolvedGlobalSettings } from "../../settings/resolved-settings";
import { readStoredGlobalSettings } from "../../settings/storage/codec";
import {
    writeStoredGlobalSettingsPatch,
    type StoredGlobalSettingsPatch,
} from "../../settings/storage/global-settings-patch";
import { resolveStoredGlobalSettings } from "../../settings/storage/resolver";
import { GlobalSettingsTab } from "./GlobalSettingsTab";

test("global settings tab writes the master override toggle as a sparse patch", async () => {
    const settingsPatches: StoredGlobalSettingsPatch[] = [];
    const user = userEvent.setup();

    renderGlobalSettingsTab(resolveGlobalSettings(), settingsPatches);

    await user.click(screen.getByRole("checkbox", { name: /^global override$/i }));

    assert.deepEqual(settingsPatches, [{ globalOverrideEnabled: true }]);
});

test("global settings tab writes subsection override toggles independently", async () => {
    const settingsPatches: StoredGlobalSettingsPatch[] = [];
    const user = userEvent.setup();

    renderGlobalSettingsTab(resolveGlobalSettings({ globalOverrideEnabled: true }), settingsPatches);

    await user.click(screen.getByRole("checkbox", { name: /^override view$/i }));

    assert.deepEqual(settingsPatches, [{ viewOverrideEnabled: false }]);
});

test("global settings tab writes undefined when an optional network maximum is cleared", async () => {
    const settingsPatches: StoredGlobalSettingsPatch[] = [];
    const user = userEvent.setup();

    renderGlobalSettingsTab(resolveGlobalSettings({
        network: {
            scaleMode: "custom",
            maximumDownloadSpeedMegabitsPerSecond: 250,
        },
    }), settingsPatches);

    await user.clear(screen.getByRole("spinbutton", { name: /download max/i }));

    assert.deepEqual(settingsPatches, [{
        network: {
            maximumDownloadSpeedMegabitsPerSecond: undefined,
        },
    }]);
});

function renderGlobalSettingsTab(
    resolvedSettings: ResolvedGlobalSettings,
    settingsPatches: StoredGlobalSettingsPatch[],
): void {
    render(
        <GlobalSettingsTab
            resolvedSettings={resolvedSettings}
            colorCompensationProfile={DEFAULT_COLOR_COMPENSATION_PROFILE}
            onSettingsPatch={(patch) => {
                settingsPatches.push(patch);
            }}
            onOpenColorCompensation={() => undefined}
        />,
    );
}

function resolveGlobalSettings(patch: StoredGlobalSettingsPatch = {}): ResolvedGlobalSettings {
    const rawSettings = writeStoredGlobalSettingsPatch(undefined, patch);
    return resolveStoredGlobalSettings(readStoredGlobalSettings(rawSettings).settings);
}
