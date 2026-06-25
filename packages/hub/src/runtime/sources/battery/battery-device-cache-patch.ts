import type { ResolvedSystemPeripheralIdentity } from "../../../settings/resolved-settings";
import type { WidgetRuntimeCachePatch } from "../../widget-runtime-cache";

/**
 * Keeps a selected peripheral visible while the PI battery device refresh is still pending.
 *
 * Actions can receive an initial empty runtime-cache patch before the async
 * battery descriptor refresh completes. Publishing that transient empty list
 * would briefly turn an already selected device into "Unavailable"; a completed
 * empty refresh still passes through with diagnostics so the UI can show the
 * real no-device state.
 */
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
