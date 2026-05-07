import { inspectorFieldCatalog } from "./fields";
import { defineFieldGroup } from "./scenario-model";
import type { VisibilityContext } from "./schema";

export const baseFieldGroup = defineFieldGroup({
    name: "base",
    sectionId: "layout",
    /**
     * Base fields must be valid for every graphic scope. Graphic-specific
     * controls belong in dedicated field groups that are explicitly attached
     * by each scenario, so a missing field cannot be hidden by scope filtering.
     */
    fieldList: [
        inspectorFieldCatalog.graphicTypeField,
        inspectorFieldCatalog.graphicStyleField,
    ],
});

export const updateFieldGroup = defineFieldGroup({
    name: "update",
    sectionId: "update",
    fieldList: [
        inspectorFieldCatalog.pollingFrequencyField,
    ],
});

export const circleStyleFieldGroup = defineFieldGroup({
    name: "circleStyle",
    sectionId: "layout",
    fieldList: [
        inspectorFieldCatalog.circleStyleField,
    ],
});

export const solidColorFieldGroup = defineFieldGroup({
    name: "solidColor",
    sectionId: "colors",
    include: context => !usesChannelColorSettings(context) && context.settings.colorMode === "solid",
    fieldList: [
        inspectorFieldCatalog.solidColorField,
    ],
});

export const thresholdColorFieldGroup = defineFieldGroup({
    name: "thresholdColor",
    sectionId: "colors",
    include: context => !usesChannelColorSettings(context) && context.settings.colorMode !== "solid",
    fieldList: [
        inspectorFieldCatalog.dynamicUsageColorsNoteField,
        inspectorFieldCatalog.lowThresholdField,
        inspectorFieldCatalog.highThresholdField,
        inspectorFieldCatalog.lowUsageColorField,
        inspectorFieldCatalog.mediumUsageColorField,
        inspectorFieldCatalog.highUsageColorField,
    ],
});

export const colorSettingsFieldGroup = defineFieldGroup({
    name: "colorSettings",
    sectionId: "colors",
    include: context => !usesChannelColorSettings(context),
    fieldList: [
        inspectorFieldCatalog.colorSettingsHeadingField,
        inspectorFieldCatalog.colorModeField,
    ],
});

export const networkChannelColorSettingsFieldGroup = defineFieldGroup({
    name: "networkChannelColorSettings",
    sectionId: "colors",
    include: isDualNetworkChannelColor,
    fieldList: [
        inspectorFieldCatalog.colorSettingsHeadingField,
        inspectorFieldCatalog.colorModeField,
    ],
});

export const networkChannelThresholdFieldGroup = defineFieldGroup({
    name: "networkChannelThreshold",
    sectionId: "colors",
    include: context => isDualNetworkChannelColor(context) && context.settings.colorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.lowThresholdField,
        inspectorFieldCatalog.highThresholdField,
    ],
});

export const downloadChannelColorHeadingFieldGroup = defineFieldGroup({
    name: "downloadChannelColorHeading",
    sectionId: "colors",
    include: isDualNetworkChannelColor,
    fieldList: [
        inspectorFieldCatalog.downloadColorHeadingField,
    ],
});

export const downloadSolidChannelColorFieldGroup = defineFieldGroup({
    name: "downloadSolidChannelColor",
    sectionId: "colors",
    include: context => isDualNetworkChannelColor(context) && context.settings.colorMode !== "threshold",
    fieldList: [
        inspectorFieldCatalog.downloadSolidColorField,
    ],
});

export const downloadDynamicChannelColorFieldGroup = defineFieldGroup({
    name: "downloadDynamicChannelColor",
    sectionId: "colors",
    include: context => isDualNetworkChannelColor(context) && context.settings.colorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.downloadLowColorField,
        inspectorFieldCatalog.downloadMediumColorField,
        inspectorFieldCatalog.downloadHighColorField,
    ],
});

export const uploadChannelColorHeadingFieldGroup = defineFieldGroup({
    name: "uploadChannelColorHeading",
    sectionId: "colors",
    include: isDualNetworkChannelColor,
    fieldList: [
        inspectorFieldCatalog.uploadColorHeadingField,
    ],
});

export const uploadSolidChannelColorFieldGroup = defineFieldGroup({
    name: "uploadSolidChannelColor",
    sectionId: "colors",
    include: context => isDualNetworkChannelColor(context) && context.settings.colorMode !== "threshold",
    fieldList: [
        inspectorFieldCatalog.uploadSolidColorField,
    ],
});

