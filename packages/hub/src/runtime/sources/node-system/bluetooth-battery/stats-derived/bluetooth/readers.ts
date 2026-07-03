/**
 * macOS Bluetooth battery readers derived from Stats.
 *
 * Source: Stats
 * File: `Modules/Bluetooth/readers.swift`
 * Commit: `3f3255c4c4f904c558486c707394ed7e7d082737`
 * Repository: https://github.com/exelban/stats
 * Author: Serhiy Mytrovtsiy
 * Original license: MIT
 * ShoMetrics adaptation is distributed under the project license.
 *
 * DELIBERATE DIVERGENCE FROM Stats:
 * - `IOBluetoothDevice.pairedDevices()` is not ported. It requires Apple's
 *   native IOBluetooth framework, which is not available to pure Node.
 * - `CBCentralManager` scan/connect and `CBPeripheral` battery-service reads
 *   are not ported. They require CoreBluetooth callbacks and may trigger
 *   Bluetooth privacy behavior outside this OS-query-only source.
 * - Stats filters final output with `RSSI != nil`. That gate depends on the
 *   unported native IOBluetooth source. ShoMetrics instead lets the ported
 *   current OS sources (`system_profiler device_connected`, IOKit HID event
 *   service, and `pmset -g accps`) contribute candidates, then emits candidates
 *   that have battery values.
 * - Stats can rely on native IOBluetooth/CoreBluetooth identity sources to
 *   provide device names before `pmset` battery levels are merged. ShoMetrics
 *   does not port those native identity sources, so a `pmset` match may fill an
 *   empty existing name while preserving Stats' battery merge precedence. Once
 *   filled, that name can affect later `pmset` fuzzy matches in the same read;
 *   this is the intended consequence of the pure Node identity-source gap.
 * - Most string readers normalize `""` to absent. Stats' Swift `as? String`
 *   accepts empty strings, but treating blanks as absent keeps empty device
 *   names out of fuzzy matching and prevents blank battery strings from being
 *   interpreted as 0%.
 * - Stats reads Bluetooth cache with `UserDefaults(suiteName:)`, which uses
 *   cfprefs semantics. ShoMetrics attempts a direct plist read through
 *   `plutil`, which is not an equivalent cfprefs merged view.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../../../../../../logging/node-logger";
import { fetchAppleDeviceManagementHIDEventServiceProperties } from "../../iokit-hid-event-service";
import {
    asArray,
    asRecord,
    buildMacOsBluetoothExecFileOptions,
    parsePlistXmlRecord,
} from "../../macos-process";

const log = logger.for("Source:NodeSystem:BluetoothBattery:StatsDerived");
const execFileAsync = promisify(execFile);

const STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 60_000;
const BLUETOOTH_CACHE_PLIST_PATH = "/Library/Preferences/com.apple.Bluetooth.plist";

/**
 * Represents a battery key/value pair.
 *
 * Source: Stats `Kit/helpers.swift:KeyValue_t`.
 */
export interface StatsKeyValue {
    readonly key: string;
    readonly value: string;
    readonly additional?: unknown;
}

/**
 * Represents cached/query Bluetooth data before native IOBluetooth state is applied.
 *
 * Source: Stats `Modules/Bluetooth/readers.swift:bleDevice`.
 */
export interface StatsBleDevice {
    readonly name?: string;
    readonly address: string;
    readonly uuid?: string;
    readonly batteryLevel: readonly StatsKeyValue[];
    readonly vendorId?: number;
    readonly productId?: number;
}

/**
 * Represents native IOBluetooth paired-device state.
 *
 * Source: Stats `Modules/Bluetooth/readers.swift:ioDevice`.
 *
 * DELIBERATE DIVERGENCE FROM Stats:
 * This interface is kept for source parity only. ShoMetrics does not populate
 * it because pure Node cannot call `IOBluetoothDevice.pairedDevices()`.
 */
export interface StatsIoDevice {
    readonly name: string;
    readonly address: string;
    readonly rssi: number;
    readonly isConnected: boolean;
    readonly isPaired: boolean;
}

/**
 * Reads macOS Bluetooth battery devices with the same query order as Stats.
 *
 * Source: Stats `Modules/Bluetooth/readers.swift:DevicesReader.read`.
 */
