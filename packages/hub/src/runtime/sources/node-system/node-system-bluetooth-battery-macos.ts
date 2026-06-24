import { logger } from "../../../logging/logger";
import type {
    ResolvedSystemBluetoothPeripheralIdentifier,
    ResolvedSystemPeripheralIdentity,
} from "../../../settings/resolved-settings";
import {
    buildBluetoothBatteryDescriptorIdFromPrimaryIdentifierHash,
    buildBluetoothBatteryPercentMetricKey,
} from "../../metric-keys";
import type { BatteryDeviceDescriptor } from "../battery/battery-device-descriptor";
import {
    readStatsBluetoothDevices,
    type StatsBleDevice,
    type StatsKeyValue,
} from "./stats-derived/bluetooth/readers";
import {
    buildScalarMetricValue,
    MetricUnit,
    type MetricValue,
} from "../metric-source";
import {
    buildBluetoothIdentifier,
    normalizeBluetoothDeviceAddress,
    normalizeNonEmptyText,
    resolveBluetoothBatteryPercentValue,
} from "./node-system-bluetooth-identity";

const log = logger.for("Source:NodeSystem:BluetoothBattery:MacOS");
const BLUETOOTH_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 60_000;

/**
 * Reads Stats-shaped Bluetooth device candidates from the macOS query layer.
 */
export type MacOsBluetoothDeviceReader = () => Promise<readonly StatsBleDevice[]>;

interface MacOsBluetoothDescriptorDevice {
    readonly descriptor: BatteryDeviceDescriptor;
    readonly batteryPercent: number | undefined;
}

interface MacOsBluetoothDescriptorResolution {
    readonly devices: readonly MacOsBluetoothDescriptorDevice[];
    readonly rawDeviceCount: number;
    readonly missingIdentityCount: number;
    readonly missingBatteryCount: number;
    readonly multiPartSkippedCount: number;
    readonly skippedDeviceShapes: readonly string[];
    readonly opaqueIdentityShapes: readonly string[];
}

interface MacOsBluetoothBatteryPart {
    readonly identitySuffix: string | undefined;
    readonly displaySuffix: string | undefined;
    readonly batteryPercent: number;
}

interface MacOsBluetoothIdentitySeed {
    readonly bluetoothAddress: string | undefined;
    readonly additionalIdentity: string | undefined;
}

/**
 * Reads macOS Bluetooth battery devices for the System widget device selector.
 */
export async function readMacOsBluetoothDescriptorDevices(
    readMacOsBluetoothDevices: MacOsBluetoothDeviceReader = readStatsBluetoothDevices,
): Promise<readonly BatteryDeviceDescriptor[]> {
    const startedAtMilliseconds = performance.now();
    const resolution = resolveMacOsBluetoothDescriptorDevices(await readMacOsBluetoothDevices());
    logMacOsBluetoothSummary({
        operation: "descriptor-list",
        durationMilliseconds: performance.now() - startedAtMilliseconds,
        rawDeviceCount: resolution.rawDeviceCount,
        emittedCount: resolution.devices.length,
        missingIdentityCount: resolution.missingIdentityCount,
        missingBatteryCount: resolution.missingBatteryCount,
        multiPartSkippedCount: resolution.multiPartSkippedCount,
    });
    return resolution.devices.map(device => device.descriptor);
}

/**
 * Reads selected macOS Bluetooth battery metrics from the full Stats-derived merge.
 */
export async function readMacOsBluetoothBatteryMetrics(
    bluetoothMetricKeys: readonly string[],
    readMacOsBluetoothDevices: MacOsBluetoothDeviceReader = readStatsBluetoothDevices,
): Promise<Record<string, MetricValue>> {
    const startedAtMilliseconds = performance.now();
    const requestedMetricKeySet = new Set(bluetoothMetricKeys);
    // macOS Bluetooth battery widgets use low-frequency polling: the default is
    // 5m and the System battery option set bottoms out at 1m. Keep the full
    // Stats-derived merge here for source coverage. If this path ever becomes
    // high-frequency or system_profiler latency becomes user-visible, split
    // metric reads into a selected-device fast path and fall back to the full
    // merge only on misses.
    const resolution = resolveMacOsBluetoothDescriptorDevices(await readMacOsBluetoothDevices());
    const metrics: Record<string, MetricValue> = {};
    let missingBatteryCount = 0;

    for (const device of resolution.devices) {
        if (!requestedMetricKeySet.has(device.descriptor.metricKey)) {
            continue;
        }

        const batteryPercent = device.batteryPercent;
        if (batteryPercent === undefined) {
            missingBatteryCount += 1;
            continue;
        }

        metrics[device.descriptor.metricKey] = buildScalarMetricValue(batteryPercent, {
            unit: MetricUnit.PERCENT,
        });
    }

    logMacOsBluetoothSummary({
        operation: "metric-read",
        durationMilliseconds: performance.now() - startedAtMilliseconds,
        rawDeviceCount: resolution.rawDeviceCount,
        emittedCount: Object.keys(metrics).length,
        missingIdentityCount: resolution.missingIdentityCount,
        missingBatteryCount: resolution.missingBatteryCount + missingBatteryCount,
        multiPartSkippedCount: resolution.multiPartSkippedCount,
    });

    return metrics;
}

