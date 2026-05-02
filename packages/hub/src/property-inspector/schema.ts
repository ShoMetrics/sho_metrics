import type { ActionKind, PropertyInspectorSettings, SettingValue } from "./settings";

export type PropertyInspectorSettingKey = Extract<keyof PropertyInspectorSettings, string>;
export type FieldKind = "select" | "color" | "number" | "range" | "note" | "heading" | "color-band";
export type OptionProviderId = "networkInterfaces" | "diskVolumes";

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
    hidden?: boolean;
    hiddenOnWindows?: boolean;
}

export type SelectOptionsSource =
    | { kind: "static"; values: readonly SelectOption[] }
    | { kind: "provider"; providerId: OptionProviderId };

export interface VisibilityRule {
    actionKinds?: readonly ActionKind[];
    graphicTypes?: readonly string[];
    colorModes?: readonly string[];
    diskMetricKinds?: readonly string[];
    networkDirections?: readonly string[];
    excludeWindows?: boolean;
}

export interface VisibilityContext {
    actionKind: ActionKind;
    isWindows: boolean;
    settings: PropertyInspectorSettings;
}

export interface FieldSchema {
    id: string;
    kind: FieldKind;
    key?: PropertyInspectorSettingKey;
    label?: string;
    text?: string;
    defaultValue?: SettingValue;
    minimum?: number;
    step?: number;
    maximum?: number;
    options?: SelectOptionsSource;
    visibleWhen?: VisibilityRule;
}