export async function readStatsBluetoothDevices(
    query: StatsBluetoothQuery = createStatsBluetoothQuery(),
): Promise<readonly StatsBleDevice[]> {
    const startedAtMilliseconds = performance.now();
    // The OS queries are independent, so ShoMetrics runs them concurrently.
    // The merge below stays ordered like Stats: cache -> HID -> profiler ->
    // pmset. Query concurrency must not change source precedence.
    const [iokitHid, SPB, cachedDevices, pmsetLevels] = await Promise.all([
        HIDDevices(query),
        profilerDevices(query),
        cacheDevices(query),
        pmsetAccessoryLevels(query),
    ]);
    const list = [...cachedDevices];
    let nameFilledFromPmsetCount = 0;

    for (const value of iokitHid) {
        if (!list.some(device => device.address === value.address)) {
            list.push(value);
        }
    }
    for (const value of SPB[0]) {
        if (!list.some(device => device.address === value.address)) {
            list.push(value);
        }
    }

    const profilerFilteredDevices = list.filter(device => SPB[1].includes(device.address));
    const devices = list.filter(device => !SPB[1].includes(device.address));

    for (const pmsetLevel of pmsetLevels) {
        const pmsetName = (pmsetLevel.name ?? "").trim().toLowerCase();
        const nameIndex = !pmsetName
            ? -1
            : devices.findIndex(device => {
                const deviceName = (device.name ?? "").trim().toLowerCase();
                // Source parity: Stats uses bidirectional substring matching
                // for pmset name merges. Keep it here so the port stays
                // traceable, but guard the empty-name case because JavaScript
                // `includes("")` differs from Swift `contains("")`.
                return deviceName === pmsetName
                    || deviceName.includes(pmsetName)
                    || (deviceName.length > 0 && pmsetName.includes(deviceName));
            });
        if (nameIndex !== -1) {
            const previousDevice = devices[nameIndex];
            if (pmsetLevel.batteryLevel.length !== 0) {
                devices[nameIndex] = {
                    ...previousDevice,
                    // ShoMetrics-only divergence: our pure Node port omits
                    // native IOBluetooth/CoreBluetooth identity sources, so an
                    // IOKit HID device may have battery/address but an empty
                    // Product. Let pmset fill only missing names; battery still
                    // follows Stats' pmset override behavior.
                    name: resolveMergedDeviceName(previousDevice, pmsetLevel),
                    batteryLevel: pmsetLevel.batteryLevel,
                };
                if (isNonEmptyText(pmsetLevel.name) && !isNonEmptyText(previousDevice?.name)) {
                    nameFilledFromPmsetCount += 1;
                }
            }
            continue;
        }

        const routeIndex = pmsetLevel.vendorId === undefined || pmsetLevel.productId === undefined
            ? -1
            : devices.findIndex(device =>
                device.vendorId === pmsetLevel.vendorId && device.productId === pmsetLevel.productId);
        if (routeIndex !== -1) {
            const previousDevice = devices[routeIndex];
            if (pmsetLevel.batteryLevel.length !== 0) {
                devices[routeIndex] = {
                    ...previousDevice,
                    // Same ShoMetrics-only identity backfill as the name match
                    // path above. Vendor/product matching is needed when an
                    // earlier source has an empty name but stable USB/Bluetooth
                    // product ids, as observed with Magic Trackpad.
                    name: resolveMergedDeviceName(previousDevice, pmsetLevel),
                    batteryLevel: pmsetLevel.batteryLevel,
                };
                if (isNonEmptyText(pmsetLevel.name) && !isNonEmptyText(previousDevice?.name)) {
                    nameFilledFromPmsetCount += 1;
                }
            }
            continue;
        }

        devices.push(pmsetLevel);
    }

    const finalBatteryFilteredDevices = devices.filter(device => device.batteryLevel.length === 0);
    const finalDevices = devices.filter(device => device.batteryLevel.length !== 0);
    logStatsBluetoothReadSummary({
        cacheDeviceCount: cachedDevices.length,
        iokitHidDeviceCount: iokitHid.length,
        profilerDeviceCount: SPB[0].length,
        profilerNotConnectedCount: SPB[1].length,
        pmsetDeviceCount: pmsetLevels.length,
        profilerFilteredDeviceCount: profilerFilteredDevices.length,
        finalBatteryFilteredDeviceCount: finalBatteryFilteredDevices.length,
        emittedDeviceCount: finalDevices.length,
        emittedWithNameCount: countDevicesWithName(finalDevices),
        nameFilledFromPmsetCount,
        durationMilliseconds: performance.now() - startedAtMilliseconds,
    });
    logStatsBluetoothDeviceShapes("final", finalDevices);
    logStatsBluetoothFinalEvidence(finalDevices, {
        cachedDevices,
        iokitHid,
        profilerConnectedDevices: SPB[0],
        profilerNotConnectedAddresses: SPB[1],
        pmsetLevels,
    });
    logStatsBluetoothDroppedDeviceShapes("profiler-not-connected", profilerFilteredDevices);
    logStatsBluetoothDroppedDeviceShapes("missing-battery", finalBatteryFilteredDevices);

    return finalDevices;
}

/**
 * Reads connected BLE peripherals from the mac: keyboard, mouse etc.
 *
 * Source: Stats `Modules/Bluetooth/readers.swift:DevicesReader.HIDDevices`.
 * Source helper: Stats `Kit/helpers.swift:fetchIOService`.
 *
 * DELIBERATE DIVERGENCE FROM Stats:
 * Stats calls IOKit directly and receives `NSDictionary` values. ShoMetrics
 * imports a Node-only equivalence query from `../../iokit-hid-event-service`,
 * which replaces Stats `fetchIOService` with a narrow ioreg-backed source.
 * When `BD_ADDR` is emitted as ioreg data, ShoMetrics keeps a hex string;
 * Stats decodes the native `Data` value as UTF-8. This source is only a
 * fallback identity signal, so the value must be treated as stable but
 * representation-specific.
 *
 * This is not the native HID package transport. It only reads IOKit registry
 * properties that macOS already exposes, so it does not open HID interfaces or
 * require Input Monitoring permission.
 *
 * DELIBERATE DIVERGENCE FROM Stats:
 * Stats requires both `Product` and `BatteryPercent`. ShoMetrics accepts an
 * empty `Product` so the IOKit HID registry can contribute battery/address and
 * a later Stats source can fill the missing name. Downstream fuzzy name
 * matching must therefore treat empty names as non-matches; JavaScript
 * `includes("")` is true while Swift `contains("")` is false.
 */
