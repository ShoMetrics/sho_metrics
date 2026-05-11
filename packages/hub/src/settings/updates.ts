import type {
    AppearanceColorRampKey,
    AppearanceSettingsOverride,
    WidgetSettings,
} from "./model";

type WidgetSettingsBranch =
    | "metric"
    | "local"
    | "appearanceOverrides"
    | "networkOverrides"
    | "diskThroughputOverrides";

export function updateWidgetSettingsBranch<TBranch extends WidgetSettingsBranch>(
    settings: WidgetSettings,
    branch: TBranch,
    patch: NonNullable<WidgetSettings[TBranch]>,
): WidgetSettings {
    return mergeWidgetSettingsPatch(settings, {
        [branch]: patch,
    });
}

export function mergeWidgetSettingsPatch(settings: WidgetSettings, patch: WidgetSettings): WidgetSettings {
    const output: WidgetSettings = { ...settings, ...patch };

    if (patch.metric) {
        output.metric = { ...settings.metric, ...patch.metric };
    }

    if (patch.local) {
        output.local = { ...settings.local, ...patch.local };
    }

    if (patch.appearanceOverrides) {
        output.appearanceOverrides = mergeAppearancePatch(settings.appearanceOverrides, patch.appearanceOverrides);
    }

    if (patch.networkOverrides) {
        output.networkOverrides = { ...settings.networkOverrides, ...patch.networkOverrides };
    }

    if (patch.diskThroughputOverrides) {
        output.diskThroughputOverrides = { ...settings.diskThroughputOverrides, ...patch.diskThroughputOverrides };
    }

    return output;
}

const colorRampKeys: readonly AppearanceColorRampKey[] = [
    "usageColors",
    "downloadColors",
    "uploadColors",
    "diskReadColors",
    "diskWriteColors",
];

function mergeAppearancePatch(
    settings: AppearanceSettingsOverride | undefined,
    patch: AppearanceSettingsOverride,
): AppearanceSettingsOverride {
    const output: AppearanceSettingsOverride = {
        ...settings,
        ...patch,
    };

    for (const rampKey of colorRampKeys) {
        if (patch[rampKey]) {
            output[rampKey] = {
                ...settings?.[rampKey],
                ...patch[rampKey],
            };
        }
    }

    return output;
}
