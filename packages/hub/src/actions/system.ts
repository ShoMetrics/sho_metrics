import { action, PropertyInspectorDidAppearEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import {
    SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
    type BatteryDeviceDescriptor,
} from "../runtime/sources/battery/battery-device-descriptor";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { readVendorHidBatteryDeviceDescriptorSnapshot } from "../runtime/sources/battery/vendor-hid-battery-source-client";
import { vendorHidBatteryRouteRegistry } from "../runtime/sources/battery/vendor-hid-battery-route-registry";
import { readBluetoothBatteryDeviceDescriptors } from "../runtime/sources/node-system/node-system-bluetooth-battery";
import { bluetoothBatteryRouteRegistry } from "../runtime/sources/node-system/node-system-bluetooth-battery-route-registry";
import { shouldEnableVendorHidBatterySupport } from "../runtime/source-capabilities/vendor-hid-battery-platform-capabilities";
import { setMetricView } from "../view-updates/runner";
import { logger } from "../logging/logger";
import { monotonicNowMilliseconds } from "../shared/clock";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import type {
    ResolvedSystemBluetoothPeripheralIdentifier,
    ResolvedSystemPeripheralIdentity,
    ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import {
    buildSystemViewOptions,
    resolveSystemMetricKeys,
} from "./system/view-builder";

const log = logger.for("Action:System");
const SYSTEM_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 30_000;

/** System action for built-in and supported peripheral battery readings. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.system })
export class System extends MetricAction {
    protected readonly actionKind = "system";
    private readonly registeredVendorHidMetricKeysByActionId = new Map<string, ReadonlySet<string>>();
    private readonly registeredBluetoothMetricKeysByActionId = new Map<string, ReadonlySet<string>>();

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "system");

        return resolveSystemMetricKeys(target);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "system");

        setMetricView(buildSystemViewOptions({
            event,
            settings,
            target,
            metrics: this.getMetricReader(event),
        }));
    }

    protected override onResolvedSettingsChanged(event: WillAppearEvent, settings: ResolvedWidgetSettings): void {
        const target = readResolvedMetricTarget(settings, "system");
        const selectedIdentity = target.reading.peripheralIdentity;
        const metricKeys = resolveSystemMetricKeys(target);
        const previousVendorHidMetricKeys = this.registeredVendorHidMetricKeysByActionId.get(event.action.id)
            ?? new Set<string>();
        const nextVendorHidMetricKeys = selectedIdentity === undefined || selectedIdentity.bindingTransport === "bluetooth"
            ? new Set<string>()
            : new Set(metricKeys);
        const previousBluetoothMetricKeys = this.registeredBluetoothMetricKeysByActionId.get(event.action.id)
            ?? new Set<string>();
        const nextBluetoothMetricKeys = selectedIdentity?.evidence?.kind === "bluetooth"
            ? new Set(metricKeys)
            : new Set<string>();

        // Project the persisted user-selected peripheral identity into the vendor HID
        // source's in-memory route registry. This mirrors the custom HTTP definition
        // registry pattern: the source receives per-metric settings-derived facts
        // without reading settings or changing the generic source polling contract.
        for (const metricKey of previousVendorHidMetricKeys) {
            if (!nextVendorHidMetricKeys.has(metricKey)) {
                vendorHidBatteryRouteRegistry.unregister(metricKey, event.action.id);
            }
        }

        if (selectedIdentity !== undefined) {
            for (const metricKey of nextVendorHidMetricKeys) {
                vendorHidBatteryRouteRegistry.register({
                    metricKey,
                    identity: selectedIdentity,
                    ownerId: event.action.id,
                });
            }
        }

        for (const metricKey of previousBluetoothMetricKeys) {
            if (!nextBluetoothMetricKeys.has(metricKey)) {
                bluetoothBatteryRouteRegistry.unregister(metricKey, event.action.id);
            }
        }

        if (selectedIdentity !== undefined) {
            for (const metricKey of nextBluetoothMetricKeys) {
                bluetoothBatteryRouteRegistry.register({
                    metricKey,
                    identity: selectedIdentity,
                    ownerId: event.action.id,
                });
            }
        }

        if (nextVendorHidMetricKeys.size === 0) {
            this.registeredVendorHidMetricKeysByActionId.delete(event.action.id);
        } else {
            this.registeredVendorHidMetricKeysByActionId.set(event.action.id, nextVendorHidMetricKeys);
        }

        if (nextBluetoothMetricKeys.size === 0) {
            this.registeredBluetoothMetricKeysByActionId.delete(event.action.id);
        } else {
            this.registeredBluetoothMetricKeysByActionId.set(event.action.id, nextBluetoothMetricKeys);
        }
    }

    protected override onActionWillDisappear(event: WillDisappearEvent): void {
        const vendorHidMetricKeys = this.registeredVendorHidMetricKeysByActionId.get(event.action.id);
        if (vendorHidMetricKeys !== undefined) {
            for (const metricKey of vendorHidMetricKeys) {
                vendorHidBatteryRouteRegistry.unregister(metricKey, event.action.id);
            }
            this.registeredVendorHidMetricKeysByActionId.delete(event.action.id);
        }

        const bluetoothMetricKeys = this.registeredBluetoothMetricKeysByActionId.get(event.action.id);
        if (bluetoothMetricKeys !== undefined) {
            for (const metricKey of bluetoothMetricKeys) {
                bluetoothBatteryRouteRegistry.unregister(metricKey, event.action.id);
            }
            this.registeredBluetoothMetricKeysByActionId.delete(event.action.id);
        }
    }

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        this.refreshBatteryDevicesForPropertyInspector(event).catch(error => {
            log.error(() => `Failed to publish battery devices: ${String(error)}`);
        });
    }

    protected override sendRuntimeCachePatchToPropertyInspector(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        patch: WidgetRuntimeCachePatch,
    ): Promise<void> {
        const target = readResolvedMetricTarget(this.resolveSettings(event), "system");
        const selectedIdentity = target.reading.peripheralIdentity;
        const publishPatch = resolveBatteryDeviceCachePatchForPropertyInspector(patch, selectedIdentity);

        return super.sendRuntimeCachePatchToPropertyInspector(event, publishPatch);
    }

    protected async refreshBatteryDevicesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        const isVendorHidBatterySupported = shouldEnableVendorHidBatterySupport(this.currentPlatform());
        const [bluetoothBatteryDevices, vendorBatteryDeviceSnapshot] = await Promise.all([
            readBluetoothBatteryDeviceDescriptors(),
            readVendorHidBatteryDeviceDescriptorSnapshot({
                isExperimentalVendorHidEnabled: isVendorHidBatterySupported
                    && this.resolveGlobalVendorHidBatteryEnabled(),
            }),
        ]);
        const vendorBatteryDevices = vendorBatteryDeviceSnapshot.descriptors;
        const availableBatteryDevices = [
            SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
            ...bluetoothBatteryDevices,
            ...vendorBatteryDevices,
        ];
        const target = readResolvedMetricTarget(this.resolveSettings(event), "system");
        const selectedIdentity = target.reading.peripheralIdentity;

        log.atInfo()
            .everyMs("system-battery-device-cache-refresh", SYSTEM_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "systemBatteryDeviceCacheRefresh",
                `actionId=${event.action.id}`,
                `deviceCount=${availableBatteryDevices.length}`,
                `bluetoothDeviceCount=${bluetoothBatteryDevices.length}`,
                `vendorDeviceCount=${vendorBatteryDevices.length}`,
                `descriptorStates=${formatBatteryDescriptorStates(availableBatteryDevices)}`,
                `selected=${formatBatterySelectionKindForLog(selectedIdentity)}`,
                `selectedMatched=${selectedIdentity === undefined
                    ? "system"
                    : String(availableBatteryDevices.some(device =>
                        device.identity !== undefined
                        && arePeripheralIdentitiesEqual(device.identity, selectedIdentity),
                    ))}`,
                `durationMs=${monotonicNowMilliseconds() - startedAtMonotonicMilliseconds}`,
            ].join(" "));

        await this.updateRuntimeCache(event, {
            availableBatteryDevices,
            batteryDeviceDiscoveryDiagnostics: vendorBatteryDeviceSnapshot.diagnostics,
        });
    }

    private resolveGlobalVendorHidBatteryEnabled(): boolean {
        return pluginGlobalSettingsStore.getResolved().system.experimentalVendorHidBatteryEnabled;
    }
}

function formatBatteryDescriptorStates(descriptors: readonly BatteryDeviceDescriptor[]): string {
    const counts = new Map<string, number>();
    for (const descriptor of descriptors) {
        counts.set(descriptor.supportState, (counts.get(descriptor.supportState) ?? 0) + 1);
    }

    return [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([state, count]) => `${state}:${count}`)
        .join(",") || "none";
}

function formatBatterySelectionKindForLog(identity: ResolvedSystemPeripheralIdentity | undefined): string {
    if (identity === undefined) {
        return "system";
    }

    return identity.evidence?.kind === "bluetooth"
        ? "bluetooth"
        : `vendorHid:${identity.bindingTransport ?? "unknown"}`;
}

function arePeripheralIdentitiesEqual(
    left: ResolvedSystemPeripheralIdentity,
    right: ResolvedSystemPeripheralIdentity,
): boolean {
    return left.vendorId === right.vendorId
        && left.productId === right.productId
        && left.manufacturer === right.manufacturer
        && left.productName === right.productName
        && left.serialNumber === right.serialNumber
        && left.interfaceNumber === right.interfaceNumber
        && left.usagePage === right.usagePage
        && left.usageId === right.usageId
        && left.bindingTransport === right.bindingTransport
        && left.receiverKind === right.receiverKind
        && left.vendorUnitId === right.vendorUnitId
        && left.modelId === right.modelId
        && left.receiverSlot === right.receiverSlot
        && arePeripheralIdentityEvidenceEqual(left, right);
}

function arePeripheralIdentityEvidenceEqual(
    left: ResolvedSystemPeripheralIdentity,
    right: ResolvedSystemPeripheralIdentity,
): boolean {
    if (left.evidence?.kind !== right.evidence?.kind) {
        return false;
    }

    switch (left.evidence?.kind) {
        case "bluetooth":
            return areBluetoothIdentifiersEqual(
                left.evidence.primaryIdentifier,
                right.evidence?.kind === "bluetooth" ? right.evidence.primaryIdentifier : undefined,
            ) && areBluetoothIdentifiersEqual(
                left.evidence.fallbackIdentifier,
                right.evidence?.kind === "bluetooth" ? right.evidence.fallbackIdentifier : undefined,
            );
        case undefined:
            return true;
    }
}

function areBluetoothIdentifiersEqual(
    left: ResolvedSystemBluetoothPeripheralIdentifier | undefined,
    right: ResolvedSystemBluetoothPeripheralIdentifier | undefined,
): boolean {
    return left?.kind === right?.kind && left?.hash === right?.hash;
}

export function resolveBatteryDeviceCachePatchForPropertyInspector(
    patch: WidgetRuntimeCachePatch,
    selectedIdentity: ResolvedSystemPeripheralIdentity | undefined,
): WidgetRuntimeCachePatch {
    return shouldSuppressInitialEmptyBatteryDeviceCachePatch(patch, selectedIdentity)
        ? omitBatteryDeviceListPatch(patch)
        : patch;
}

function shouldSuppressInitialEmptyBatteryDeviceCachePatch(
    patch: WidgetRuntimeCachePatch,
    selectedIdentity: ResolvedSystemPeripheralIdentity | undefined,
): boolean {
    return selectedIdentity !== undefined
        && "availableBatteryDevices" in patch
        && (patch.availableBatteryDevices?.length ?? 0) === 0
        && patch.batteryDeviceDiscoveryDiagnostics === undefined;
}

function omitBatteryDeviceListPatch(patch: WidgetRuntimeCachePatch): WidgetRuntimeCachePatch {
    const {
        availableBatteryDevices,
        batteryDeviceDiscoveryDiagnostics,
        ...restPatch
    } = patch;

    void availableBatteryDevices;
    void batteryDeviceDiscoveryDiagnostics;
    return restPatch;
}