/**
 * Reads Apple IOKit HID event service battery data, matching Stats `HIDDevices`.
 */
export async function HIDDevices(query: StatsBluetoothQuery = createStatsBluetoothQuery()): Promise<readonly StatsBleDevice[]> {
    const startedAtMilliseconds = performance.now();
    const ioDevices = await readOrDefault(
        "iokitHid",
        query.fetchAppleDeviceManagementHIDEventServiceProperties,
        [],
    );
    const list: StatsBleDevice[] = [];

    for (const deviceProperties of ioDevices.filter(device => device.BluetoothDevice === true)) {
        const name = readOptionalStringProperty(deviceProperties, "Product");
        const batteryPercent = readNumberProperty(deviceProperties, "BatteryPercent");
        if (batteryPercent === undefined) {
            continue;
        }

        const address = readStringProperty(deviceProperties, "DeviceAddress")
            ?? readStringProperty(deviceProperties, "SerialNumber")
            ?? readStringProperty(deviceProperties, "BD_ADDR")
            ?? "";

        const vendorId = readNumberProperty(deviceProperties, "VendorID");
        const productId = readNumberProperty(deviceProperties, "ProductID");
        list.push({
            name,
            address,
            uuid: undefined,
            batteryLevel: [buildStatsKeyValue("battery", `${batteryPercent}`)],
            vendorId,
            productId,
        });
    }

    logStatsBluetoothSourceSummary("iokitHid", {
        rawCount: ioDevices.length,
        candidateCount: ioDevices.filter(device => device.BluetoothDevice === true).length,
        emittedCount: list.length,
        withNameCount: countDevicesWithName(list),
        withAddressCount: list.filter(device => isNonEmptyText(device.address)).length,
        withBatteryCount: list.filter(device => device.batteryLevel.length !== 0).length,
        durationMilliseconds: performance.now() - startedAtMilliseconds,
    });
    logStatsBluetoothDeviceShapes("iokitHid", list);

    return list;
}

/**
 * Reads Bluetooth cache devices.
 *
 * Source: Stats `Modules/Bluetooth/readers.swift:DevicesReader.cacheDevices`.
 *
 * DELIBERATE DIVERGENCE FROM Stats:
 * Stats uses `UserDefaults(suiteName: "/Library/Preferences/com.apple.Bluetooth")`.
 * ShoMetrics reads the disk plist through `plutil`; this can miss cfprefs
 * merged or per-user state, so an empty result is expected on modern macOS when
 * `DeviceCache`, `PairedDevices`, or `CoreBluetoothCache` are not in that file.
 */
/**
 * Reads the Bluetooth cache source, matching Stats `cacheDevices`.
 */
export async function cacheDevices(query: StatsBluetoothQuery = createStatsBluetoothQuery()): Promise<readonly StatsBleDevice[]> {
    const startedAtMilliseconds = performance.now();
    const cache = await readOrDefault("cache", query.readBluetoothCachePlist, {});
    const deviceCache = readRecordProperty(cache, "DeviceCache");
    const pairedDevices = readStringArrayProperty(cache, "PairedDevices");
    const coreCache = readRecordProperty(cache, "CoreBluetoothCache");
    if (deviceCache === undefined || pairedDevices === undefined || coreCache === undefined) {
        logStatsBluetoothSourceSummary("cache", {
            rawCount: 0,
            candidateCount: 0,
            emittedCount: 0,
            withNameCount: 0,
            withAddressCount: 0,
            withBatteryCount: 0,
            durationMilliseconds: performance.now() - startedAtMilliseconds,
            extra: `topLevelKeys=${Object.keys(cache).join(",") || "none"}`,
        });
        return [];
    }

    const list: StatsBleDevice[] = [];
    for (const [address, rawDeviceProperties] of Object.entries(deviceCache).filter(([address]) => pairedDevices.includes(address))) {
        const deviceProperties = asRecord(rawDeviceProperties);
        if (deviceProperties === undefined) {
            continue;
        }

        const name = readStringProperty(deviceProperties, "Name");
        let uuid: string | undefined;
        const batteryLevel: StatsKeyValue[] = [];

        for (const key of ["BatteryPercent", "BatteryPercentCase", "BatteryPercentLeft", "BatteryPercentRight"]) {
            if (!(key in deviceProperties)) {
                continue;
            }

            const rawPercentage = deviceProperties[key];
            let percentage: number;
            if (typeof rawPercentage === "number" && Number.isInteger(rawPercentage)) {
                percentage = rawPercentage;
                if (percentage === 1) {
                    percentage *= 100;
                }
            } else if (typeof rawPercentage === "number") {
                percentage = Math.trunc(rawPercentage * 100);
            } else {
                continue;
            }

            batteryLevel.push(buildStatsKeyValue(key, `${percentage}`));
        }

        for (const [key, rawCoreProperties] of Object.entries(coreCache)) {
            const coreProperties = asRecord(rawCoreProperties);
            if (readStringProperty(coreProperties, "DeviceAddress") === address) {
                // Stats validates `UUID(uuidString: key)`. ShoMetrics keeps the
                // key unchanged because UUID is trace-only here and not used as
                // the descriptor identity.
                uuid = key;
            }
        }

        list.push({
            name,
            address,
            uuid,
            batteryLevel,
        });
    }

    logStatsBluetoothSourceSummary("cache", {
        rawCount: Object.keys(deviceCache).length,
        candidateCount: pairedDevices.length,
        emittedCount: list.length,
        withNameCount: countDevicesWithName(list),
        withAddressCount: list.filter(device => isNonEmptyText(device.address)).length,
        withBatteryCount: list.filter(device => device.batteryLevel.length !== 0).length,
        durationMilliseconds: performance.now() - startedAtMilliseconds,
    });
    logStatsBluetoothDeviceShapes("cache", list);

    return list;
}

