import { inspectorFieldCatalog } from "./fields";
import { defineFieldGroup } from "./scenario-model";

export const baseFieldGroup = defineFieldGroup({
    name: "base",
    fieldList: [
        inspectorFieldCatalog.pollingFrequencyField,
        inspectorFieldCatalog.graphicTypeField,
    ],
});

export const circularCenterFieldGroup = defineFieldGroup({
    name: "circularCenter",
    fieldList: [
        inspectorFieldCatalog.circularCenterContentField,
    ],
});

export const solidColorFieldGroup = defineFieldGroup({
    name: "solidColor",
    include: context => context.settings.colorMode === "solid",
    fieldList: [
        inspectorFieldCatalog.solidColorField,
    ],
});

export const thresholdColorFieldGroup = defineFieldGroup({
    name: "thresholdColor",
    include: context => context.settings.colorMode !== "solid",
    fieldList: [
        inspectorFieldCatalog.dynamicUsageColorsHeadingField,
        inspectorFieldCatalog.dynamicUsageColorsNoteField,
        inspectorFieldCatalog.lowThresholdField,
        inspectorFieldCatalog.highThresholdField,
        inspectorFieldCatalog.lowUsageColorField,
        inspectorFieldCatalog.mediumUsageColorField,
        inspectorFieldCatalog.highUsageColorField,
    ],
});

export const visualStyleFieldGroup = defineFieldGroup({
    name: "visualStyle",
    fieldList: [
        inspectorFieldCatalog.graphicStyleField,
        inspectorFieldCatalog.colorModeField,
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
        inspectorFieldCatalog.networkInterfaceField,
        inspectorFieldCatalog.maximumNetworkSpeedField,
        inspectorFieldCatalog.networkUnitBaseField,
        inspectorFieldCatalog.downloadIconColorField,
        inspectorFieldCatalog.uploadIconColorField,
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
