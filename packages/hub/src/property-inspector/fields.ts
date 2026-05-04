import { inspectorScope, type InspectorScope } from "./scopes";
import type { FieldSchema, SelectOption, SelectOptionsSource } from "./schema";

const allMetricScopeList = Object.values(inspectorScope)
    .filter((scopeValue): scopeValue is InspectorScope => scopeValue !== inspectorScope.unknownScope);
const circularScopeList = allMetricScopeList.filter(scopeValue => scopeValue.endsWith(".circular"));
const diskScopeList = allMetricScopeList.filter(scopeValue => scopeValue.startsWith("disk."));
const diskUsageScopeList = allMetricScopeList.filter(scopeValue => scopeValue.startsWith("disk.usage."));
const diskUsageLinearScopeList = [inspectorScope.diskUsageLinearScope] as const;
const diskUsageCircularScopeList = [inspectorScope.diskUsageCircularScope] as const;
const diskThroughputScopeList = allMetricScopeList.filter(scopeValue => scopeValue.startsWith("disk.throughput."));
const netSpeedCircularScopeList = [inspectorScope.netSpeedCircularScope] as const;
const gpuTempScopeList = allMetricScopeList.filter(scopeValue => scopeValue.startsWith("gpu-temp."));
const gpuTempCircularLinearScopeList = [
    inspectorScope.gpuTempCircularScope,
    inspectorScope.gpuTempLinearScope,
] as const;
const gpuPowerCircularLinearScopeList = [
    inspectorScope.gpuPowerCircularScope,
    inspectorScope.gpuPowerLinearScope,
] as const;