/**
 * Reads `system_profiler SPBluetoothDataType -json` Bluetooth devices.
 *
 * Source: Stats `Modules/Bluetooth/readers.swift:DevicesReader.profilerDevices`.
 */
/**
 * Reads `system_profiler SPBluetoothDataType` data, matching Stats `profilerDevices`.
 */
export async function profilerDevices(
    query: StatsBluetoothQuery = createStatsBluetoothQuery(),
): Promise<readonly [readonly StatsBleDevice[], readonly string[]]> {
    const startedAtMilliseconds = performance.now();
    const list: StatsBleDevice[] = [];
    const notConnected: string[] = [];
    const result = await readOrDefault("profiler", query.systemProfilerBluetoothJson, "");
    if (result.length === 0) {
        logStatsBluetoothSourceSummary("profiler", {
            rawCount: 0,
            candidateCount: 0,
            emittedCount: 0,
            withNameCount: 0,
            withAddressCount: 0,
            withBatteryCount: 0,
            durationMilliseconds: performance.now() - startedAtMilliseconds,
        });
        return [list, notConnected];
    }

    const json = parseJsonOrUndefined(result);
    const root = asRecord(json);
    const SPBluetoothDataType = asArray(root?.SPBluetoothDataType);
    const data = asRecord(SPBluetoothDataType?.[0]);
    if (data === undefined) {
        return [list, notConnected];
    }

    const rawList = asArray(data.device_connected);
    const devices = asRecord(rawList?.[0]);
    const rawConnectedCount = devices === undefined ? 0 : Object.keys(devices).length;
    if (devices !== undefined) {
        for (const [name, rawProperties] of Object.entries(devices)) {
            const properties = asRecord(rawProperties);
            if (properties === undefined) {
                continue;
            }

            const batteryLevel: StatsKeyValue[] = [];
            for (const key of [
                "device_batteryLevelCase",
                "device_batteryLevelLeft",
                "device_batteryLevelRight",
                "Left Battery Level",
                "Right Battery Level",
                "device_batteryLevelMain",
            ]) {
                if (!(key in properties)) {
                    continue;
                }

                batteryLevel.push(buildStatsKeyValue(key, readStringProperty(properties, key)?.replaceAll("%", "") ?? "-1"));
            }

            const address = readStringProperty(properties, "device_address") ?? "";
            list.push({
                name,
                address: address.replaceAll(":", "-").toLowerCase(),
                batteryLevel,
            });
        }
    }

    const rawNotConnectedList = asArray(data.device_not_connected);
    if (rawNotConnectedList !== undefined) {
        for (const rawDevice of rawNotConnectedList) {
            const device = asRecord(rawDevice);
            if (device === undefined) {
                continue;
            }

            for (const rawNotConnectedProperties of Object.values(device)) {
                const properties = asRecord(rawNotConnectedProperties);
                const address = readStringProperty(properties, "device_address");
                if (address !== undefined) {
                    notConnected.push(address.replaceAll(":", "-").toLowerCase());
                }
            }
        }
    }

    logStatsBluetoothSourceSummary("profiler", {
        rawCount: rawConnectedCount,
        candidateCount: rawConnectedCount,
        emittedCount: list.length,
        withNameCount: countDevicesWithName(list),
        withAddressCount: list.filter(device => isNonEmptyText(device.address)).length,
        withBatteryCount: list.filter(device => device.batteryLevel.length !== 0).length,
        durationMilliseconds: performance.now() - startedAtMilliseconds,
        extra: `notConnected=${notConnected.length}`,
    });
    logStatsBluetoothDeviceShapes("profiler", list);

    return [list, notConnected];
}

/**
 * Reads `pmset -g accps -xml` accessory battery levels.
 *
 * Source: Stats `Modules/Bluetooth/readers.swift:DevicesReader.pmsetAccessoryLevels`.
 */
/**
 * Reads `pmset -g accps -xml` accessory battery data, matching Stats `pmsetAccessoryLevels`.
 */
