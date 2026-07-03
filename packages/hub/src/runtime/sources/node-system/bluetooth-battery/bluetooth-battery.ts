import { execFile } from "node:child_process";
import { promisify } from "node:util";
import si, { type Systeminformation } from "systeminformation";
import { logger } from "../../../../logging/node-logger";
import type {
    ResolvedSystemBluetoothPeripheralIdentifier,
    ResolvedSystemPeripheralIdentity,
} from "../../../../settings/resolved-settings";
import {
    buildBluetoothBatteryDescriptorIdFromPrimaryIdentifierHash,
    buildBluetoothBatteryPercentMetricKey,
    isBluetoothBatteryMetricKey,
} from "../../../metric-keys";
import {
    readMacOsBluetoothBatteryMetrics,
    readMacOsBluetoothDescriptorDevices,
    type MacOsBluetoothDeviceReader,
} from "./macos";
import {
    buildBluetoothIdentifier,
    normalizeBluetoothDeviceAddress,
    normalizeNonEmptyText,
    resolveBluetoothBatteryPercentValue,
} from "./identity";
import type { BatteryDeviceDescriptor } from "../../battery/battery-device-descriptor";
import {
    buildScalarMetricValue,
    MetricUnit,
    type MetricValue,
} from "../../metric-source";
import {
    bluetoothBatteryRouteRegistry,
    type BluetoothBatteryRouteDefinition,
    type BluetoothBatteryRouteRegistry,
} from "./route-registry";

const log = logger.for("Source:NodeSystem:BluetoothBattery");
const execFileAsync = promisify(execFile);
const WINDOWS_BLUETOOTH_BATTERY_PERCENT_PROPERTY_KEY = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";
const BLUETOOTH_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 60_000;
const BLUETOOTH_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS = 60_000;
const WINDOWS_BLUETOOTH_DEVICE_LIST_TIMEOUT_MILLISECONDS = 5_000;
const WINDOWS_BLUETOOTH_BATTERY_READ_TIMEOUT_MILLISECONDS = 5_000;

// This module owns OS-reported Bluetooth battery readings. It intentionally
// stays separate from vendor HID battery readers: Bluetooth devices should be
// discovered and polled through OS facilities, while dongle/wired devices stay
// in the experimental vendor HID source.

interface BluetoothBatteryDescriptorDevice {
    readonly descriptor: BatteryDeviceDescriptor;
    readonly route: BluetoothBatteryRoute | undefined;
    readonly batteryPercent: number | undefined;
}

interface BluetoothBatteryRoute {
    readonly descriptorId: string;
    readonly metricKey: string;
    readonly instanceId: string;
}

interface SelectedBluetoothBatteryRoute {
    readonly metricKey: string;
    readonly instanceId: string;
}

/**
 * Reads Bluetooth battery metrics for requested metric keys on the active platform.
 */
export type BluetoothBatteryMetricReader = (
    systemInformation: Pick<typeof si, "bluetoothDevices">,
    platform: NodeJS.Platform,
    requestedMetricKeys: readonly string[],
) => Promise<Record<string, MetricValue>>;

interface WindowsBluetoothDeviceRouteData {
    readonly name?: unknown;
    readonly manufacturer?: unknown;
    readonly instanceId?: unknown;
    readonly bluetoothAddress?: unknown;
    readonly aepAddress?: unknown;
    readonly connected?: unknown;
}

interface WindowsBluetoothBatteryData {
    readonly instanceId?: unknown;
    readonly batteryPercent?: unknown;
}

const bluetoothRouteByMetricKey = new Map<string, BluetoothBatteryRoute>();

/**
 * Reads the Bluetooth battery descriptors shown in the System widget device selector.
 *
 * Descriptor reads list devices only. They must not read every device's battery
 * property, because opening the PI should show candidates quickly and should not
 * pay per-device property cost before the user chooses a device.
 */