function resolveMacOsBluetoothDescriptorDevices(
    bluetoothDevices: readonly StatsBleDevice[],
): MacOsBluetoothDescriptorResolution {
    let missingIdentityCount = 0;
    let missingBatteryCount = 0;
    let multiPartSkippedCount = 0;
    const skippedDeviceShapes: string[] = [];
    const opaqueIdentityShapes: string[] = [];
    const devices: MacOsBluetoothDescriptorDevice[] = [];

    for (const bluetoothDevice of bluetoothDevices) {
        const identitySeed = resolveMacOsBluetoothIdentitySeed(bluetoothDevice.address);
        if (identitySeed === undefined) {
            missingIdentityCount += 1;
            skippedDeviceShapes.push(formatMacOsBluetoothSkippedDeviceShape("missingIdentity", bluetoothDevice));
            continue;
        }
        if (identitySeed.additionalIdentity !== undefined) {
            opaqueIdentityShapes.push(formatMacOsBluetoothOpaqueIdentityShape(bluetoothDevice));
        }

        const batteryParts = resolveMacOsBluetoothBatteryParts(bluetoothDevice.batteryLevel);
        if (batteryParts.length === 0) {
            missingBatteryCount += 1;
            skippedDeviceShapes.push(formatMacOsBluetoothSkippedDeviceShape("missingBattery", bluetoothDevice));
            continue;
        }

        const baseDisplayName = normalizeNonEmptyText(bluetoothDevice.name);
        for (const batteryPart of batteryParts) {
            if (batteryPart.displaySuffix !== undefined && baseDisplayName === undefined) {
                multiPartSkippedCount += 1;
                skippedDeviceShapes.push(formatMacOsBluetoothSkippedDeviceShape("unnamedMultiPart", bluetoothDevice));
                continue;
            }

            devices.push(buildMacOsBluetoothDescriptorDevice({
                bluetoothDevice,
                identitySeed,
                batteryPart,
                displayName: batteryPart.displaySuffix === undefined
                    ? baseDisplayName ?? "Bluetooth device"
                    : `${baseDisplayName} ${batteryPart.displaySuffix}`,
            }));
        }
    }

    const resolution = {
        devices,
        rawDeviceCount: bluetoothDevices.length,
        missingIdentityCount,
        missingBatteryCount,
        multiPartSkippedCount,
        skippedDeviceShapes,
        opaqueIdentityShapes,
    };

    logMacOsBluetoothDescriptorResolution({
        rawDeviceCount: bluetoothDevices.length,
        emittedCount: devices.length,
        missingIdentityCount,
        missingBatteryCount,
        multiPartSkippedCount,
        skippedDeviceShapes,
        opaqueIdentityShapes,
    });

    return resolution;
}

function resolveMacOsBluetoothIdentitySeed(address: string): MacOsBluetoothIdentitySeed | undefined {
    const bluetoothAddress = normalizeMacLikeBluetoothAddress(address);
    if (bluetoothAddress !== undefined) {
        return {
            bluetoothAddress,
            additionalIdentity: undefined,
        };
    }

    const additionalIdentity = normalizeNonEmptyText(address);
    return additionalIdentity === undefined
        ? undefined
        : {
            bluetoothAddress: undefined,
            additionalIdentity,
        };
}