export async function pmsetAccessoryLevels(
    query: StatsBluetoothQuery = createStatsBluetoothQuery(),
): Promise<readonly StatsBleDevice[]> {
    const startedAtMilliseconds = performance.now();
    const result = await readOrDefault("pmset", query.pmsetAccessoryPowerSourcesXml, "");
    const plists = await Promise.all(result.split("<?xml")
        .filter(chunk => chunk.trim().length !== 0)
        .map(chunk => readOrDefault(
            "pmset-plist",
            async () => await query.parsePlistXml(`<?xml${chunk}`),
            {},
        )));

    interface PmsetEntry {
        readonly name: string;
        readonly capacity: number;
        readonly accessoryIdentifier: string;
        readonly partIdentifier?: string;
        readonly groupIdentifier?: string;
        readonly category?: string;
        readonly isCharging: boolean;
        readonly vendorId?: number;
        readonly productId?: number;
        readonly combinedParts?: readonly Record<string, unknown>[];
    }

    const entries: PmsetEntry[] = [];
    for (const plist of plists) {
        const name = readStringProperty(plist, "Name");
        const capacity = readNumberProperty(plist, "Current Capacity");
        const accessoryIdentifier = readStringProperty(plist, "Accessory Identifier");
        if (name === undefined || capacity === undefined || accessoryIdentifier === undefined) {
            continue;
        }

        let isCharging: boolean;
        const charging = readBooleanProperty(plist, "Is Charging");
        if (charging !== undefined) {
            isCharging = charging;
        } else {
            isCharging = readStringProperty(plist, "Power Source State") === "AC Power";
        }

        entries.push({
            name,
            capacity,
            accessoryIdentifier,
            partIdentifier: readStringProperty(plist, "Part Identifier"),
            groupIdentifier: readStringProperty(plist, "Group Identifier"),
            category: readStringProperty(plist, "Accessory Category"),
            isCharging,
            vendorId: readNumberProperty(plist, "Vendor ID"),
            productId: readNumberProperty(plist, "Product ID"),
            combinedParts: asArray(plist["Combined Parts"])?.flatMap(rawPart => {
                const part = asRecord(rawPart);
                return part === undefined ? [] : [part];
            }),
        });
    }

    const grouped = new Map<string, PmsetEntry[]>();
    const standalone: PmsetEntry[] = [];
    for (const entry of entries) {
        if (entry.groupIdentifier !== undefined) {
            const group = grouped.get(entry.groupIdentifier) ?? [];
            group.push(entry);
            grouped.set(entry.groupIdentifier, group);
        } else {
            standalone.push(entry);
        }
    }

    const out: StatsBleDevice[] = [];

    for (const entry of standalone) {
        const state = entry.isCharging ? "charging" : "discharging";
        out.push({
            name: entry.name,
            address: entry.accessoryIdentifier,
            uuid: undefined,
            batteryLevel: [buildStatsKeyValue("battery", `${entry.capacity}`, state)],
            vendorId: entry.vendorId,
            productId: entry.productId,
        });
    }

    for (const group of grouped.values()) {
        const combinedEntry = group.find(entry => entry.partIdentifier === "Combined");
        const caseEntry = group.find(entry => entry.partIdentifier === "Case" || entry.category === "Audio Battery Case");
        const displayName = combinedEntry?.name
            ?? group.find(entry => !(entry.category ?? "").includes("Case"))?.name
            ?? group[0]?.name
            ?? "";
        const accessoryId = combinedEntry?.accessoryIdentifier ?? group[0]?.accessoryIdentifier ?? "";

        const keyValues: StatsKeyValue[] = [];

        if (caseEntry !== undefined) {
            const state = caseEntry.isCharging ? "charging" : "discharging";
            keyValues.push(buildStatsKeyValue("case", `${caseEntry.capacity}`, state));
        }

        const parts = combinedEntry?.combinedParts;
        if (parts !== undefined) {
            for (const part of parts) {
                const partId = readStringProperty(part, "Part Identifier");
                const capacity = readNumberProperty(part, "Current Capacity");
                if (partId === undefined || capacity === undefined) {
                    continue;
                }

                const charging = readBooleanProperty(part, "Is Charging") ?? false;
                const state = charging ? "charging" : "discharging";
                keyValues.push(buildStatsKeyValue(partId.toLowerCase(), `${capacity}`, state));
            }
        }

        const fallbackEntry = combinedEntry ?? group[0];
        if (keyValues.length === 0 && fallbackEntry !== undefined) {
            const state = fallbackEntry.isCharging ? "charging" : "discharging";
            keyValues.push(buildStatsKeyValue("battery", `${fallbackEntry.capacity}`, state));
        }

        out.push({
            name: displayName,
            address: accessoryId,
            uuid: undefined,
            batteryLevel: keyValues,
            vendorId: combinedEntry?.vendorId ?? group[0]?.vendorId,
            productId: combinedEntry?.productId ?? group[0]?.productId,
        });
    }

    logStatsBluetoothSourceSummary("pmset", {
        rawCount: plists.length,
        candidateCount: entries.length,
        emittedCount: out.length,
        withNameCount: countDevicesWithName(out),
        withAddressCount: out.filter(device => isNonEmptyText(device.address)).length,
        withBatteryCount: out.filter(device => device.batteryLevel.length !== 0).length,
        durationMilliseconds: performance.now() - startedAtMilliseconds,
        extra: `standalone=${standalone.length} grouped=${grouped.size}`,
    });
    logStatsBluetoothDeviceShapes("pmset", out);

    return out;
}

