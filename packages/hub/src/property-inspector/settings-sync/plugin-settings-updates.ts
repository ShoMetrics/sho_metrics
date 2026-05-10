import type { AppearanceSettingsOverride, GlobalSettings } from "../../settings/widget-settings";

export function applyGlobalSettingsPatch(settings: GlobalSettings, patch: GlobalSettings): GlobalSettings {
    return {
        ...settings,
        ...patch,
        appearanceDefaults: patch.appearanceDefaults
            ? applyAppearanceDefaultsPatch(settings.appearanceDefaults, patch.appearanceDefaults)
            : settings.appearanceDefaults,
        networkDefaults: patch.networkDefaults
            ? {
                ...settings.networkDefaults,
                ...patch.networkDefaults,
            }
            : settings.networkDefaults,
        diskThroughputDefaults: patch.diskThroughputDefaults
            ? {
                ...settings.diskThroughputDefaults,
                ...patch.diskThroughputDefaults,
            }
            : settings.diskThroughputDefaults,
    };
}

function applyAppearanceDefaultsPatch(
    settings: AppearanceSettingsOverride | undefined,
    patch: AppearanceSettingsOverride,
): AppearanceSettingsOverride {
    const nextSettings: AppearanceSettingsOverride = {
        ...settings,
        ...patch,
    };

    if (patch.usageColors) {
        nextSettings.usageColors = {
            ...settings?.usageColors,
            ...patch.usageColors,
        };
    }

    return nextSettings;
}