export const propertyInspectorSchema: readonly FieldSchema[] = [
    {
        id: "polling-frequency",
        key: "pollingFrequencySeconds",
        kind: "select",
        label: "Polling Frequency",
        defaultValue: 1,
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
    },
    {
        id: "graphic-type",
        key: "graphicType",
        kind: "select",
        label: "Graphic Type",
        defaultValue: "circular",
        options: staticOptions([
            { value: "circular", label: "Circular" },
            { value: "linear", label: "Linear" },
            { value: "dashed-line", label: "Sparkline" },
        ]),
    },
    {
        id: "circular-center-content",
        key: "circularCenterContent",
        kind: "select",
        label: "Center Content",
        defaultValue: "value",
        visibleWhen: { graphicTypes: ["circular"] },
        options: staticOptions([
            { value: "value", label: "Value" },
            { value: "icon", label: "Minimal Icon" },
        ]),
    },
    {
        id: "network-direction",
        key: "networkDirection",
        kind: "select",
        label: "Network Metric",
        defaultValue: "download",
        visibleWhen: { actionKinds: ["net-speed"] },
        options: staticOptions([
            { value: "download", label: "Download" },
            { value: "upload", label: "Upload" },
        ]),
    },
    {
        id: "network-circle-note",
        kind: "note",
        text: "A circle can show one direction at a time.",
        visibleWhen: { actionKinds: ["net-speed"] },
    },
    {
        id: "network-interface",
        key: "networkInterfaceId",
        kind: "select",
        label: "Network Interface",
        visibleWhen: {
            actionKinds: ["net-speed"],
            graphicTypes: ["circular"],
            networkDirections: ["download", "upload"],
        },
        options: { kind: "provider", providerId: "networkInterfaces" },
    },
    {
        id: "maximum-network-speed",
        key: "maximumNetworkSpeedMbps",
        kind: "number",
        label: "Max Speed (Mbps)",
        minimum: 1,
        step: 1,
        visibleWhen: {
            actionKinds: ["net-speed"],
            graphicTypes: ["circular"],
            networkDirections: ["download", "upload"],
        },
    },
    {
        id: "network-unit-base",
        key: "networkUnitBase",
        kind: "select",
        label: "Unit",
        visibleWhen: {
            actionKinds: ["net-speed"],
            graphicTypes: ["circular"],
            networkDirections: ["download", "upload"],
        },
        options: staticOptions([
            { value: "byte", label: "Byte/s" },
            { value: "bit", label: "Bit/s" },
        ]),
    },
    {
        id: "download-icon-color",
        key: "downloadIconColor",
        kind: "color",
        label: "Download Icon",
        defaultValue: "#3b82f6",
        visibleWhen: {
            actionKinds: ["net-speed"],
            graphicTypes: ["circular"],
            networkDirections: ["download", "upload"],
        },
    },
    {
        id: "upload-icon-color",
        key: "uploadIconColor",
        kind: "color",
        label: "Upload Icon",
        defaultValue: "#ef4444",
        visibleWhen: {
            actionKinds: ["net-speed"],
            graphicTypes: ["circular"],
            networkDirections: ["download", "upload"],
        },
    },
    {
        id: "disk-metric-kind",
        key: "diskMetricKind",
        kind: "select",
        label: "Disk Metric",
        defaultValue: "usage",
        visibleWhen: { actionKinds: ["disk"] },
        options: staticOptions([
            { value: "usage", label: "Usage" },
            { value: "throughput", label: "Throughput", hiddenOnWindows: true },
        ]),
    },
    {
        id: "disk-volume",
        key: "diskVolumeId",
        kind: "select",
        label: "Volume",
        visibleWhen: {
            actionKinds: ["disk"],
            diskMetricKinds: ["usage"],
        },
        options: { kind: "provider", providerId: "diskVolumes" },
    },
    {
        id: "disk-usage-display-mode",
        key: "diskUsageDisplayMode",
        kind: "select",
        label: "Usage Display",
        defaultValue: "percentage",
        visibleWhen: {
            actionKinds: ["disk"],
            diskMetricKinds: ["usage"],
        },
        options: staticOptions([
            { value: "percentage", label: "Percentage" },
            { value: "space", label: "Free Space" },
        ]),
    },
    {
        id: "disk-throughput-direction",
        key: "diskThroughputDirection",
        kind: "select",
        label: "Direction",
        defaultValue: "total",
        visibleWhen: {
            actionKinds: ["disk"],
            diskMetricKinds: ["throughput"],
            excludeWindows: true,
        },
        options: staticOptions([
            { value: "total", label: "Total" },
            { value: "read", label: "Read" },
            { value: "write", label: "Write" },
        ]),
    },
    {
        id: "maximum-disk-throughput",
        key: "maximumDiskThroughputMebibytesPerSecond",
        kind: "number",
        label: "Max Speed (MiB/s)",
        minimum: 1,
        step: 1,
        visibleWhen: {
            actionKinds: ["disk"],
            diskMetricKinds: ["throughput"],
            excludeWindows: true,
        },
    },
    {
        id: "temperature-unit",
        key: "temperatureUnit",
        kind: "select",
        label: "Unit",
        defaultValue: "celsius",
        visibleWhen: { actionKinds: ["gpu-temp"] },
        options: staticOptions([
            { value: "celsius", label: "Celsius" },
            { value: "fahrenheit", label: "Fahrenheit" },
        ]),
    },
    {
        id: "maximum-temperature",
        key: "maximumTemperatureCelsius",
        kind: "number",
        label: "Max Temp (C)",
        minimum: 1,
        step: 1,
        visibleWhen: {
            actionKinds: ["gpu-temp"],
            graphicTypes: ["circular", "linear"],
        },
    },
    {
        id: "maximum-gpu-power",
        key: "maximumGpuPowerWatts",
        kind: "number",
        label: "Max Power (W)",
        minimum: 1,
        step: 1,
        visibleWhen: {
            actionKinds: ["gpu-power"],
            graphicTypes: ["circular", "linear"],
        },
    },
    {
        id: "graphic-style",
        key: "graphicStyle",
        kind: "select",
        label: "Graphic Style",
        defaultValue: "flat",
        options: staticOptions([
            { value: "flat", label: "Default" },
            { value: "cupertino-glass", label: "Cupertino Glass Style" },
        ]),
    },
    {
        id: "color-mode",
        key: "colorMode",
        kind: "select",
        label: "Color Mode",
        defaultValue: "threshold",
        options: staticOptions([
            { value: "threshold", label: "Dynamic (By Percentage)" },
            { value: "solid", label: "Solid Color" },
        ]),
    },
    {
        id: "solid-color",
        key: "solidColor",
        kind: "color",
        label: "Solid Color",
        defaultValue: "#3b82f6",
        visibleWhen: { colorModes: ["solid"] },
    },
    {
        id: "dynamic-usage-colors",
        kind: "heading",
        text: "Dynamic Usage Colors",
        visibleWhen: { colorModes: ["threshold"] },
    },
    {
        id: "dynamic-usage-colors-note",
        kind: "note",
        text: "Set the usage ranges that choose low, medium, or high color.",
        visibleWhen: { colorModes: ["threshold"] },
    },
    {
        id: "low-threshold",
        key: "lowThreshold",
        kind: "range",
        label: "Low Ends At",
        minimum: 0,
        maximum: 100,
        step: 1,
        visibleWhen: { colorModes: ["threshold"] },
    },
    {
        id: "high-threshold",
        key: "highThreshold",
        kind: "range",
        label: "High Starts At",
        minimum: 0,
        maximum: 100,
        step: 1,
        visibleWhen: { colorModes: ["threshold"] },
    },
    {
        id: "low-usage-color",
        key: "colorLow",
        kind: "color-band",
        label: "Low Usage Color",
        visibleWhen: { colorModes: ["threshold"] },
    },
    {
        id: "medium-usage-color",
        key: "colorMedium",
        kind: "color-band",
        label: "Medium Usage Color",
        visibleWhen: { colorModes: ["threshold"] },
    },
    {
        id: "high-usage-color",
        key: "colorHigh",
        kind: "color-band",
        label: "High Usage Color",
        visibleWhen: { colorModes: ["threshold"] },
    },
];

export function isFieldVisible(field: FieldSchema, context: VisibilityContext): boolean {
    const rule = field.visibleWhen;

    if (!rule) {
        return true;
    }

    return matches(rule.actionKinds, context.actionKind)
        && matches(rule.graphicTypes, context.settings.graphicType)
        && matches(rule.colorModes, context.settings.colorMode)
        && matches(rule.diskMetricKinds, context.settings.diskMetricKind)
        && matches(rule.networkDirections, context.settings.networkDirection)
        && !(rule.excludeWindows === true && context.isWindows);
}

function staticOptions(values: readonly SelectOption[]): SelectOptionsSource {
    return { kind: "static", values };
}

function matches<TValue extends string>(acceptedValues: readonly TValue[] | undefined, value: TValue): boolean {
    return !acceptedValues || acceptedValues.includes(value);
}