/**
 * Supplies the external macOS queries used by the Stats-derived reader.
 */
export interface StatsBluetoothQuery {
    readonly fetchAppleDeviceManagementHIDEventServiceProperties: () => Promise<readonly Record<string, unknown>[]>;
    readonly readBluetoothCachePlist: () => Promise<Record<string, unknown>>;
    readonly systemProfilerBluetoothJson: () => Promise<string>;
    readonly pmsetAccessoryPowerSourcesXml: () => Promise<string>;
    readonly parsePlistXml: (xml: string) => Promise<Record<string, unknown>>;
}

/**
 * Creates the production macOS command-backed Stats query implementation.
 */
export function createStatsBluetoothQuery(): StatsBluetoothQuery {
    return {
        fetchAppleDeviceManagementHIDEventServiceProperties,
        readBluetoothCachePlist: async () => {
            const { stdout } = await execFileAsync("/usr/bin/plutil", [
                "-convert",
                "json",
                "-o",
                "-",
                BLUETOOTH_CACHE_PLIST_PATH,
            ], buildMacOsBluetoothExecFileOptions());
            return asRecord(JSON.parse(stdout) as unknown) ?? {};
        },
        systemProfilerBluetoothJson: async () => {
            const { stdout } = await execFileAsync("/usr/sbin/system_profiler", [
                "SPBluetoothDataType",
                "-json",
            ], buildMacOsBluetoothExecFileOptions());
            return stdout;
        },
        pmsetAccessoryPowerSourcesXml: async () => {
            const { stdout } = await execFileAsync("/usr/bin/pmset", [
                "-g",
                "accps",
                "-xml",
            ], buildMacOsBluetoothExecFileOptions());
            return stdout;
        },
        parsePlistXml: parsePlistXmlRecord,
    };
}

function buildStatsKeyValue(key: string, value: string, additional?: unknown): StatsKeyValue {
    return {
        key,
        value,
        additional,
    };
}

function resolveMergedDeviceName(
    existingDevice: StatsBleDevice | undefined,
    incomingDevice: StatsBleDevice,
): string | undefined {
    return isNonEmptyText(existingDevice?.name)
        ? existingDevice?.name
        : incomingDevice.name;
}

function countDevicesWithName(devices: readonly StatsBleDevice[]): number {
    return devices.filter(device => isNonEmptyText(device.name)).length;
}

function isNonEmptyText(value: string | undefined): boolean {
    return value !== undefined && value.trim().length !== 0;
}

