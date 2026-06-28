import type {
    ResolvedMetricTarget,
    ResolvedSystemPeripheralIdentity,
} from "../../../settings/resolved-settings";
import type { WidgetRuntimeCachePatch } from "../../widget-runtime-cache";

/**
 * Reads a representative selected peripheral identity for battery cache suppression.
 *
 * Cache-patch suppression only needs to know whether the widget has at least
 * one selected peripheral. Action-specific route registrars still track every
 * selected battery row or slot independently.
 */
export function readBatteryCacheSuppressionIdentity(
    targets: readonly ResolvedMetricTarget[],
): ResolvedSystemPeripheralIdentity | undefined {
    for (const target of targets) {
        if (target.domain === "system" && target.reading.peripheralIdentity !== undefined) {
            return target.reading.peripheralIdentity;
        }
    }

    return undefined;
}

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
