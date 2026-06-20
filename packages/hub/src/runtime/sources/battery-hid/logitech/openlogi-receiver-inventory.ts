/**
 * OpenLogi-isomorphic receiver inventory assembly.
 *
 * Source: OpenLogi
 * Files:
 * - `crates/openlogi-hid/src/inventory.rs`
 * - `crates/openlogi-hid/src/mappings.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 *
 * This file joins receiver-register facts with a device feature probe. It
 * deliberately stops before ShoMetrics descriptor/coalescing models.
 */

import type {
    OpenLogiDeviceCapabilities,
    OpenLogiDeviceKind,
    OpenLogiHidppBatteryInfo,
    OpenLogiHidppDeviceInformation,
    OpenLogiHidppProbedFeatures,
} from "./openlogi-hidpp-battery-reader";
import { LOGITECH_HIDPP_DIRECT_DEVICE_SLOT } from "./hidpp-protocol";
import {
    type OpenLogiReceiverDeviceConnection,
    type OpenLogiReceiverDeviceKind,
    type OpenLogiReceiverPairingInformation,
} from "./openlogi-hidpp-receiver-registers";
import {
    buildOpenLogiBoltCacheKey,
    buildOpenLogiDirectCacheKey,
    buildOpenLogiUnifyingCacheKey,
    resolveOpenLogiDeviceKind,
    settleOpenLogiDirectProbe,
} from "./openlogi-inventory-policy";

export interface OpenLogiReceiverPairedDevice {
    readonly receiverSlot: number;
    readonly codename?: string;
    readonly wirelessProductId?: number;
    readonly deviceKind: OpenLogiDeviceKind;
    readonly online: boolean;
    readonly battery?: OpenLogiHidppBatteryInfo;
    readonly deviceInformation?: OpenLogiHidppDeviceInformation;
    readonly capabilities?: OpenLogiDeviceCapabilities;
}

export interface OpenLogiBoltSlotAssembly {
    readonly pairedDevice: OpenLogiReceiverPairedDevice;
    readonly cacheKey?: string;
    readonly registerDeviceKind: OpenLogiDeviceKind;
}

export interface OpenLogiUnifyingSlotAssembly {
    readonly pairedDevice: OpenLogiReceiverPairedDevice;
    readonly cacheKey: string;
    readonly registerDeviceKind: OpenLogiDeviceKind;
}

export interface OpenLogiDirectDeviceAssembly {
    readonly inventory?: OpenLogiReceiverInventoryLike;
    readonly cacheKey: string;
    readonly healthy: boolean;
}

export interface OpenLogiReceiverInventoryLike {
    readonly receiver: {
        readonly name: string;
        readonly vendorId: number;
        readonly productId: number;
    };
    readonly pairedDevices: readonly OpenLogiReceiverPairedDevice[];
}

/**
 * Assembles one Bolt paired-device entry using OpenLogi's precedence rules.
 *
 * The arrival event is live data and overrides the pairing register for online
 * state, kind, and WPID. The pairing register still supplies the stable unit id.
 */
export function assembleOpenLogiBoltPairedDevice(input: {
    readonly receiverSlot: number;
    readonly pairingInformation: OpenLogiReceiverPairingInformation;
    readonly arrivalEvent?: OpenLogiReceiverDeviceConnection;
    readonly codename?: string;
    readonly probe: OpenLogiHidppProbedFeatures;
}): OpenLogiBoltSlotAssembly {
    const event = input.arrivalEvent;
    const registerKind = mapOpenLogiReceiverKindToDeviceKind(
        event?.deviceKind ?? input.pairingInformation.deviceKind,
    );
    return {
        pairedDevice: {
            receiverSlot: input.receiverSlot,
            ...optionalStringField("codename", input.codename),
            ...optionalNumberField("wirelessProductId", event?.wirelessProductId),
            deviceKind: resolveOpenLogiDeviceKind({
                probedDeviceKind: input.probe.deviceKind,
                registerDeviceKind: registerKind,
            }),
            online: event?.online ?? input.pairingInformation.online,
            ...probeFields(input.probe),
        },
        ...optionalStringField("cacheKey", buildOpenLogiBoltCacheKey(input.pairingInformation.unitId)),
        registerDeviceKind: registerKind,
    };
}

/**
 * Assembles one Unifying paired-device entry from a live arrival event.
 *
 * OpenLogi does not poll offline Unifying slots in this path; the receiver uid
 * plus slot is the cache identity for online event-backed entries.
 */
