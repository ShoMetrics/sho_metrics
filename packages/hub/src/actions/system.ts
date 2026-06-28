import {
    action,
    PropertyInspectorDidAppearEvent,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import {
    type BatteryDeviceDescriptor,
} from "../runtime/sources/battery/battery-device-descriptor";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { shouldEnableVendorHidBatterySupport } from "../runtime/source-capabilities/vendor-hid-battery-platform-capabilities";
import { buildBatteryMetricKeyFromIdentity } from "../runtime/sources/battery/battery-metric-key";
import { areBatteryPeripheralIdentitiesEquivalentForSelection } from "../runtime/sources/battery/battery-peripheral-identity-comparison";
import { readBatteryDeviceDescriptorSnapshotForPropertyInspector } from "../runtime/sources/battery/battery-device-descriptor-snapshot";
import { resolveBatteryDeviceCachePatchForPropertyInspector } from "../runtime/sources/battery/battery-device-cache-patch";
import { SelectedBatteryRouteRegistrar } from "../runtime/sources/battery/selected-battery-route-registrar";
import { setMetricView } from "../view-updates/runner";
import { logger } from "../logging/logger";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import type {
    ResolvedSystemMetricTarget,
    ResolvedSystemPeripheralIdentity,
    ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../settings/resolved-settings";
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
    private readonly selectedBatteryRouteRegistrar = new SelectedBatteryRouteRegistrar();

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "system");

        return resolveSystemMetricKeys(target);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "system");

        setMetricView(this.withManualRefreshIndicator(event, buildSystemViewOptions({
            event,
            settings,
            target,
            metrics: this.getMetricReader(event),
        })));
    }

    protected override onResolvedSettingsChanged(event: WillAppearEvent, settings: ResolvedWidgetSettings): void {
        const target = readResolvedMetricTarget(settings, "system");
        this.selectedBatteryRouteRegistrar.sync(event.action.id, readSelectedSystemPeripheralRoutes(target));
    }

    protected override onActionWillDisappear(event: WillDisappearEvent): void {
        this.selectedBatteryRouteRegistrar.clear(event.action.id);
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
        const isVendorHidBatterySupported = shouldEnableVendorHidBatterySupport(this.currentPlatform());
        const batteryDeviceSnapshot = await readBatteryDeviceDescriptorSnapshotForPropertyInspector({
            isExperimentalVendorHidEnabled: isVendorHidBatterySupported
                && this.resolveGlobalVendorHidBatteryEnabled(),
        });
        const availableBatteryDevices = batteryDeviceSnapshot.availableBatteryDevices;
        const target = readResolvedMetricTarget(this.resolveSettings(event), "system");
        const selectedIdentity = target.reading.peripheralIdentity;
        logBatterySelectionMatchDiagnostic(event.action.id, availableBatteryDevices, selectedIdentity);

        log.atInfo()
            .everyMs("system-battery-device-cache-refresh", SYSTEM_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "systemBatteryDeviceCacheRefresh",
                `actionId=${event.action.id}`,
                `deviceCount=${availableBatteryDevices.length}`,
                `bluetoothDeviceCount=${batteryDeviceSnapshot.bluetoothBatteryDevices.length}`,
                `vendorDeviceCount=${batteryDeviceSnapshot.vendorBatteryDevices.length}`,
                `bluetoothMs=${batteryDeviceSnapshot.bluetoothDurationMilliseconds}`,
                `vendorMs=${batteryDeviceSnapshot.vendorDurationMilliseconds}`,
                `cacheState=${batteryDeviceSnapshot.cacheState}`,
                `descriptorStates=${formatBatteryDescriptorStates(availableBatteryDevices)}`,
                `selected=${formatBatterySelectionKindForLog(selectedIdentity)}`,
                `selectedMatched=${selectedIdentity === undefined
                    ? "system"
                    : String(availableBatteryDevices.some(device =>
                        device.identity !== undefined
                        && areBatteryPeripheralIdentitiesEquivalentForSelection(device.identity, selectedIdentity),
                    ))}`,
                `durationMs=${batteryDeviceSnapshot.durationMilliseconds}`,
            ].join(" "));

        await this.updateRuntimeCache(event, {
            availableBatteryDevices,
            batteryDeviceDiscoveryDiagnostics: batteryDeviceSnapshot.batteryDeviceDiscoveryDiagnostics,
        });
    }

    private resolveGlobalVendorHidBatteryEnabled(): boolean {
        return pluginGlobalSettingsStore.getResolved().system.experimentalVendorHidBatteryEnabled;
    }
}

function readSelectedSystemPeripheralRoutes(target: ResolvedSystemMetricTarget): readonly {
    readonly metricKey: string;
    readonly identity: ResolvedSystemPeripheralIdentity;
}[] {
    const selectedIdentity = target.reading.peripheralIdentity;
    return selectedIdentity === undefined
        ? []
        : resolveSystemMetricKeys(target).map(metricKey => ({ metricKey, identity: selectedIdentity }));
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

function logBatterySelectionMatchDiagnostic(
    actionId: string,
    availableBatteryDevices: readonly BatteryDeviceDescriptor[],
    selectedIdentity: ResolvedSystemPeripheralIdentity | undefined,
): void {
    if (selectedIdentity === undefined) {
        return;
    }

    const selectedMetricKey = buildSelectionMetricKeyForDiagnostic(selectedIdentity);
    const identityMatched = availableBatteryDevices.some(device =>
        device.identity !== undefined
        && areBatteryPeripheralIdentitiesEquivalentForSelection(device.identity, selectedIdentity));
    if (identityMatched) {
        return;
    }

    log.atDebug().log(() => [
        "systemBatterySelectedDeviceMismatch",
        `actionId=${actionId}`,
        `selected=${formatBatterySelectionKindForLog(selectedIdentity)}`,
        `selectedMetricKey=${selectedMetricKey ?? "unknown"}`,
        `metricKeyMatched=${selectedMetricKey === undefined
            ? "unknown"
            : String(availableBatteryDevices.some(device => device.metricKey === selectedMetricKey))}`,
        `descriptorMetricKeys=${availableBatteryDevices.map(device => device.metricKey).join("|")}`,
    ].join(" "));
}

function buildSelectionMetricKeyForDiagnostic(
    selectedIdentity: ResolvedSystemPeripheralIdentity,
): string | undefined {
    switch (selectedIdentity.evidence.kind) {
        case "vendorHid":
            return buildBatteryMetricKeyFromIdentity(selectedIdentity);
        case "bluetooth":
            return undefined;
    }
}

function formatBatterySelectionKindForLog(identity: ResolvedSystemPeripheralIdentity | undefined): string {
    if (identity === undefined) {
        return "system";
    }

    const vendorHidIdentity = readSystemVendorHidPeripheralIdentity(identity);
    return identity.evidence.kind === "bluetooth"
        ? "bluetooth"
        : `vendorHid:${vendorHidIdentity?.bindingTransport ?? "unknown"}`;
}