export const uploadDynamicChannelColorFieldGroup = defineFieldGroup({
    name: "uploadDynamicChannelColor",
    sectionId: "colors",
    include: context => isDualNetworkChannelColor(context) && context.settings.colorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.uploadLowColorField,
        inspectorFieldCatalog.uploadMediumColorField,
        inspectorFieldCatalog.uploadHighColorField,
    ],
});

export const diskThroughputChannelColorSettingsFieldGroup = defineFieldGroup({
    name: "diskThroughputChannelColorSettings",
    sectionId: "colors",
    include: isDualDiskThroughputChannelColor,
    fieldList: [
        inspectorFieldCatalog.colorSettingsHeadingField,
        inspectorFieldCatalog.colorModeField,
    ],
});

export const diskThroughputChannelThresholdFieldGroup = defineFieldGroup({
    name: "diskThroughputChannelThreshold",
    sectionId: "colors",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.colorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.lowThresholdField,
        inspectorFieldCatalog.highThresholdField,
    ],
});

export const diskReadChannelColorHeadingFieldGroup = defineFieldGroup({
    name: "diskReadChannelColorHeading",
    sectionId: "colors",
    include: isDualDiskThroughputChannelColor,
    fieldList: [
        inspectorFieldCatalog.diskReadColorHeadingField,
    ],
});

export const diskReadSolidChannelColorFieldGroup = defineFieldGroup({
    name: "diskReadSolidChannelColor",
    sectionId: "colors",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.colorMode !== "threshold",
    fieldList: [
        inspectorFieldCatalog.diskReadSolidColorField,
    ],
});

export const diskReadDynamicChannelColorFieldGroup = defineFieldGroup({
    name: "diskReadDynamicChannelColor",
    sectionId: "colors",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.colorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.diskReadLowColorField,
        inspectorFieldCatalog.diskReadMediumColorField,
        inspectorFieldCatalog.diskReadHighColorField,
    ],
});

export const diskWriteChannelColorHeadingFieldGroup = defineFieldGroup({
    name: "diskWriteChannelColorHeading",
    sectionId: "colors",
    include: isDualDiskThroughputChannelColor,
    fieldList: [
        inspectorFieldCatalog.diskWriteColorHeadingField,
    ],
});

export const diskWriteSolidChannelColorFieldGroup = defineFieldGroup({
    name: "diskWriteSolidChannelColor",
    sectionId: "colors",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.colorMode !== "threshold",
    fieldList: [
        inspectorFieldCatalog.diskWriteSolidColorField,
    ],
});

export const diskWriteDynamicChannelColorFieldGroup = defineFieldGroup({
    name: "diskWriteDynamicChannelColor",
    sectionId: "colors",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.colorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.diskWriteLowColorField,
        inspectorFieldCatalog.diskWriteMediumColorField,
        inspectorFieldCatalog.diskWriteHighColorField,
    ],
});

export const sparklineAppearanceFieldGroup = defineFieldGroup({
    name: "sparklineAppearance",
    sectionId: "trend",
    fieldList: [
        inspectorFieldCatalog.visualGuidesHeadingField,
        inspectorFieldCatalog.lineSmoothingField,
    ],
});

export const sparklineGridLineFieldGroup = defineFieldGroup({
    name: "sparklineGridLine",
    sectionId: "trend",
    include: context => !isMirroredNetworkTraffic(context),
    fieldList: [
        inspectorFieldCatalog.gridLineVisibilityField,
        inspectorFieldCatalog.adaptiveGridLineNoteField,
        inspectorFieldCatalog.gridLineTypeField,
    ],
});

export const mirroredGridLineNoteFieldGroup = defineFieldGroup({
    name: "mirroredGridLineNote",
    sectionId: "trend",
    include: isMirroredNetworkTraffic,
    fieldList: [
        inspectorFieldCatalog.mirroredGridLineVisibilityField,
        inspectorFieldCatalog.mirroredGridLineNoteField,
        inspectorFieldCatalog.mirroredGridLineTypeField,
    ],
});

export const colorFieldGroupList = [
    solidColorFieldGroup,
    thresholdColorFieldGroup,
] as const;

export const diskUsageBaseFieldGroup = defineFieldGroup({
    name: "diskUsageBase",
    sectionId: "metric",
    fieldList: [
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskVolumeField,
    ],
});