export const inspectorFieldCatalog = {
    pollingFrequencyField: defineField({
        id: "polling-frequency",
        key: "pollingFrequencySeconds",
        kind: "select",
        label: "Polling Frequency",
        defaultValue: 1,
        allowedScopes: allMetricScopeList,
        options: staticOptions([
            { value: "1", label: "1s" },
            { value: "2", label: "2s" },
            { value: "3", label: "3s" },
            { value: "5", label: "5s" },
            { value: "10", label: "10s" },
            { value: "15", label: "15s" },
            { value: "30", label: "30s" },
            { value: "60", label: "60s" },
        ]),
    }),
    graphicTypeField: defineField({
        id: "graphic-type",
        key: "graphicType",
        kind: "select",
        label: "Graphic Type",
        defaultValue: "circular",
        allowedScopes: allMetricScopeList,
        options: staticOptions([
            { value: "circular", label: "Circular" },
            { value: "linear", label: "Linear" },
            { value: "dashed-line", label: "Sparkline" },
        ]),
    }),
    circularCenterContentField: defineField({
        id: "circular-center-content",
        key: "circularCenterContent",
        kind: "select",
        label: "Center Content",
        defaultValue: "value",
        allowedScopes: circularScopeList,
        options: staticOptions([
            { value: "value", label: "Value" },
            { value: "icon", label: "Minimal Icon" },
        ]),
    }),
    networkDirectionField: defineField({
        id: "network-direction",
        key: "networkDirection",
        kind: "select",
        label: "Network Metric",
        defaultValue: "download",
        allowedScopes: [inspectorScope.netSpeedCircularScope, inspectorScope.netSpeedLinearScope, inspectorScope.netSpeedSparklineScope],
        options: staticOptions([
            { value: "download", label: "Download" },
            { value: "upload", label: "Upload" },
        ]),
    }),
    networkCircleNoteField: defineField({
        id: "network-circle-note",
        kind: "note",
        text: "A circle can show one direction at a time.",
        allowedScopes: netSpeedCircularScopeList,
    }),
    networkInterfaceField: defineField({
        id: "network-interface",
        key: "networkInterfaceId",
        kind: "select",
        label: "Network Interface",
        allowedScopes: netSpeedCircularScopeList,
        options: { kind: "provider", providerId: "networkInterfaces" },
    }),
    maximumNetworkSpeedField: defineField({
        id: "maximum-network-speed",
        key: "maximumNetworkSpeedMbps",
        kind: "number",
        label: "Max Speed (Mbps)",
        minimum: 1,
        step: 1,
        allowedScopes: netSpeedCircularScopeList,
    }),
    networkUnitBaseField: defineField({
        id: "network-unit-base",
        key: "networkUnitBase",
        kind: "select",
        label: "Unit",
        allowedScopes: netSpeedCircularScopeList,
        options: staticOptions([
            { value: "byte", label: "Byte/s" },
            { value: "bit", label: "Bit/s" },
        ]),
    }),
    downloadIconColorField: defineField({
        id: "download-icon-color",
        key: "downloadIconColor",
        kind: "color",
        label: "Download Icon",
        defaultValue: "#3b82f6",
        allowedScopes: netSpeedCircularScopeList,
    }),
    uploadIconColorField: defineField({
        id: "upload-icon-color",
        key: "uploadIconColor",
        kind: "color",
        label: "Upload Icon",
        defaultValue: "#ef4444",
        allowedScopes: netSpeedCircularScopeList,
    }),
    diskMetricKindField: defineField({
        id: "disk-metric-kind",
        key: "diskMetricKind",
        kind: "select",
        label: "Disk Metric",
        defaultValue: "usage",
        allowedScopes: diskScopeList,
        options: staticOptions([
            { value: "usage", label: "Usage" },
            { value: "throughput", label: "Throughput", hiddenOnWindows: true },
        ]),
    }),
    diskVolumeField: defineField({
        id: "disk-volume",
        key: "diskVolumeId",
        kind: "select",
        label: "Volume",
        allowedScopes: diskUsageScopeList,
        options: { kind: "provider", providerId: "diskVolumes" },
    }),
    diskUsageDisplayModeField: defineField({
        id: "disk-usage-display-mode",
        key: "diskUsageDisplayMode",
        kind: "select",
        label: "Usage Display",
        defaultValue: "percentage",
        allowedScopes: diskUsageCircularScopeList,
        options: staticOptions([
            { value: "percentage", label: "Percentage" },
            { value: "space", label: "Free Space" },
        ]),
    }),
    diskLinearLabelHeadingField: defineField({
        id: "disk-linear-label-heading",
        kind: "heading",
        text: "Display Label",
        allowedScopes: diskUsageLinearScopeList,
    }),
    diskLinearLabelField: defineField({
        id: "disk-linear-label",
        key: "diskLinearLabel",
        kind: "text",
        label: "Custom Label",
        placeholderSource: "diskAutoLinearLabel",
        allowedScopes: diskUsageLinearScopeList,
    }),
    diskVolumeLabelField: defineField({
        id: "disk-volume-label",
        kind: "readonly",
        label: "Detected Label",
        valueSource: "selectedDiskVolumeLabel",
        allowedScopes: diskUsageLinearScopeList,
    }),
    diskThroughputDirectionField: defineField({
        id: "disk-throughput-direction",
        key: "diskThroughputDirection",
        kind: "select",
        label: "Direction",
        defaultValue: "total",
        allowedScopes: diskThroughputScopeList,
        excludeWindows: true,
        options: staticOptions([
            { value: "total", label: "Total" },
            { value: "read", label: "Read" },
            { value: "write", label: "Write" },
        ]),
    }),
    maximumDiskThroughputField: defineField({
        id: "maximum-disk-throughput",
        key: "maximumDiskThroughputMebibytesPerSecond",
        kind: "number",
        label: "Max Speed (MiB/s)",
        minimum: 1,
        step: 1,
        allowedScopes: diskThroughputScopeList,
        excludeWindows: true,
    }),
    temperatureUnitField: defineField({
        id: "temperature-unit",
        key: "temperatureUnit",
        kind: "select",
        label: "Unit",
        defaultValue: "celsius",
        allowedScopes: gpuTempScopeList,
        options: staticOptions([
            { value: "celsius", label: "Celsius" },
            { value: "fahrenheit", label: "Fahrenheit" },
        ]),
    }),
    maximumTemperatureField: defineField({
        id: "maximum-temperature",
        key: "maximumTemperatureCelsius",
        kind: "number",
        label: "Max Temp (C)",
        minimum: 1,
        step: 1,
        allowedScopes: gpuTempCircularLinearScopeList,
    }),
    maximumGpuPowerField: defineField({
        id: "maximum-gpu-power",
        key: "maximumGpuPowerWatts",
        kind: "number",
        label: "Max Power (W)",
        minimum: 1,
        step: 1,
        allowedScopes: gpuPowerCircularLinearScopeList,
    }),
    graphicStyleField: defineField({
        id: "graphic-style",
        key: "graphicStyle",
        kind: "select",
        label: "Graphic Style",
        defaultValue: "flat",
        allowedScopes: allMetricScopeList,
        options: staticOptions([
            { value: "flat", label: "Default" },
            { value: "cupertino-glass", label: "Cupertino Glass Style" },
        ]),
    }),
    colorModeField: defineField({
        id: "color-mode",
        key: "colorMode",
        kind: "select",
        label: "Color Mode",
        defaultValue: "threshold",
        allowedScopes: allMetricScopeList,
        options: staticOptions([
            { value: "threshold", label: "Dynamic (By Percentage)" },
            { value: "solid", label: "Solid Color" },
        ]),
    }),
    solidColorField: defineField({
        id: "solid-color",
        key: "solidColor",
        kind: "color",
        label: "Solid Color",
        defaultValue: "#3b82f6",
        allowedScopes: allMetricScopeList,
    }),
    colorSettingsHeadingField: defineField({
        id: "color-settings-heading",
        kind: "heading",
        text: "Color Settings",
        allowedScopes: allMetricScopeList,
    }),
    dynamicUsageColorsNoteField: defineField({
        id: "dynamic-usage-colors-note",
        kind: "note",
        text: "Set the usage ranges that choose low, medium, or high color.",
        allowedScopes: allMetricScopeList,
    }),
    lowThresholdField: defineField({
        id: "low-threshold",
        key: "lowThreshold",
        kind: "range",
        label: "Low Ends At",
        minimum: 0,
        maximum: 100,
        step: 1,
        allowedScopes: allMetricScopeList,
    }),
    highThresholdField: defineField({
        id: "high-threshold",
        key: "highThreshold",
        kind: "range",
        label: "High Starts At",
        minimum: 0,
        maximum: 100,
        step: 1,
        allowedScopes: allMetricScopeList,
    }),
    lowUsageColorField: defineField({
        id: "low-usage-color",
        key: "colorLow",
        kind: "color-band",
        label: "Low Usage Color",
        allowedScopes: allMetricScopeList,
    }),
    mediumUsageColorField: defineField({
        id: "medium-usage-color",
        key: "colorMedium",
        kind: "color-band",
        label: "Medium Usage Color",
        allowedScopes: allMetricScopeList,
    }),
    highUsageColorField: defineField({
        id: "high-usage-color",
        key: "colorHigh",
        kind: "color-band",
        label: "High Usage Color",
        allowedScopes: allMetricScopeList,
    }),
} as const;

function defineField(field: FieldSchema): FieldSchema {
    return field;
}

function staticOptions(values: readonly SelectOption[]): SelectOptionsSource {
    return { kind: "static", values };
}
