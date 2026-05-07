import { inspectorFieldCatalog } from "./fields";
import { defineFieldGroup } from "./scenario-model";
import type { VisibilityContext } from "./schema";

export const baseFieldGroup = defineFieldGroup({
    name: "base",
    /**
     * Base fields must be valid for every graphic scope. Graphic-specific
     * controls belong in dedicated field groups that are explicitly attached
     * by each scenario, so a missing field cannot be hidden by scope filtering.
     */
    fieldList: [
        inspectorFieldCatalog.pollingFrequencyField,
        inspectorFieldCatalog.graphicTypeField,
        inspectorFieldCatalog.graphicStyleField,
    ],
});

export const circleStyleFieldGroup = defineFieldGroup({
    name: "circleStyle",
    fieldList: [
        inspectorFieldCatalog.circleStyleField,
    ],
});

export const solidColorFieldGroup = defineFieldGroup({
    name: "solidColor",
    include: context => !usesChannelColorSettings(context) && context.settings.colorMode === "solid",
    fieldList: [
        inspectorFieldCatalog.solidColorField,
    ],
});

export const thresholdColorFieldGroup = defineFieldGroup({
    name: "thresholdColor",
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
    include: context => !usesChannelColorSettings(context),
    fieldList: [
        inspectorFieldCatalog.colorSettingsHeadingField,
        inspectorFieldCatalog.colorModeField,
    ],
});

export const networkChannelColorSettingsFieldGroup = defineFieldGroup({
    name: "networkChannelColorSettings",
    include: isDualNetworkChannelColor,
    fieldList: [
        inspectorFieldCatalog.colorSettingsHeadingField,
    ],
});

export const networkChannelThresholdFieldGroup = defineFieldGroup({
    name: "networkChannelThreshold",
    include: context => isDualNetworkChannelColor(context)
        && (context.settings.downloadColorMode === "threshold" || context.settings.uploadColorMode === "threshold"),
    fieldList: [
        inspectorFieldCatalog.lowThresholdField,
        inspectorFieldCatalog.highThresholdField,
    ],
});

export const downloadChannelColorModeFieldGroup = defineFieldGroup({
    name: "downloadChannelColorMode",
    include: isDualNetworkChannelColor,
    fieldList: [
        inspectorFieldCatalog.downloadColorHeadingField,
        inspectorFieldCatalog.downloadColorModeField,
    ],
});

export const downloadSolidChannelColorFieldGroup = defineFieldGroup({
    name: "downloadSolidChannelColor",
    include: context => isDualNetworkChannelColor(context) && context.settings.downloadColorMode !== "threshold",
    fieldList: [
        inspectorFieldCatalog.downloadSolidColorField,
    ],
});

export const downloadDynamicChannelColorFieldGroup = defineFieldGroup({
    name: "downloadDynamicChannelColor",
    include: context => isDualNetworkChannelColor(context) && context.settings.downloadColorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.downloadLowColorField,
        inspectorFieldCatalog.downloadMediumColorField,
        inspectorFieldCatalog.downloadHighColorField,
    ],
});

export const uploadChannelColorModeFieldGroup = defineFieldGroup({
    name: "uploadChannelColorMode",
    include: isDualNetworkChannelColor,
    fieldList: [
        inspectorFieldCatalog.uploadColorHeadingField,
        inspectorFieldCatalog.uploadColorModeField,
    ],
});

export const uploadSolidChannelColorFieldGroup = defineFieldGroup({
    name: "uploadSolidChannelColor",
    include: context => isDualNetworkChannelColor(context) && context.settings.uploadColorMode !== "threshold",
    fieldList: [
        inspectorFieldCatalog.uploadSolidColorField,
    ],
});

export const uploadDynamicChannelColorFieldGroup = defineFieldGroup({
    name: "uploadDynamicChannelColor",
    include: context => isDualNetworkChannelColor(context) && context.settings.uploadColorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.uploadLowColorField,
        inspectorFieldCatalog.uploadMediumColorField,
        inspectorFieldCatalog.uploadHighColorField,
    ],
});

export const diskThroughputChannelColorSettingsFieldGroup = defineFieldGroup({
    name: "diskThroughputChannelColorSettings",
    include: isDualDiskThroughputChannelColor,
    fieldList: [
        inspectorFieldCatalog.colorSettingsHeadingField,
    ],
});

export const diskThroughputChannelThresholdFieldGroup = defineFieldGroup({
    name: "diskThroughputChannelThreshold",
    include: context => isDualDiskThroughputChannelColor(context)
        && (context.settings.diskReadColorMode === "threshold" || context.settings.diskWriteColorMode === "threshold"),
    fieldList: [
        inspectorFieldCatalog.lowThresholdField,
        inspectorFieldCatalog.highThresholdField,
    ],
});