export const diskUsageCircularFieldGroup = defineFieldGroup({
    name: "diskUsageCircular",
    sectionId: "scale",
    fieldList: [
        inspectorFieldCatalog.diskUsageDisplayModeField,
    ],
});

export const diskUsageLinearLabelFieldGroup = defineFieldGroup({
    name: "diskUsageLinearLabel",
    sectionId: "labels",
    fieldList: [
        inspectorFieldCatalog.diskLinearLabelHeadingField,
        inspectorFieldCatalog.diskLinearLabelField,
        inspectorFieldCatalog.diskVolumeLabelField,
    ],
});

export const diskThroughputMetricFieldGroup = defineFieldGroup({
    name: "diskThroughputMetric",
    sectionId: "metric",
    fieldList: [
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskThroughputDirectionField,
    ],
});

export const diskThroughputScaleFieldGroup = defineFieldGroup({
    name: "diskThroughputScale",
    sectionId: "scale",
    fieldList: [
        inspectorFieldCatalog.diskThroughputScaleModeField,
        inspectorFieldCatalog.maximumDiskReadThroughputField,
        inspectorFieldCatalog.maximumDiskWriteThroughputField,
    ],
});

export const networkDirectionFieldGroup = defineFieldGroup({
    name: "networkDirection",
    sectionId: "metric",
    fieldList: [
        inspectorFieldCatalog.networkDirectionField,
    ],
});

export const networkCircularFieldGroup = defineFieldGroup({
    name: "networkCircular",
    sectionId: "metric",
    fieldList: [
        inspectorFieldCatalog.networkCircleNoteField,
    ],
});

export const networkInterfaceFieldGroup = defineFieldGroup({
    name: "networkInterface",
    sectionId: "metric",
    fieldList: [
        inspectorFieldCatalog.networkInterfaceField,
    ],
});

export const networkScaleFieldGroup = defineFieldGroup({
    name: "networkScale",
    sectionId: "scale",
    fieldList: [
        inspectorFieldCatalog.networkScaleModeField,
        inspectorFieldCatalog.maximumDownloadSpeedField,
        inspectorFieldCatalog.maximumUploadSpeedField,
        inspectorFieldCatalog.networkUnitBaseField,
    ],
});

export const networkTrafficDisplayModeFieldGroup = defineFieldGroup({
    name: "networkTrafficDisplayMode",
    sectionId: "trend",
    include: context => context.settings.networkDirection === "both",
    fieldList: [
        inspectorFieldCatalog.networkTrafficDisplayModeField,
    ],
});

export const temperatureUnitFieldGroup = defineFieldGroup({
    name: "temperatureUnit",
    sectionId: "scale",
    fieldList: [
        inspectorFieldCatalog.temperatureUnitField,
    ],
});

export const maximumTemperatureFieldGroup = defineFieldGroup({
    name: "maximumTemperature",
    sectionId: "scale",
    fieldList: [
        inspectorFieldCatalog.maximumTemperatureField,
    ],
});

export const maximumGpuPowerFieldGroup = defineFieldGroup({
    name: "maximumGpuPower",
    sectionId: "scale",
    fieldList: [
        inspectorFieldCatalog.maximumGpuPowerField,
    ],
});

function isMirroredNetworkTraffic(context: VisibilityContext): boolean {
    return context.actionKind === "net-speed"
        && context.settings.networkDirection === "both"
        && context.settings.networkTrafficDisplayMode === "mirrored";
}

function usesChannelColorSettings(context: VisibilityContext): boolean {
    return isDualNetworkChannelColor(context) || isDualDiskThroughputChannelColor(context);
}

function isDualNetworkChannelColor(context: VisibilityContext): boolean {
    return context.actionKind === "net-speed"
        && context.settings.networkDirection === "both"
        && (
            context.settings.graphicType === "circular"
            || context.settings.graphicType === "text"
            || context.settings.graphicType === "linear"
            || context.settings.graphicType === "dashed-line"
        );
}

function isDualDiskThroughputChannelColor(context: VisibilityContext): boolean {
    return context.actionKind === "disk"
        && context.settings.diskMetricKind === "throughput"
        && context.settings.diskThroughputDirection === "both"
        && (
            context.settings.graphicType === "circular"
            || context.settings.graphicType === "text"
            || context.settings.graphicType === "dashed-line"
        );
}
