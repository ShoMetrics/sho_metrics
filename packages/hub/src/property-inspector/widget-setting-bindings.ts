import {
    defaultAppearanceSettings,
    type SettingsContext,
    type WidgetSettings,
    type WidgetStoredSettings,
} from "../settings/widget-settings";
import {
    updateWidgetSettingsBranch,
} from "../settings/updates";
import type { PropertyInspectorSettingKey } from "./schema";
import type { PropertyInspectorSettings, ControlSettingValue } from "./settings";

export interface WidgetSettingBinding {
    readonly id: PropertyInspectorSettingKey;
    read(settings: PropertyInspectorSettings): ControlSettingValue;
    write(settings: WidgetStoredSettings, value: string, context: SettingsContext): WidgetStoredSettings;
}

type BindingWriter = (
    settings: WidgetStoredSettings,
    value: string,
    context: SettingsContext,
) => WidgetStoredSettings;

const widgetSettingBindings = defineBindings({
    pollingFrequencySeconds: localBinding("pollingFrequencySeconds"),
    graphicType: appearanceBinding("graphicType"),
    circleStyle: appearanceBinding("circleStyle"),
    graphicStyle: appearanceBinding("graphicStyle"),
    colorMode: appearanceBinding("colorMode"),
    solidColor: appearanceBinding("solidColor"),
    lowThreshold: thresholdBinding("lowThreshold"),
    highThreshold: thresholdBinding("highThreshold"),
    colorLow: appearanceBinding("colorLow"),
    colorMedium: appearanceBinding("colorMedium"),
    colorHigh: appearanceBinding("colorHigh"),
    lineSmoothingPercent: appearanceBinding("lineSmoothingPercent"),
    gridLineVisibility: appearanceBinding("gridLineVisibility"),
    gridLineType: appearanceBinding("gridLineType"),
    networkDirection: metricBinding("networkDirection"),
    networkInterfaceId: metricBinding("networkInterfaceId"),
    networkTrafficDisplayMode: localBinding("networkTrafficDisplayMode"),
    networkScaleMode: networkBinding("networkScaleMode"),
    maximumDownloadSpeedMbps: networkMaximumBinding("maximumDownloadSpeedMbps"),
    maximumUploadSpeedMbps: networkMaximumBinding("maximumUploadSpeedMbps"),
    networkUnitBase: networkBinding("networkUnitBase"),
    downloadSolidColor: appearanceBinding("downloadSolidColor"),
    downloadColorLow: appearanceBinding("downloadColorLow"),
    downloadColorMedium: appearanceBinding("downloadColorMedium"),
    downloadColorHigh: appearanceBinding("downloadColorHigh"),
    uploadSolidColor: appearanceBinding("uploadSolidColor"),
    uploadColorLow: appearanceBinding("uploadColorLow"),
    uploadColorMedium: appearanceBinding("uploadColorMedium"),
    uploadColorHigh: appearanceBinding("uploadColorHigh"),
    diskMetricKind: diskMetricKindBinding(),
    diskVolumeId: metricBinding("diskVolumeId"),
    diskUsageDisplayMode: localBinding("diskUsageDisplayMode"),
    diskLinearLabel: localBinding("diskLinearLabel"),
    diskThroughputDirection: metricBinding("diskThroughputDirection"),
    diskThroughputScaleMode: diskThroughputBinding("diskThroughputScaleMode"),
    maximumDiskReadThroughputMebibytesPerSecond: diskThroughputMaximumBinding(
        "maximumDiskReadThroughputMebibytesPerSecond",
    ),
    maximumDiskWriteThroughputMebibytesPerSecond: diskThroughputMaximumBinding(
        "maximumDiskWriteThroughputMebibytesPerSecond",
    ),
    temperatureUnit: localBinding("temperatureUnit"),
    maximumTemperatureCelsius: localBinding("maximumTemperatureCelsius"),
    maximumGpuPowerWatts: localBinding("maximumGpuPowerWatts"),
    diskReadSolidColor: appearanceBinding("diskReadSolidColor"),
    diskReadColorLow: appearanceBinding("diskReadColorLow"),
    diskReadColorMedium: appearanceBinding("diskReadColorMedium"),
    diskReadColorHigh: appearanceBinding("diskReadColorHigh"),
    diskWriteSolidColor: appearanceBinding("diskWriteSolidColor"),
    diskWriteColorLow: appearanceBinding("diskWriteColorLow"),
    diskWriteColorMedium: appearanceBinding("diskWriteColorMedium"),
    diskWriteColorHigh: appearanceBinding("diskWriteColorHigh"),
} satisfies Partial<Record<PropertyInspectorSettingKey, BindingWriter>>);

