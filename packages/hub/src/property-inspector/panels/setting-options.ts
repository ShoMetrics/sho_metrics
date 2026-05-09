import type { SelectOption } from "../schema";

export const pollingFrequencyOptionList = [
    { value: "1", label: "1s" },
    { value: "2", label: "2s" },
    { value: "3", label: "3s" },
    { value: "5", label: "5s" },
    { value: "10", label: "10s" },
    { value: "15", label: "15s" },
    { value: "30", label: "30s" },
    { value: "60", label: "60s" },
] as const satisfies readonly SelectOption[];

export const graphicStyleOptionList = [
    { value: "flat", label: "Default" },
    { value: "cupertino-glass", label: "Cupertino Glass Style" },
] as const satisfies readonly SelectOption[];

export const colorModeOptionList = [
    { value: "threshold", label: "Dynamic (By Percentage)" },
    { value: "solid", label: "Solid Color" },
] as const satisfies readonly SelectOption[];

export const gridLineVisibilityOptionList = [
    { value: "adaptive", label: "Adaptive" },
    { value: "always", label: "Always" },
    { value: "none", label: "None" },
] as const satisfies readonly SelectOption[];

export const disabledGridLineVisibilityOptionList = [
    { value: "none", label: "None" },
] as const satisfies readonly SelectOption[];

export const gridLineTypeOptionList = [
    { value: "horizontal", label: "Horizontal" },
    { value: "vertical", label: "Vertical" },
] as const satisfies readonly SelectOption[];

export const networkDirectionOptionList = [
    { value: "both", label: "Download & Upload" },
    { value: "download", label: "Download" },
    { value: "upload", label: "Upload" },
] as const satisfies readonly SelectOption[];

export const networkTrafficDisplayModeOptionList = [
    { value: "overlay", label: "Overlay" },
    { value: "mirrored", label: "Mirrored" },
] as const satisfies readonly SelectOption[];

export const scaleModeOptionList = [
    { value: "auto", label: "Auto" },
    { value: "custom", label: "Custom" },
] as const satisfies readonly SelectOption[];

export const networkUnitBaseOptionList = [
    { value: "byte", label: "Byte/s" },
    { value: "bit", label: "Bit/s" },
] as const satisfies readonly SelectOption[];

export const diskMetricKindOptionList = [
    { value: "usage", label: "Usage" },
    { value: "throughput", label: "Throughput" },
] as const satisfies readonly SelectOption[];

export const diskUsageDisplayModeOptionList = [
    { value: "percentage", label: "Percentage" },
    { value: "space", label: "Free Space" },
] as const satisfies readonly SelectOption[];

export const diskThroughputDirectionOptionList = [
    { value: "both", label: "Read & Write" },
    { value: "total", label: "Total" },
    { value: "read", label: "Read" },
    { value: "write", label: "Write" },
] as const satisfies readonly SelectOption[];

export const temperatureUnitOptionList = [
    { value: "celsius", label: "Celsius" },
    { value: "fahrenheit", label: "Fahrenheit" },
] as const satisfies readonly SelectOption[];