export async function readBluetoothBatteryDeviceDescriptors(
    systemInformation: Pick<typeof si, "bluetoothDevices"> = si,
    platform: NodeJS.Platform = process.platform,
    listWindowsBluetoothDevices: () => Promise<readonly WindowsBluetoothDeviceRouteData[]> = listWindowsBluetoothDevicesFromPowerShell,
    readMacOsBluetoothDevices?: MacOsBluetoothDeviceReader,
): Promise<readonly BatteryDeviceDescriptor[]> {
    try {
        if (platform === "darwin") {
            return await readMacOsBluetoothDescriptorDevices(readMacOsBluetoothDevices);
        }

        const devices = platform === "win32"
            ? resolveWindowsBluetoothDescriptorDevices(await listWindowsBluetoothDevices())
            : resolveSystemInformationBluetoothDescriptorDevices(await systemInformation.bluetoothDevices());
        cacheBluetoothRoutes(devices);
        return devices.map(device => device.descriptor);
    } catch (error) {
        logBluetoothBatteryFailure("descriptor-list", error);
        return [];
    }
}

/**
 * Reads only requested Bluetooth battery metrics from the OS-owned battery source.
 *
 * The selected-device path is deliberately narrow: first resolve the selected
 * metric keys to platform routes, then read battery properties only for those
 * routes. We never enumerate battery values for every paired Bluetooth device.
 */
export async function readBluetoothBatteryMetrics(
    systemInformation: Pick<typeof si, "bluetoothDevices">,
    platform: NodeJS.Platform,
    requestedMetricKeys: readonly string[],
    listWindowsBluetoothDevices: () => Promise<readonly WindowsBluetoothDeviceRouteData[]> = listWindowsBluetoothDevicesFromPowerShell,
    readWindowsBluetoothBatteries: (
        instanceIds: readonly string[],
    ) => Promise<readonly WindowsBluetoothBatteryData[]> = readWindowsBluetoothBatteriesFromPowerShell,
    routeRegistry: BluetoothBatteryRouteRegistry = bluetoothBatteryRouteRegistry,
    readMacOsBluetoothDevices?: MacOsBluetoothDeviceReader,
): Promise<Record<string, MetricValue>> {
    const bluetoothMetricKeys = requestedMetricKeys.filter(isBluetoothBatteryMetricKey);
    if (bluetoothMetricKeys.length === 0) {
        return {};
    }

    if (platform === "win32") {
        return await readWindowsBluetoothBatteryMetrics(
            bluetoothMetricKeys,
            listWindowsBluetoothDevices,
            readWindowsBluetoothBatteries,
            routeRegistry,
        );
    }

    return platform === "darwin"
        ? await readMacOsBluetoothBatteryMetrics(bluetoothMetricKeys, readMacOsBluetoothDevices)
        : buildSystemInformationBluetoothBatteryMetrics(await systemInformation.bluetoothDevices(), bluetoothMetricKeys);
}

async function readWindowsBluetoothBatteryMetrics(
    bluetoothMetricKeys: readonly string[],
    listWindowsBluetoothDevices: () => Promise<readonly WindowsBluetoothDeviceRouteData[]>,
    readWindowsBluetoothBatteries: (instanceIds: readonly string[]) => Promise<readonly WindowsBluetoothBatteryData[]>,
    routeRegistry: BluetoothBatteryRouteRegistry,
): Promise<Record<string, MetricValue>> {
    const selectedRoutes = await resolveWindowsBluetoothSelectedRoutes(
        bluetoothMetricKeys,
        listWindowsBluetoothDevices,
        routeRegistry,
    );
    if (selectedRoutes.length === 0) {
        return {};
    }

    const batteryDataByInstanceId = new Map<string, WindowsBluetoothBatteryData>();
    for (const batteryData of await readWindowsBluetoothBatteries(selectedRoutes.map(route => route.instanceId))) {
        const instanceId = normalizeWindowsInstanceId(batteryData.instanceId);
        if (instanceId !== undefined) {
            batteryDataByInstanceId.set(instanceId, batteryData);
        }
    }

    const metrics: Record<string, MetricValue> = {};
    let missingBatteryCount = 0;
    for (const route of selectedRoutes) {
        const batteryData = batteryDataByInstanceId.get(route.instanceId);
        const batteryPercent = resolveBluetoothBatteryPercent(batteryData);
        if (batteryPercent === undefined) {
            missingBatteryCount += 1;
            continue;
        }

        metrics[route.metricKey] = buildScalarMetricValue(batteryPercent, {
            unit: MetricUnit.PERCENT,
        });
    }
    logWindowsBluetoothMetricSummary({
        requestedMetricCount: bluetoothMetricKeys.length,
        selectedRouteCount: selectedRoutes.length,
        emittedMetricCount: Object.keys(metrics).length,
        missingBatteryCount,
    });

    return metrics;
}