function buildMacOsBluetoothDescriptorDevice(options: {
    readonly bluetoothDevice: StatsBleDevice;
    readonly identitySeed: MacOsBluetoothIdentitySeed;
    readonly batteryPart: MacOsBluetoothBatteryPart;
    readonly displayName: string;
}): MacOsBluetoothDescriptorDevice {
    const primaryIdentifier = buildMacOsBluetoothIdentifier(options.identitySeed, options.batteryPart.identitySuffix);
    const descriptorId = buildBluetoothBatteryDescriptorIdFromPrimaryIdentifierHash(primaryIdentifier.hash);
    const metricKey = buildBluetoothBatteryPercentMetricKey(descriptorId);
    const identity = buildBluetoothPeripheralIdentity({
        bluetoothDevice: options.bluetoothDevice,
        displayName: options.displayName,
        primaryIdentifier,
    });

    return {
        batteryPercent: options.batteryPart.batteryPercent,
        descriptor: {
            descriptorId,
            displayName: identity.productName ?? options.displayName,
            metricKey,
            transport: "bluetooth",
            receiverKind: undefined,
            isExperimental: false,
            identity,
            supportState: "supported",
            diagnostics: {
                candidateIds: [`bluetooth:${descriptorId}`],
                sourcePathIds: [],
                receiverSlots: [],
                easySwitchSlots: [],
                batteryPercentSources: ["reported"],
                batteryVoltageMillivolts: [],
            },
        },
    };
}

function buildMacOsBluetoothIdentifier(
    identitySeed: MacOsBluetoothIdentitySeed,
    batteryPartIdentitySuffix: string | undefined,
): ResolvedSystemBluetoothPeripheralIdentifier {
    const rawIdentifier = identitySeed.bluetoothAddress ?? identitySeed.additionalIdentity;
    if (rawIdentifier === undefined) {
        throw new Error("macOS Bluetooth identity seed must contain an identifier.");
    }

    // `bluetoothDeviceAddress` is the persisted Bluetooth binding identity
    // bucket. Most seeds are canonical Bluetooth addresses, but macOS pmset can
    // expose only an opaque accessory identifier for multi-battery accessories.
    // The raw seed is hashed and never interpreted as a literal address after
    // this runtime boundary.
    return buildBluetoothIdentifier("bluetoothDeviceAddress", batteryPartIdentitySuffix === undefined
        ? rawIdentifier
        : `${rawIdentifier}#${batteryPartIdentitySuffix}`);
}

function resolveMacOsBluetoothBatteryParts(
    batteryLevel: readonly StatsKeyValue[],
): readonly MacOsBluetoothBatteryPart[] {
    const singleBatteryValue = batteryLevel.find(level =>
        level.key === "battery" || level.key === "device_batteryLevelMain" || level.key === "BatteryPercent");
    if (singleBatteryValue !== undefined) {
        const batteryPercent = resolveBluetoothBatteryPercentValue(singleBatteryValue.value);
        return batteryPercent === undefined
            ? []
            : [{
                identitySuffix: undefined,
                displaySuffix: undefined,
                batteryPercent,
            }];
    }

    return batteryLevel.flatMap(level => {
        const batteryPercent = resolveBluetoothBatteryPercentValue(level.value);
        const batteryPart = resolveMacOsBluetoothBatteryPartIdentity(level.key);
        return batteryPercent === undefined || batteryPart === undefined
            ? []
            : [{
                identitySuffix: batteryPart.identitySuffix,
                displaySuffix: batteryPart.displaySuffix,
                batteryPercent,
            }];
    });
}

function resolveMacOsBluetoothBatteryPartIdentity(key: string): Pick<MacOsBluetoothBatteryPart, "identitySuffix" | "displaySuffix"> | undefined {
    switch (key) {
        case "case":
        case "BatteryPercentCase":
        case "device_batteryLevelCase":
            return {
                identitySuffix: "case",
                displaySuffix: "Case",
            };
        case "left":
        case "BatteryPercentLeft":
        case "device_batteryLevelLeft":
        case "Left Battery Level":
            return {
                identitySuffix: "left",
                displaySuffix: "Left",
            };
        case "right":
        case "BatteryPercentRight":
        case "device_batteryLevelRight":
        case "Right Battery Level":
            return {
                identitySuffix: "right",
                displaySuffix: "Right",
            };
        default:
            return undefined;
    }
}

function buildBluetoothPeripheralIdentity(options: {
    readonly bluetoothDevice: StatsBleDevice;
    readonly displayName: string;
    readonly primaryIdentifier: ResolvedSystemBluetoothPeripheralIdentifier;
}): ResolvedSystemPeripheralIdentity {
    return {
        evidence: {
            kind: "bluetooth",
            primaryIdentifier: options.primaryIdentifier,
            fallbackIdentifier: undefined,
        },
        vendorId: options.bluetoothDevice.vendorId,
        productId: options.bluetoothDevice.productId,
        manufacturer: undefined,
        productName: options.displayName,
        serialNumber: undefined,
        interfaceNumber: undefined,
        usagePage: undefined,
        usageId: undefined,
        bindingTransport: "bluetooth",
        receiverKind: undefined,
        vendorUnitId: undefined,
        modelId: undefined,
        receiverSlot: undefined,
    };
}