export function assembleOpenLogiUnifyingPairedDevice(input: {
    readonly receiverUid: string;
    readonly arrivalEvent: OpenLogiReceiverDeviceConnection;
    readonly codename?: string;
    readonly probe: OpenLogiHidppProbedFeatures;
}): OpenLogiUnifyingSlotAssembly {
    const registerKind = mapOpenLogiReceiverKindToDeviceKind(input.arrivalEvent.deviceKind);
    return {
        pairedDevice: {
            receiverSlot: input.arrivalEvent.receiverSlot,
            ...optionalStringField("codename", input.codename),
            wirelessProductId: input.arrivalEvent.wirelessProductId,
            deviceKind: resolveOpenLogiDeviceKind({
                probedDeviceKind: input.probe.deviceKind,
                registerDeviceKind: registerKind,
            }),
            online: input.arrivalEvent.online,
            ...probeFields(input.probe),
        },
        cacheKey: buildOpenLogiUnifyingCacheKey({
            receiverUid: input.receiverUid,
            receiverSlot: input.arrivalEvent.receiverSlot,
        }),
        registerDeviceKind: registerKind,
    };
}

/**
 * Assembles OpenLogi's direct-device inventory for Bluetooth, USB-C, or wired nodes.
 *
 * Direct nodes are addressed at HID++ index `0xff`. A completed feature walk
 * with no battery and no configuration feature is a healthy non-peripheral,
 * matching OpenLogi's Bolt secondary-interface filter.
 */
export function assembleOpenLogiDirectDevice(input: {
    readonly nodeId: string;
    readonly name: string;
    readonly vendorId: number;
    readonly productId: number;
    readonly probe: OpenLogiHidppProbedFeatures;
}): OpenLogiDirectDeviceAssembly {
    const cacheKey = buildOpenLogiDirectCacheKey(input.nodeId);
    const settledProbe = settleOpenLogiDirectProbe(input.probe);
    if (!settledProbe.isPeripheral) {
        return {
            cacheKey,
            healthy: settledProbe.healthy,
        };
    }

    return {
        cacheKey,
        healthy: true,
        inventory: {
            receiver: {
                name: input.name,
                vendorId: input.vendorId,
                productId: input.productId,
            },
            pairedDevices: [{
                receiverSlot: LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
                codename: input.name,
                deviceKind: resolveOpenLogiDeviceKind({
                    probedDeviceKind: input.probe.deviceKind,
                    registerDeviceKind: "unknown",
                }),
                online: true,
                ...probeFields(input.probe),
            }],
        },
    };
}

/** Whether a Bolt receiver walk is authoritative for this tick. */
export function isOpenLogiBoltReceiverProbeComplete(input: {
    readonly pairingCount?: number;
    readonly pairedDeviceCount: number;
}): boolean {
    return input.pairingCount !== undefined && input.pairedDeviceCount === input.pairingCount;
}

/** Whether a Unifying receiver answered enough to avoid node-ledger replay. */
export function isOpenLogiUnifyingReceiverProbeHealthy(input: {
    readonly pairingCount?: number;
}): boolean {
    return input.pairingCount !== undefined;
}

/** Builds OpenLogi's degraded Unifying receiver cache uid when UID read fails. */
export function buildOpenLogiUnifyingReceiverUidFallback(productId: number): string {
    // This is weaker than the real receiver serial. It keeps the cache scoped to
    // the receiver family rather than pretending the slot alone is stable.
    return `pid:${productId.toString(16).padStart(4, "0")}`;
}

function mapOpenLogiReceiverKindToDeviceKind(receiverKind: OpenLogiReceiverDeviceKind): OpenLogiDeviceKind {
    switch (receiverKind) {
        case "unknown":
        case "keyboard":
        case "mouse":
        case "numpad":
        case "presenter":
        case "remote":
        case "trackball":
        case "touchpad":
        case "gamepad":
        case "joystick":
        case "headset":
            return receiverKind;
        case "tablet":
            return "unknown";
    }
}

function probeFields(probe: OpenLogiHidppProbedFeatures): Pick<
    OpenLogiReceiverPairedDevice,
    "battery" | "deviceInformation" | "capabilities"
> {
    return {
        ...optionalField("battery", probe.battery),
        ...optionalField("deviceInformation", probe.deviceInformation),
        ...optionalField("capabilities", probe.capabilities),
    };
}

function optionalStringField<FieldName extends string>(
    fieldName: FieldName,
    value: string | undefined,
): Record<FieldName, string> | Record<string, never> {
    return value === undefined ? {} : { [fieldName]: value } as Record<FieldName, string>;
}

function optionalNumberField<FieldName extends string>(
    fieldName: FieldName,
    value: number | undefined,
): Record<FieldName, number> | Record<string, never> {
    return value === undefined ? {} : { [fieldName]: value } as Record<FieldName, number>;
}

function optionalField<FieldName extends string, Value>(
    fieldName: FieldName,
    value: Value | undefined,
): Record<FieldName, Value> | Record<string, never> {
    return value === undefined ? {} : { [fieldName]: value } as Record<FieldName, Value>;
}