export const diskReadChannelColorModeFieldGroup = defineFieldGroup({
    name: "diskReadChannelColorMode",
    include: isDualDiskThroughputChannelColor,
    fieldList: [
        inspectorFieldCatalog.diskReadColorHeadingField,
        inspectorFieldCatalog.diskReadColorModeField,
    ],
});

export const diskReadSolidChannelColorFieldGroup = defineFieldGroup({
    name: "diskReadSolidChannelColor",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.diskReadColorMode !== "threshold",
    fieldList: [
        inspectorFieldCatalog.diskReadSolidColorField,
    ],
});

export const diskReadDynamicChannelColorFieldGroup = defineFieldGroup({
    name: "diskReadDynamicChannelColor",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.diskReadColorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.diskReadLowColorField,
        inspectorFieldCatalog.diskReadMediumColorField,
        inspectorFieldCatalog.diskReadHighColorField,
    ],
});

export const diskWriteChannelColorModeFieldGroup = defineFieldGroup({
    name: "diskWriteChannelColorMode",
    include: isDualDiskThroughputChannelColor,
    fieldList: [
        inspectorFieldCatalog.diskWriteColorHeadingField,
        inspectorFieldCatalog.diskWriteColorModeField,
    ],
});

export const diskWriteSolidChannelColorFieldGroup = defineFieldGroup({
    name: "diskWriteSolidChannelColor",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.diskWriteColorMode !== "threshold",
    fieldList: [
        inspectorFieldCatalog.diskWriteSolidColorField,
    ],
});

export const diskWriteDynamicChannelColorFieldGroup = defineFieldGroup({
    name: "diskWriteDynamicChannelColor",
    include: context => isDualDiskThroughputChannelColor(context) && context.settings.diskWriteColorMode === "threshold",
    fieldList: [
        inspectorFieldCatalog.diskWriteLowColorField,
        inspectorFieldCatalog.diskWriteMediumColorField,
        inspectorFieldCatalog.diskWriteHighColorField,
    ],
});

export const sparklineAppearanceFieldGroup = defineFieldGroup({
    name: "sparklineAppearance",
    fieldList: [
        inspectorFieldCatalog.visualGuidesHeadingField,
        inspectorFieldCatalog.lineSmoothingField,
    ],
});

export const sparklineGridLineFieldGroup = defineFieldGroup({
    name: "sparklineGridLine",
    include: context => !isMirroredNetworkTraffic(context),
    fieldList: [
        inspectorFieldCatalog.gridLineVisibilityField,
        inspectorFieldCatalog.adaptiveGridLineNoteField,
        inspectorFieldCatalog.gridLineTypeField,
    ],
});

export const mirroredGridLineNoteFieldGroup = defineFieldGroup({
    name: "mirroredGridLineNote",
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
    fieldList: [
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskVolumeField,
    ],
});

export const diskUsageCircularFieldGroup = defineFieldGroup({
    name: "diskUsageCircular",
    fieldList: [
        inspectorFieldCatalog.diskUsageDisplayModeField,
    ],
});

export const diskUsageLinearLabelFieldGroup = defineFieldGroup({
    name: "diskUsageLinearLabel",
    fieldList: [
        inspectorFieldCatalog.diskLinearLabelHeadingField,
        inspectorFieldCatalog.diskLinearLabelField,
        inspectorFieldCatalog.diskVolumeLabelField,
    ],
});

export const diskThroughputFieldGroup = defineFieldGroup({
    name: "diskThroughput",
    fieldList: [
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskThroughputDirectionField,
        inspectorFieldCatalog.maximumDiskThroughputField,
    ],
});

export const networkDirectionFieldGroup = defineFieldGroup({
    name: "networkDirection",
    fieldList: [
        inspectorFieldCatalog.networkDirectionField,
    ],
});

export const networkCircularFieldGroup = defineFieldGroup({
    name: "networkCircular",
    fieldList: [
        inspectorFieldCatalog.networkCircleNoteField,
    ],
});

export const networkEndpointFieldGroup = defineFieldGroup({
    name: "networkEndpoint",
    fieldList: [
        inspectorFieldCatalog.networkInterfaceField,
        inspectorFieldCatalog.maximumNetworkSpeedField,
        inspectorFieldCatalog.networkUnitBaseField,
    ],
});

export const networkTrafficDisplayModeFieldGroup = defineFieldGroup({
    name: "networkTrafficDisplayMode",
    include: context => context.settings.networkDirection === "both",
    fieldList: [
        inspectorFieldCatalog.networkTrafficDisplayModeField,
    ],
});

export const temperatureUnitFieldGroup = defineFieldGroup({
    name: "temperatureUnit",
    fieldList: [
        inspectorFieldCatalog.temperatureUnitField,
    ],
});

export const maximumTemperatureFieldGroup = defineFieldGroup({
    name: "maximumTemperature",
    fieldList: [
        inspectorFieldCatalog.maximumTemperatureField,
    ],
});

export const maximumGpuPowerFieldGroup = defineFieldGroup({
    name: "maximumGpuPower",
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
