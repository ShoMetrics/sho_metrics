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
export const VENDOR_HID_BATTERY_PERCENT_METRIC_KEY_PREFIX = "vendor_hid.battery_percent:";
export const BLUETOOTH_BATTERY_PERCENT_METRIC_KEY_PREFIX = "bluetooth.battery_percent:";

export const SYSTEM_METRIC_KEYS = [
    SYSTEM_BATTERY_PERCENT_METRIC_KEY,
] as const;

/**
 * Builds the runtime-only metric key for one discovered vendor HID peripheral battery.
 *
 * The descriptor id is owned by the battery discovery layer and must not be a
 * raw HID path. Stored settings keep a peripheral identity bundle instead.
 */
export function buildVendorHidBatteryPercentMetricKey(descriptorId: string): string {
    assertNormalizedBatteryDescriptorId(descriptorId);

    return `${VENDOR_HID_BATTERY_PERCENT_METRIC_KEY_PREFIX}${descriptorId}`;
}

/** Builds the runtime-only metric key for one OS-reported Bluetooth battery. */
export function buildBluetoothBatteryPercentMetricKey(descriptorId: string): string {
    assertNormalizedBatteryDescriptorId(descriptorId);

    return `${BLUETOOTH_BATTERY_PERCENT_METRIC_KEY_PREFIX}${descriptorId}`;
}

/** Builds the runtime descriptor id from a stored Bluetooth identity hash. */
export function buildBluetoothBatteryDescriptorIdFromPrimaryIdentifierHash(identifierHash: string): string {
    if (!/^[0-9a-f]{64}$/u.test(identifierHash)) {
        throw new Error("Bluetooth battery identifier hash must be lowercase SHA-256 hex.");
    }

    return `device-${identifierHash}`;
}

const CPU_METRIC_KEY_SET = new Set<string>(CPU_METRIC_KEYS);
const GPU_METRIC_KEY_SET = new Set<string>(GPU_METRIC_KEYS);
const RAM_METRIC_KEY_SET = new Set<string>([
    RAM_USED_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
]);
const SYSTEM_METRIC_KEY_SET = new Set<string>(SYSTEM_METRIC_KEYS);

export function isCpuMetricKey(metricKey: string): boolean {
    return CPU_METRIC_KEY_SET.has(metricKey);
}

export function isGpuMetricKey(metricKey: string): boolean {
    return GPU_METRIC_KEY_SET.has(metricKey);
}

export function isRamMetricKey(metricKey: string): boolean {
    return RAM_METRIC_KEY_SET.has(metricKey);
}

export function isSystemMetricKey(metricKey: string): boolean {
    return SYSTEM_METRIC_KEY_SET.has(metricKey);
}

export function isBatteryMetricKey(metricKey: string): boolean {
    return metricKey === SYSTEM_BATTERY_PERCENT_METRIC_KEY
        || isVendorHidBatteryMetricKey(metricKey)
        || isBluetoothBatteryMetricKey(metricKey);
}

export function isVendorHidBatteryMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(VENDOR_HID_BATTERY_PERCENT_METRIC_KEY_PREFIX);
}

export function isBluetoothBatteryMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(BLUETOOTH_BATTERY_PERCENT_METRIC_KEY_PREFIX);
}

function assertNormalizedBatteryDescriptorId(descriptorId: string): void {
    if (!/^[a-z0-9][a-z0-9._-]*$/u.test(descriptorId)) {
        throw new Error("Battery descriptor id must be a normalized runtime id.");
    }
}
