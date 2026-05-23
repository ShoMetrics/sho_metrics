import type { SelectOption } from "../inspector/types";
import type {
    TerminalPalettePreset,
    TerminalThemeVariant,
} from "../../settings/resolved-settings";

export const pollingFrequencyOptionList = [
    { value: 1, label: "1s" },
    { value: 2, label: "2s" },
    { value: 3, label: "3s" },
    { value: 5, label: "5s" },
    { value: 10, label: "10s" },
    { value: 15, label: "15s" },
    { value: 30, label: "30s" },
    { value: 60, label: "60s" },
] as const satisfies readonly SelectOption<number>[];

export const themeOptionList = [
    { value: "flat", label: "Default" },
    { value: "cupertino-glass", label: "Cupertino Glass Style" },
    { value: "color-filled", label: "Color Filled" },
    { value: "terminal", label: "Terminal" },
] as const satisfies readonly SelectOption[];

export const terminalVariantOptionList = [
    { value: "clean", label: "Clean" },
    { value: "vintage", label: "Vintage" },
] as const satisfies readonly SelectOption<TerminalThemeVariant>[];

export const terminalPaletteOptionList = [
    { value: "green", label: "Green" },
    { value: "amber", label: "Amber" },
    { value: "cyan", label: "Cyan" },
    { value: "white", label: "White" },
] as const satisfies readonly SelectOption<TerminalPalettePreset>[];

export const metricPaintColorModeOptionList = [
    { value: "multi-color", label: "Range Colors" },
    { value: "solid", label: "Solid Color" },
    { value: "black-white", label: "Black & White" },
] as const satisfies readonly SelectOption[];

export const colorFilledColorModeOptionList = [
    { value: "multi-color", label: "Color Mix" },
    { value: "solid", label: "Solid Color" },
    { value: "black-white", label: "Black & White" },
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
    { value: "both", label: "Upload & Download" },
    { value: "upload", label: "Upload" },
    { value: "download", label: "Download" },
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

export const gpuMetricKindOptionList = [
    { value: "usage", label: "Usage" },
    { value: "temperature", label: "Temperature" },
    { value: "vram", label: "VRAM" },
    { value: "power", label: "Power" },
] as const satisfies readonly SelectOption[];

export const temperatureUnitOptionList = [
    { value: "celsius", label: "Celsius" },
    { value: "fahrenheit", label: "Fahrenheit" },
] as const satisfies readonly SelectOption[];
