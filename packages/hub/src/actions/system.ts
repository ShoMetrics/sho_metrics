import { action, PropertyInspectorDidAppearEvent, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import {
    SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
    type BatteryDeviceDescriptor,
} from "../runtime/sources/battery/battery-device-descriptor";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { readVendorHidBatteryDeviceDescriptorSnapshot } from "../runtime/sources/battery/vendor-hid-battery-source-client";
import { setMetricView } from "../view-updates/runner";
import { logger } from "../logging/logger";
import { monotonicNowMilliseconds } from "../shared/clock";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import type { ResolvedSystemPeripheralIdentity } from "../settings/resolved-settings";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import {
    buildSystemViewOptions,
    resolveSystemMetricKeys,
} from "./system/view-builder";

const log = logger.for("Action:System");
const SYSTEM_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 5_000;

/** System action for built-in and supported peripheral battery readings. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.system })
export class System extends MetricAction {
    protected readonly actionKind = "system";

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

        if ("availableBatteryDevices" in publishPatch) {
            const batteryDevices = publishPatch.availableBatteryDevices ?? [];

            log.debug(() => [
                "systemBatteryDeviceCachePublish",
                `actionId=${event.action.id}`,
                `deviceCount=${batteryDevices.length}`,
                `descriptorStates=${formatBatteryDescriptorStates(batteryDevices)}`,
                `selected=${formatPeripheralIdentityForLog(selectedIdentity)}`,
                `selectedMatched=${selectedIdentity === undefined
                    ? "system"
                    : String(batteryDevices.some(device =>
                        device.identity !== undefined
                        && arePeripheralIdentitiesEqual(device.identity, selectedIdentity),
                    ))}`,
                `descriptorIds=${formatBatteryDescriptorIds(batteryDevices)}`,
            ].join(" "));
        }

        return super.sendRuntimeCachePatchToPropertyInspector(event, publishPatch);
    }

    protected async refreshBatteryDevicesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        const vendorBatteryDeviceSnapshot = await readVendorHidBatteryDeviceDescriptorSnapshot({
            isExperimentalVendorHidEnabled: this.resolveGlobalVendorHidBatteryEnabled(),
        });
        const vendorBatteryDevices = vendorBatteryDeviceSnapshot.descriptors;
        const target = readResolvedMetricTarget(this.resolveSettings(event), "system");
        const selectedIdentity = target.reading.peripheralIdentity;

        log.atInfo()
            .everyMs("system-battery-device-cache-refresh", SYSTEM_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "systemBatteryDeviceCacheRefresh",
                `actionId=${event.action.id}`,
                `vendorDeviceCount=${vendorBatteryDevices.length}`,
                `descriptorStates=${formatBatteryDescriptorStates(vendorBatteryDevices)}`,
                `selected=${formatPeripheralIdentityForLog(selectedIdentity)}`,
                `selectedMatched=${selectedIdentity === undefined
                    ? "system"
                    : String(vendorBatteryDevices.some(device =>
                        device.identity !== undefined
                        && arePeripheralIdentitiesEqual(device.identity, selectedIdentity),
                    ))}`,
                `descriptorIds=${formatBatteryDescriptorIds(vendorBatteryDevices)}`,
                `durationMs=${monotonicNowMilliseconds() - startedAtMonotonicMilliseconds}`,
            ].join(" "));

        await this.updateRuntimeCache(event, {
            availableBatteryDevices: [
                SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
                ...vendorBatteryDevices,
            ],
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

function formatBatteryDescriptorIds(descriptors: readonly BatteryDeviceDescriptor[]): string {
    return descriptors
        .map(descriptor => descriptor.descriptorId)
        .slice(0, 8)
        .join(",") || "none";
}

function formatPeripheralIdentityForLog(identity: ResolvedSystemPeripheralIdentity | undefined): string {
    if (identity === undefined) {
        return "system";
    }

    return [
        `vendor=${identity.vendorId ?? "unknown"}`,
        `product=${identity.productId ?? "unknown"}`,
        `transport=${identity.bindingTransport ?? "unknown"}`,
        `receiver=${identity.receiverKind ?? "unknown"}`,
        `model=${identity.modelId ?? "unknown"}`,
        `unit=${identity.vendorUnitId ?? "unknown"}`,
        `slot=${identity.receiverSlot ?? "unknown"}`,
    ].join("/");
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
        && left.receiverSlot === right.receiverSlot;
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