async function resolveWindowsBluetoothSelectedRoutes(
    bluetoothMetricKeys: readonly string[],
    listWindowsBluetoothDevices: () => Promise<readonly WindowsBluetoothDeviceRouteData[]>,
    routeRegistry: BluetoothBatteryRouteRegistry,
): Promise<readonly SelectedBluetoothBatteryRoute[]> {
    const requestedMetricKeys = new Set(bluetoothMetricKeys);
    const selectedRoutes = readCachedWindowsBluetoothRoutes(bluetoothMetricKeys);

    if (selectedRoutes.length === requestedMetricKeys.size) {
        return selectedRoutes;
    }

    // The in-memory route cache is rebuilt from the cheap descriptor list when a
    // selected metric is first polled, after reload, or after Windows re-enumerates
    // Bluetooth devices.
    const devices = resolveWindowsBluetoothDescriptorDevices(await listWindowsBluetoothDevices());
    cacheBluetoothRoutes(devices);

    return resolveListedWindowsBluetoothRoutes(bluetoothMetricKeys, devices, routeRegistry);
}

function readCachedWindowsBluetoothRoutes(
    bluetoothMetricKeys: readonly string[],
): readonly SelectedBluetoothBatteryRoute[] {
    return bluetoothMetricKeys.flatMap(metricKey => {
        const route = bluetoothRouteByMetricKey.get(metricKey);
        return route === undefined ? [] : [{
            metricKey,
            instanceId: route.instanceId,
        }];
    });
}

function resolveListedWindowsBluetoothRoutes(
    bluetoothMetricKeys: readonly string[],
    devices: readonly BluetoothBatteryDescriptorDevice[],
    routeRegistry: BluetoothBatteryRouteRegistry,
): readonly SelectedBluetoothBatteryRoute[] {
    return bluetoothMetricKeys.flatMap(metricKey => {
        const primaryRoute = bluetoothRouteByMetricKey.get(metricKey);
        if (primaryRoute !== undefined) {
            return [{
                metricKey,
                instanceId: primaryRoute.instanceId,
            }];
        }

        const fallbackRoute = resolveFallbackWindowsBluetoothRoute(routeRegistry.read(metricKey), devices);
        return fallbackRoute === undefined ? [] : [{
            metricKey,
            instanceId: fallbackRoute.instanceId,
        }];
    });
}

function resolveFallbackWindowsBluetoothRoute(
    definition: BluetoothBatteryRouteDefinition | undefined,
    devices: readonly BluetoothBatteryDescriptorDevice[],
): BluetoothBatteryRoute | undefined {
    const selectedEvidence = definition?.identity.evidence;
    if (selectedEvidence?.kind !== "bluetooth") {
        return undefined;
    }

    // Primary identifiers are exact platform routes, such as Windows PnP
    // InstanceIds. Fallback identifiers are more durable device identity signals,
    // such as a Bluetooth address parsed from BTHLE\DEV_*. Either match is enough
    // to recover a selected device after OS re-enumeration.
    return devices.find(device => {
        if (device.route === undefined) {
            return false;
        }

        const deviceEvidence = device.descriptor.identity?.evidence;
        if (deviceEvidence?.kind !== "bluetooth") {
            return false;
        }

        return isBluetoothIdentifierMatch(selectedEvidence.primaryIdentifier, deviceEvidence.primaryIdentifier)
            || isBluetoothIdentifierMatch(selectedEvidence.fallbackIdentifier, deviceEvidence.fallbackIdentifier);
    })?.route;
}

function isBluetoothIdentifierMatch(
    left: ResolvedSystemBluetoothPeripheralIdentifier | undefined,
    right: ResolvedSystemBluetoothPeripheralIdentifier | undefined,
): boolean {
    return left !== undefined
        && right !== undefined
        && left.kind === right.kind
        && left.hash === right.hash;
}