export function findWidgetSettingBinding(bindingId: string): WidgetSettingBinding | null {
    return Object.values(widgetSettingBindings)
        .find(binding => binding.id === bindingId) ?? null;
}

export function updateWidgetStoredSettings(options: {
    storedSettings: WidgetStoredSettings;
    binding: WidgetSettingBinding;
    value: string;
    context: SettingsContext;
}): WidgetStoredSettings {
    return options.binding.write(options.storedSettings, options.value, options.context);
}

function defineBindings<TBindings extends Partial<Record<PropertyInspectorSettingKey, BindingWriter>>>(
    bindings: TBindings,
): { [TKey in keyof TBindings]: WidgetSettingBinding } {
    const output = {} as { [TKey in keyof TBindings]: WidgetSettingBinding };

    for (const [id, write] of Object.entries(bindings) as [keyof TBindings, BindingWriter][]) {
        output[id] = {
            id: id as PropertyInspectorSettingKey,
            read: settings => settings[id as PropertyInspectorSettingKey],
            write,
        };
    }

    return output;
}

function metricBinding(key: keyof NonNullable<WidgetSettings["metric"]>): BindingWriter {
    return branchBinding("metric", key);
}

function localBinding(key: keyof NonNullable<WidgetSettings["local"]>): BindingWriter {
    return branchBinding("local", key);
}

function appearanceBinding(key: keyof NonNullable<WidgetSettings["appearanceOverrides"]>): BindingWriter {
    return branchBinding("appearanceOverrides", key);
}

function networkBinding(key: keyof NonNullable<WidgetSettings["networkOverrides"]>): BindingWriter {
    return branchBinding("networkOverrides", key);
}

function networkMaximumBinding(
    key: "maximumDownloadSpeedMbps" | "maximumUploadSpeedMbps",
): BindingWriter {
    return (settings, value) => updateWidgetSettingsBranch(settings, "networkOverrides", {
        [key]: value,
        networkScaleMode: "custom",
    });
}

function diskThroughputBinding(key: keyof NonNullable<WidgetSettings["diskThroughputOverrides"]>): BindingWriter {
    return branchBinding("diskThroughputOverrides", key);
}

function diskThroughputMaximumBinding(
    key: "maximumDiskReadThroughputMebibytesPerSecond" | "maximumDiskWriteThroughputMebibytesPerSecond",
): BindingWriter {
    return (settings, value) => updateWidgetSettingsBranch(settings, "diskThroughputOverrides", {
        [key]: value,
        diskThroughputScaleMode: "custom",
    });
}

function diskMetricKindBinding(): BindingWriter {
    return (settings, value) => updateWidgetSettingsBranch(settings, "metric", {
        diskMetricKind: value as NonNullable<WidgetSettings["metric"]>["diskMetricKind"],
    });
}

function thresholdBinding(key: "lowThreshold" | "highThreshold"): BindingWriter {
    return (settings, value, context) => {
        const currentLowThreshold = parseThreshold(
            settings.appearanceOverrides?.lowThreshold,
            defaultAppearanceSettings.lowThreshold,
        );
        const currentHighThreshold = parseThreshold(
            settings.appearanceOverrides?.highThreshold,
            defaultAppearanceSettings.highThreshold,
        );
        const nextThreshold = parseThreshold(
            value,
            key === "lowThreshold" ? currentLowThreshold : currentHighThreshold,
        );
        const orderedThresholds = resolveThresholdPair(
            key,
            key === "lowThreshold" ? nextThreshold : currentLowThreshold,
            key === "highThreshold" ? nextThreshold : currentHighThreshold,
        );

        void context;
        return updateWidgetSettingsBranch(settings, "appearanceOverrides", {
            lowThreshold: orderedThresholds.lowThreshold,
            highThreshold: orderedThresholds.highThreshold,
        });
    };
}

function branchBinding<TBranch extends keyof Pick<
    WidgetSettings,
    "metric" | "local" | "appearanceOverrides" | "networkOverrides" | "diskThroughputOverrides"
>>(
    branch: TBranch,
    key: keyof NonNullable<WidgetSettings[TBranch]>,
): BindingWriter {
    return (settings, value) => updateWidgetSettingsBranch(settings, branch, {
        [key]: value,
    } as NonNullable<WidgetSettings[TBranch]>);
}

function parseThreshold(value: unknown, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

function resolveThresholdPair(
    changedKey: "lowThreshold" | "highThreshold",
    lowThreshold: number,
    highThreshold: number,
): {
    lowThreshold: number;
    highThreshold: number;
} {
    if (lowThreshold <= highThreshold) {
        return { lowThreshold, highThreshold };
    }

    return changedKey === "lowThreshold"
        ? { lowThreshold, highThreshold: lowThreshold }
        : { lowThreshold: highThreshold, highThreshold };
}