function logStatsBluetoothReadSummary(options: {
    readonly cacheDeviceCount: number;
    readonly iokitHidDeviceCount: number;
    readonly profilerDeviceCount: number;
    readonly profilerNotConnectedCount: number;
    readonly pmsetDeviceCount: number;
    readonly profilerFilteredDeviceCount: number;
    readonly finalBatteryFilteredDeviceCount: number;
    readonly emittedDeviceCount: number;
    readonly emittedWithNameCount: number;
    readonly nameFilledFromPmsetCount: number;
    readonly durationMilliseconds: number;
}): void {
    // ShoMetrics-only diagnostics: Stats does not log source shape summaries.
    // Keep this bounded because the reader can run during low-frequency metric
    // polling, not only while the PI is open.
    log.atDebug()
        .everyMs("stats-bluetooth-read-summary", STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "statsBluetoothReadSummary",
            `cache=${options.cacheDeviceCount}`,
            `iokitHid=${options.iokitHidDeviceCount}`,
            `profiler=${options.profilerDeviceCount}`,
            `notConnected=${options.profilerNotConnectedCount}`,
            `pmset=${options.pmsetDeviceCount}`,
            `filteredNotConnected=${options.profilerFilteredDeviceCount}`,
            `filteredMissingBattery=${options.finalBatteryFilteredDeviceCount}`,
            `emitted=${options.emittedDeviceCount}`,
            `emittedWithName=${options.emittedWithNameCount}`,
            `nameFilledFromPmset=${options.nameFilledFromPmsetCount}`,
            `durationMs=${Math.round(options.durationMilliseconds)}`,
        ].join(" "));

    if (options.emittedDeviceCount > 0 && options.emittedWithNameCount === 0) {
        log.atWarn()
            .everyMs("stats-bluetooth-read-empty-names", STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log([
                "statsBluetoothReadMissingNames",
                `emitted=${options.emittedDeviceCount}`,
                `cache=${options.cacheDeviceCount}`,
                `iokitHid=${options.iokitHidDeviceCount}`,
                `profiler=${options.profilerDeviceCount}`,
                `pmset=${options.pmsetDeviceCount}`,
            ].join(" "));
    }

    const sourceDeviceCount = options.cacheDeviceCount
        + options.iokitHidDeviceCount
        + options.profilerDeviceCount
        + options.pmsetDeviceCount;
    if (sourceDeviceCount > 0 && options.emittedDeviceCount === 0) {
        log.atWarn()
            .everyMs("stats-bluetooth-read-empty-output", STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log([
                "statsBluetoothReadEmittedNoDevices",
                `sourceDevices=${sourceDeviceCount}`,
                `filteredNotConnected=${options.profilerFilteredDeviceCount}`,
                `filteredMissingBattery=${options.finalBatteryFilteredDeviceCount}`,
                `cache=${options.cacheDeviceCount}`,
                `iokitHid=${options.iokitHidDeviceCount}`,
                `profiler=${options.profilerDeviceCount}`,
                `pmset=${options.pmsetDeviceCount}`,
            ].join(" "));
    }
}

function logStatsBluetoothSourceSummary(source: string, options: {
    readonly rawCount: number;
    readonly candidateCount: number;
    readonly emittedCount: number;
    readonly withNameCount: number;
    readonly withAddressCount: number;
    readonly withBatteryCount: number;
    readonly durationMilliseconds: number;
    readonly extra?: string;
}): void {
    // Warn when an OS source shape drifts far enough that parsing silently drops
    // devices or key attributes. These are intentionally summaries, not raw
    // command dumps, to keep production logs bounded.
    log.atDebug()
        .everyMs(`stats-bluetooth-source-${source}`, STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "statsBluetoothSourceSummary",
            `source=${source}`,
            `raw=${options.rawCount}`,
            `candidates=${options.candidateCount}`,
            `emitted=${options.emittedCount}`,
            `withName=${options.withNameCount}`,
            `withAddress=${options.withAddressCount}`,
            `withBattery=${options.withBatteryCount}`,
            `durationMs=${Math.round(options.durationMilliseconds)}`,
            options.extra ?? "",
        ].filter(part => part.length !== 0).join(" "));

    if (options.candidateCount > 0 && options.emittedCount === 0) {
        log.atWarn()
            .everyMs(`stats-bluetooth-source-${source}-empty-parse`, STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log([
                "statsBluetoothSourceParsedNoDevices",
                `source=${source}`,
                `raw=${options.rawCount}`,
                `candidates=${options.candidateCount}`,
            ].join(" "));
    }

    if (options.emittedCount > 0 && options.withNameCount === 0) {
        log.atWarn()
            .everyMs(`stats-bluetooth-source-${source}-empty-names`, STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log([
                "statsBluetoothSourceMissingNames",
                `source=${source}`,
                `emitted=${options.emittedCount}`,
                `withAddress=${options.withAddressCount}`,
                `withBattery=${options.withBatteryCount}`,
            ].join(" "));
    }

    if (options.emittedCount > 0 && options.withAddressCount === 0) {
        log.atWarn()
            .everyMs(`stats-bluetooth-source-${source}-empty-addresses`, STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log([
                "statsBluetoothSourceMissingAddresses",
                `source=${source}`,
                `emitted=${options.emittedCount}`,
                `withName=${options.withNameCount}`,
                `withBattery=${options.withBatteryCount}`,
            ].join(" "));
    }

    if (options.emittedCount > 0 && options.withBatteryCount === 0) {
        log.atWarn()
            .everyMs(`stats-bluetooth-source-${source}-empty-battery`, STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log([
                "statsBluetoothSourceMissingBattery",
                `source=${source}`,
                `emitted=${options.emittedCount}`,
                `withName=${options.withNameCount}`,
                `withAddress=${options.withAddressCount}`,
            ].join(" "));
    }
}

function logStatsBluetoothDeviceShapes(source: string, devices: readonly StatsBleDevice[]): void {
    log.atDebug()
        .everyMs(`stats-bluetooth-device-shapes-${source}`, STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "statsBluetoothDeviceShapes",
            `source=${source}`,
            `count=${devices.length}`,
            `devices=${devices.slice(0, 12).map(formatStatsBluetoothDeviceShape).join(";")}`,
        ].join(" "));
}

function logStatsBluetoothDroppedDeviceShapes(reason: string, devices: readonly StatsBleDevice[]): void {
    if (devices.length === 0) {
        return;
    }

    log.atWarn()
        .everyMs(`stats-bluetooth-dropped-${reason}`, STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "statsBluetoothDroppedDevices",
            `reason=${reason}`,
            `count=${devices.length}`,
            `devices=${devices.slice(0, 12).map(formatStatsBluetoothDeviceShape).join(";")}`,
        ].join(" "));
}

function logStatsBluetoothFinalEvidence(devices: readonly StatsBleDevice[], sources: {
    readonly cachedDevices: readonly StatsBleDevice[];
    readonly iokitHid: readonly StatsBleDevice[];
    readonly profilerConnectedDevices: readonly StatsBleDevice[];
    readonly profilerNotConnectedAddresses: readonly string[];
    readonly pmsetLevels: readonly StatsBleDevice[];
}): void {
    log.atDebug()
        .everyMs("stats-bluetooth-final-evidence", STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "statsBluetoothFinalEvidence",
            `count=${devices.length}`,
            `devices=${devices.slice(0, 12).map(device => formatStatsBluetoothFinalEvidenceShape(device, sources)).join(";")}`,
        ].join(" "));
}

function formatStatsBluetoothFinalEvidenceShape(device: StatsBleDevice, sources: {
    readonly cachedDevices: readonly StatsBleDevice[];
    readonly iokitHid: readonly StatsBleDevice[];
    readonly profilerConnectedDevices: readonly StatsBleDevice[];
    readonly profilerNotConnectedAddresses: readonly string[];
    readonly pmsetLevels: readonly StatsBleDevice[];
}): string {
    const sourceNames = [
        hasMatchingStatsDevice(device, sources.cachedDevices) ? "cache" : undefined,
        hasMatchingStatsDevice(device, sources.iokitHid) ? "iokitHid" : undefined,
        hasMatchingStatsDevice(device, sources.profilerConnectedDevices) ? "profilerConnected" : undefined,
        hasMatchingStatsDevice(device, sources.pmsetLevels) ? "pmset" : undefined,
    ].filter((sourceName): sourceName is string => sourceName !== undefined);

    return [
        `name=${formatDiagnosticText(device.name)}`,
        `address=${formatDiagnosticAddressShape(device.address)}`,
        `sources=${sourceNames.join("|") || "unknown"}`,
        `profilerNotConnected=${sources.profilerNotConnectedAddresses.includes(device.address)}`,
        `batteryKeys=${device.batteryLevel.map(level => level.key).join("|") || "none"}`,
    ].join(",");
}

function hasMatchingStatsDevice(device: StatsBleDevice, candidates: readonly StatsBleDevice[]): boolean {
    return candidates.some(candidate => {
        if (candidate.address === device.address) {
            return true;
        }

        if (
            candidate.vendorId !== undefined
            && candidate.productId !== undefined
            && candidate.vendorId === device.vendorId
            && candidate.productId === device.productId
        ) {
            return true;
        }

        const deviceName = device.name?.trim().toLowerCase();
        const candidateName = candidate.name?.trim().toLowerCase();
        return deviceName !== undefined
            && deviceName.length !== 0
            && candidateName !== undefined
            && candidateName.length !== 0
            && deviceName === candidateName;
    });
}

function formatStatsBluetoothDeviceShape(device: StatsBleDevice): string {
    return [
        `name=${formatDiagnosticText(device.name)}`,
        `address=${formatDiagnosticAddressShape(device.address)}`,
        `batteryKeys=${device.batteryLevel.map(level => level.key).join("|") || "none"}`,
        `vendor=${device.vendorId ?? "none"}`,
        `product=${device.productId ?? "none"}`,
    ].join(",");
}

function formatDiagnosticText(value: string | undefined): string {
    const normalizedValue = value?.trim();
    if (normalizedValue === undefined || normalizedValue.length === 0) {
        return "empty";
    }

    return `present:${normalizedValue.length}`;
}

function formatDiagnosticAddressShape(value: string): string {
    if (value.trim().length === 0) {
        return "empty";
    }

    if (/^(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/u.test(value.trim())) {
        return "mac-like";
    }

    return `non-mac-like:${value.length}`;
}

function readRecordProperty(value: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
    return asRecord(value?.[key]);
}

function readStringArrayProperty(value: Record<string, unknown> | undefined, key: string): readonly string[] | undefined {
    const array = asArray(value?.[key]);
    if (array === undefined || !array.every(item => typeof item === "string")) {
        return undefined;
    }

    return array;
}

function readStringProperty(value: Record<string, unknown> | undefined, key: string): string | undefined {
    const property = value?.[key];
    // DELIBERATE DIVERGENCE FROM Stats: Swift `as? String` accepts `""`.
    // ShoMetrics normalizes blank strings to absent for source identity fields
    // and battery text, so empty names cannot enter fuzzy matching and empty
    // battery values cannot become JavaScript's numeric 0.
    return typeof property === "string" && property.length !== 0 ? property : undefined;
}

function readOptionalStringProperty(value: Record<string, unknown> | undefined, key: string): string | undefined {
    const property = value?.[key];
    return typeof property === "string" ? property : undefined;
}

function readNumberProperty(value: Record<string, unknown> | undefined, key: string): number | undefined {
    const property = value?.[key];
    return typeof property === "number" && Number.isFinite(property) ? property : undefined;
}

function readBooleanProperty(value: Record<string, unknown> | undefined, key: string): boolean | undefined {
    const property = value?.[key];
    return typeof property === "boolean" ? property : undefined;
}

async function readOrDefault<TValue>(
    operation: string,
    read: () => Promise<TValue>,
    defaultValue: TValue,
): Promise<TValue> {
    try {
        return await read();
    } catch (error) {
        log.atWarn()
            .everyMs(`stats-bluetooth-read-failed-${operation}`, STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "statsBluetoothReadFailed",
                `operation=${operation}`,
                `error=${String(error)}`,
            ].join(" "));
        return defaultValue;
    }
}

function parseJsonOrUndefined(value: string): unknown {
    try {
        return JSON.parse(value) as unknown;
    } catch (error) {
        log.atWarn()
            .everyMs("stats-bluetooth-json-parse-failed", STATS_BLUETOOTH_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => `statsBluetoothJsonParseFailed error=${String(error)}`);
        return undefined;
    }
}