function buildSystemInformationBluetoothBatteryMetrics(
    bluetoothDevices: readonly Systeminformation.BluetoothDeviceData[],
    requestedMetricKeys: readonly string[],
): Record<string, MetricValue> {
    const requestedMetricKeySet = new Set(requestedMetricKeys.filter(isBluetoothBatteryMetricKey));
    if (requestedMetricKeySet.size === 0) {
        return {};
    }

    const metrics: Record<string, MetricValue> = {};
    for (const device of resolveSystemInformationBluetoothDescriptorDevices(bluetoothDevices)) {
        const batteryPercent = device.batteryPercent;
        const metricKey = device.descriptor.metricKey;
        if (batteryPercent === undefined || !requestedMetricKeySet.has(metricKey)) {
            continue;
        }

        metrics[metricKey] = buildScalarMetricValue(batteryPercent, {
            unit: MetricUnit.PERCENT,
        });
    }

    return metrics;
}

function resolveWindowsBluetoothDescriptorDevices(
    bluetoothDevices: readonly WindowsBluetoothDeviceRouteData[],
): readonly BluetoothBatteryDescriptorDevice[] {
    return bluetoothDevices.flatMap(bluetoothDevice => {
        const instanceId = normalizeWindowsInstanceId(bluetoothDevice.instanceId);
        if (instanceId === undefined) {
            return [];
        }

        // Windows selected polling uses InstanceId as the exact query route.
        // It is fast and precise, but it can change after re-pairing or
        // re-enumeration, so a parsed Bluetooth address is stored as fallback
        // evidence when available.
        const primaryIdentifier = buildBluetoothIdentifier("platformInstanceId", instanceId);
        const fallbackIdentifier = resolveWindowsBluetoothFallbackIdentifier(bluetoothDevice);
        const descriptorId = buildBluetoothBatteryDescriptorIdFromPrimaryIdentifierHash(primaryIdentifier.hash);
        const metricKey = buildBluetoothBatteryPercentMetricKey(descriptorId);
        const displayName = resolveBluetoothBatteryDisplayName(bluetoothDevice);
        const identity = buildBluetoothPeripheralIdentity({
            primaryIdentifier,
            fallbackIdentifier,
        });

        return [{
            route: { descriptorId, metricKey, instanceId },
            batteryPercent: undefined,
            descriptor: {
                descriptorId,
                displayName,
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
                    batteryPercentSources: [],
                    batteryVoltageMillivolts: [],
                },
            },
        }];
    });
}

function resolveSystemInformationBluetoothDescriptorDevices(
    bluetoothDevices: readonly Systeminformation.BluetoothDeviceData[],
): readonly BluetoothBatteryDescriptorDevice[] {
    return bluetoothDevices.flatMap(bluetoothDevice => {
        const bluetoothAddress = normalizeBluetoothDeviceAddress(bluetoothDevice.macDevice);
        if (bluetoothAddress === undefined) {
            return [];
        }

        // systeminformation exposes Bluetooth address and battery together on
        // non-Windows platforms. There is no separate selected-route query path,
        // so the address hash is both the descriptor id seed and the metric key seed.
        const primaryIdentifier = buildBluetoothIdentifier("bluetoothDeviceAddress", bluetoothAddress);
        const descriptorId = buildBluetoothBatteryDescriptorIdFromPrimaryIdentifierHash(primaryIdentifier.hash);
        const metricKey = buildBluetoothBatteryPercentMetricKey(descriptorId);
        const batteryPercent = resolveBluetoothBatteryPercent(bluetoothDevice);
        const displayName = resolveBluetoothBatteryDisplayName(bluetoothDevice);
        const identity = buildBluetoothPeripheralIdentity({
            primaryIdentifier,
            fallbackIdentifier: undefined,
        });

        return [{
            route: undefined,
            batteryPercent,
            descriptor: {
                descriptorId,
                displayName,
                metricKey,
                transport: "bluetooth",
                receiverKind: undefined,
                isExperimental: false,
                identity,
                supportState: batteryPercent === undefined ? "offline" : "supported",
                diagnostics: {
                    candidateIds: [`bluetooth:${descriptorId}`],
                    sourcePathIds: [],
                    receiverSlots: [],
                    easySwitchSlots: [],
                    batteryPercentSources: batteryPercent === undefined ? [] : ["reported"],
                    batteryVoltageMillivolts: [],
                },
            },
        }];
    });
}