function normalizeMacLikeBluetoothAddress(value: unknown): string | undefined {
    return normalizeBluetoothDeviceAddress(value);
}

function logMacOsBluetoothDescriptorResolution(options: {
    readonly rawDeviceCount: number;
    readonly emittedCount: number;
    readonly missingIdentityCount: number;
    readonly missingBatteryCount: number;
    readonly multiPartSkippedCount: number;
    readonly skippedDeviceShapes: readonly string[];
    readonly opaqueIdentityShapes: readonly string[];
}): void {
    log.atDebug()
        .everyMs("macos-bluetooth-descriptor-resolution", BLUETOOTH_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "macosBluetoothDescriptorResolution",
            `rawDevices=${options.rawDeviceCount}`,
            `emitted=${options.emittedCount}`,
            `missingIdentity=${options.missingIdentityCount}`,
            `missingBattery=${options.missingBatteryCount}`,
            `multiPartSkipped=${options.multiPartSkippedCount}`,
            `skipped=${options.skippedDeviceShapes.slice(0, 12).join(";") || "none"}`,
            `opaqueIdentities=${options.opaqueIdentityShapes.slice(0, 12).join(";") || "none"}`,
        ].join(" "));

    if (options.opaqueIdentityShapes.length > 0) {
        log.atWarn()
            .everyMs("macos-bluetooth-opaque-identities", BLUETOOTH_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "macosBluetoothOpaqueIdentities",
                `count=${options.opaqueIdentityShapes.length}`,
                `devices=${options.opaqueIdentityShapes.slice(0, 12).join(";")}`,
            ].join(" "));
    }

    if (options.skippedDeviceShapes.length > 0) {
        log.atWarn()
            .everyMs("macos-bluetooth-skipped-devices", BLUETOOTH_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "macosBluetoothSkippedDevices",
                `count=${options.skippedDeviceShapes.length}`,
                `devices=${options.skippedDeviceShapes.slice(0, 12).join(";")}`,
            ].join(" "));
    }
}

function logMacOsBluetoothSummary(options: {
    readonly operation: string;
    readonly durationMilliseconds: number;
    readonly rawDeviceCount: number;
    readonly emittedCount: number;
    readonly missingIdentityCount: number;
    readonly missingBatteryCount: number;
    readonly multiPartSkippedCount: number;
}): void {
    log.atInfo()
        .everyMs(`macos-bluetooth-${options.operation}`, BLUETOOTH_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "macosBluetoothBatterySummary",
            `operation=${options.operation}`,
            `durationMs=${Math.round(options.durationMilliseconds)}`,
            `rawDevices=${options.rawDeviceCount}`,
            `emitted=${options.emittedCount}`,
            `missingIdentity=${options.missingIdentityCount}`,
            `missingBattery=${options.missingBatteryCount}`,
            `multiPartSkipped=${options.multiPartSkippedCount}`,
        ].join(" "));
}

function formatMacOsBluetoothSkippedDeviceShape(reason: string, bluetoothDevice: StatsBleDevice): string {
    return [
        `reason=${reason}`,
        `name=${formatBluetoothDiagnosticText(bluetoothDevice.name)}`,
        `address=${formatBluetoothDiagnosticAddressShape(bluetoothDevice.address)}`,
        `batteryKeys=${bluetoothDevice.batteryLevel.map(level => level.key).join("|") || "none"}`,
    ].join(",");
}

function formatMacOsBluetoothOpaqueIdentityShape(bluetoothDevice: StatsBleDevice): string {
    return [
        `name=${formatBluetoothDiagnosticText(bluetoothDevice.name)}`,
        `address=${formatBluetoothDiagnosticAddressShape(bluetoothDevice.address)}`,
        `batteryKeys=${bluetoothDevice.batteryLevel.map(level => level.key).join("|") || "none"}`,
    ].join(",");
}

function formatBluetoothDiagnosticText(value: string | undefined): string {
    const normalizedValue = normalizeNonEmptyText(value);
    if (normalizedValue === undefined) {
        return "empty";
    }

    return JSON.stringify(normalizedValue);
}

function formatBluetoothDiagnosticAddressShape(value: string): string {
    if (normalizeNonEmptyText(value) === undefined) {
        return "empty";
    }

    return normalizeMacLikeBluetoothAddress(value) === undefined
        ? `opaque:${value.length}`
        : "mac-like";
}
