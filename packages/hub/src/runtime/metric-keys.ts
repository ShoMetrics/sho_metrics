export const CPU_USAGE_METRIC_KEY = "cpu.usage_percent";
export const CPU_BASE_FREQUENCY_METRIC_KEY = "cpu.base_frequency";
export const CPU_MODEL_METRIC_KEY = "cpu.model";
export const CPU_TEMP_METRIC_KEY = "cpu.temp";
export const CPU_POWER_METRIC_KEY = "cpu.power";

export const CPU_METRIC_KEYS = [
    CPU_USAGE_METRIC_KEY,
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
] as const;

export const GPU_USAGE_METRIC_KEY = "gpu.usage_percent";
export const GPU_MODEL_METRIC_KEY = "gpu.model";
export const GPU_TEMP_METRIC_KEY = "gpu.temp";
export const GPU_VRAM_USED_METRIC_KEY = "gpu.vram_used";
export const GPU_VRAM_TOTAL_METRIC_KEY = "gpu.vram_total";
export const GPU_POWER_METRIC_KEY = "gpu.power";
export const GPU_POWER_LIMIT_METRIC_KEY = "gpu.power_limit";

export const GPU_METRIC_KEYS = [
    GPU_USAGE_METRIC_KEY,
    GPU_MODEL_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
] as const;

export const RAM_USED_METRIC_KEY = "ram.used";
export const RAM_TOTAL_METRIC_KEY = "ram.total";

export const SYSTEM_BATTERY_PERCENT_METRIC_KEY = "system.battery_percent";

const CPU_METRIC_KEY_SET = new Set<string>(CPU_METRIC_KEYS);
const GPU_METRIC_KEY_SET = new Set<string>(GPU_METRIC_KEYS);
const RAM_METRIC_KEY_SET = new Set<string>([
    RAM_USED_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
]);

export function isCpuMetricKey(metricKey: string): boolean {
    return CPU_METRIC_KEY_SET.has(metricKey);
}

export function isGpuMetricKey(metricKey: string): boolean {
    return GPU_METRIC_KEY_SET.has(metricKey);
}

export function isRamMetricKey(metricKey: string): boolean {
    return RAM_METRIC_KEY_SET.has(metricKey);
}