function cacheBluetoothRoutes(devices: readonly BluetoothBatteryDescriptorDevice[]): void {
    // Cache by opaque metric key, not by descriptor id or raw platform route.
    // Consumers should not parse metric keys to recover Bluetooth identities.
    for (const device of devices) {
        if (device.route !== undefined) {
            bluetoothRouteByMetricKey.set(device.route.metricKey, device.route);
        }
    }
}

function resolveWindowsBluetoothFallbackIdentifier(
    bluetoothDevice: WindowsBluetoothDeviceRouteData,
): ResolvedSystemBluetoothPeripheralIdentifier | undefined {
    // Keep the PI list path to Get-PnpDevice only. Batch Get-PnpDeviceProperty can
    // return Bluetooth properties under the wrong InstanceId, while per-device
    // property reads took about 4-5s for 7 devices on the test machine. The BTHLE
    // InstanceId already carries the device address, which is good enough for
    // fallback rebinding without making the PI list slow.
    // AEP is modeled because Windows can expose it as a durable paired-device
    // identity, but the cheap descriptor-list path intentionally does not read
    // PnP properties. Today this branch is only used by injected tests or a
    // future producer that can provide AEP without slowing PI discovery.
    const aepAddress = normalizeBluetoothDeviceAddress(bluetoothDevice.aepAddress);
    if (aepAddress !== undefined) {
        return buildBluetoothIdentifier("windowsAepAddress", aepAddress);
    }

    const bluetoothAddress = normalizeBluetoothDeviceAddress(bluetoothDevice.bluetoothAddress)
        ?? parseBluetoothAddressFromWindowsInstanceId(bluetoothDevice.instanceId);
    return bluetoothAddress === undefined
        ? undefined
        : buildBluetoothIdentifier("bluetoothDeviceAddress", bluetoothAddress);
}

function buildBluetoothPeripheralIdentity(options: {
    readonly primaryIdentifier: ResolvedSystemBluetoothPeripheralIdentifier;
    readonly fallbackIdentifier: ResolvedSystemBluetoothPeripheralIdentifier | undefined;
}): ResolvedSystemPeripheralIdentity {
    return {
        evidence: {
            kind: "bluetooth",
            primaryIdentifier: options.primaryIdentifier,
            fallbackIdentifier: options.fallbackIdentifier,
        },
    };
}

function resolveBluetoothBatteryDisplayName(
    bluetoothDevice: WindowsBluetoothDeviceRouteData | Systeminformation.BluetoothDeviceData,
): string {
    return normalizeUnknownText(bluetoothDevice.name)
        ?? normalizeNonEmptyText("device" in bluetoothDevice ? bluetoothDevice.device : undefined)
        ?? "Bluetooth device";
}

function normalizeWindowsInstanceId(value: unknown): string | undefined {
    const instanceId = normalizeUnknownText(value);
    return instanceId === undefined ? undefined : instanceId.toUpperCase();
}

function parseBluetoothAddressFromWindowsInstanceId(value: unknown): string | undefined {
    const instanceId = normalizeWindowsInstanceId(value);
    const match = instanceId?.match(/^BTHLE\\DEV_([0-9A-F]{12})\\/u);
    return match?.[1] === undefined ? undefined : normalizeBluetoothDeviceAddress(match[1]);
}

function resolveBluetoothBatteryPercent(value: unknown): number | undefined {
    const rawBatteryPercent = typeof value === "object" && value !== null && "batteryPercent" in value
        ? (value as { readonly batteryPercent?: unknown }).batteryPercent
        : value;
    return resolveBluetoothBatteryPercentValue(rawBatteryPercent);
}

function logWindowsBluetoothMetricSummary(options: {
    readonly requestedMetricCount: number;
    readonly selectedRouteCount: number;
    readonly emittedMetricCount: number;
    readonly missingBatteryCount: number;
}): void {
    log.atInfo()
        .everyMs("windows-bluetooth-metrics", BLUETOOTH_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "windowsBluetoothMetricSummary",
            `requested=${options.requestedMetricCount}`,
            `selectedRoutes=${options.selectedRouteCount}`,
            `emitted=${options.emittedMetricCount}`,
            `missingBattery=${options.missingBatteryCount}`,
        ].join(" "));
}

function logBluetoothBatteryFailure(operation: string, error: unknown): void {
    const message = `Bluetooth battery ${operation} failed: ${String(error)}`;
    if (error instanceof Error) {
        log.atWarn()
            .withCause(error)
            .everyMs(`bluetooth-battery:${operation}`, BLUETOOTH_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS)
            .log(message);
        return;
    }

    log.atWarn()
        .everyMs(`bluetooth-battery:${operation}`, BLUETOOTH_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS)
        .log(message);
}

async function listWindowsBluetoothDevicesFromPowerShell(): Promise<readonly WindowsBluetoothDeviceRouteData[]> {
    const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        buildWindowsBluetoothDeviceListPowerShellCommand(),
    ], {
        windowsHide: true,
        timeout: WINDOWS_BLUETOOTH_DEVICE_LIST_TIMEOUT_MILLISECONDS,
        maxBuffer: 1024 * 1024,
    });

    return parseWindowsBluetoothJson(stdout).filter(isWindowsBluetoothDeviceRouteData);
}

async function readWindowsBluetoothBatteriesFromPowerShell(
    instanceIds: readonly string[],
): Promise<readonly WindowsBluetoothBatteryData[]> {
    if (instanceIds.length === 0) {
        return [];
    }

    const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        buildWindowsBluetoothBatteryPowerShellCommand(instanceIds),
    ], {
        windowsHide: true,
        timeout: WINDOWS_BLUETOOTH_BATTERY_READ_TIMEOUT_MILLISECONDS,
        maxBuffer: 1024 * 1024,
    });

    return parseWindowsBluetoothJson(stdout).filter(isWindowsBluetoothBatteryData);
}

function buildWindowsBluetoothDeviceListPowerShellCommand(): string {
    return `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# Keep the descriptor list cheap: do not call Get-PnpDeviceProperty here.
# Some Bluetooth drivers expose stale cached battery values, and per-device
# property reads made the PI device list take seconds on the test machine.
Get-PnpDevice -Class Bluetooth |
  Where-Object { $_.InstanceId -like 'BTHLE\\DEV_*' -and $_.Status -eq 'OK' } |
  ForEach-Object {
  [pscustomobject]@{
    name = $_.FriendlyName
    manufacturer = $null
    instanceId = $_.InstanceId
    bluetoothAddress = $null
    aepAddress = $null
    connected = $_.Status -eq 'OK'
  }
} | ConvertTo-Json -Depth 4
`.trim();
}

function buildWindowsBluetoothBatteryPowerShellCommand(instanceIds: readonly string[]): string {
    return `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$batteryPropertyKey = '${WINDOWS_BLUETOOTH_BATTERY_PERCENT_PROPERTY_KEY}'
$instanceIds = @(${instanceIds.map(toPowerShellSingleQuotedString).join(", ")})

$instanceIds | ForEach-Object {
  # Windows can return cached Bluetooth battery values for devices that are no
  # longer connected. We still emit valid battery values here because
  # LastConnectedTime is not reliable enough across drivers to silently filter
  # user-visible data in the source layer.
  $properties = @(Get-PnpDeviceProperty -InstanceId $_ -KeyName @($batteryPropertyKey))
  $propertyByKey = @{}
  foreach ($property in $properties) {
    $propertyByKey[$property.KeyName] = $property.Data
  }

  [pscustomobject]@{
    instanceId = $_
    batteryPercent = $propertyByKey[$batteryPropertyKey]
  }
} | ConvertTo-Json -Depth 4
`.trim();
}

function parseWindowsBluetoothJson(stdout: string): readonly unknown[] {
    const trimmedStdout = stdout.trim();
    if (trimmedStdout.length === 0) {
        return [];
    }

    const parsedJson: unknown = JSON.parse(trimmedStdout);
    return Array.isArray(parsedJson) ? parsedJson : [parsedJson];
}

function isWindowsBluetoothDeviceRouteData(value: unknown): value is WindowsBluetoothDeviceRouteData {
    return typeof value === "object" && value !== null;
}

function isWindowsBluetoothBatteryData(value: unknown): value is WindowsBluetoothBatteryData {
    return typeof value === "object" && value !== null;
}

function normalizeUnknownText(value: unknown): string | undefined {
    return typeof value === "string" ? normalizeNonEmptyText(value) : undefined;
}

function toPowerShellSingleQuotedString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}
