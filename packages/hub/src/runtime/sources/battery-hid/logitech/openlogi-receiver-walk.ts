/**
 * OpenLogi-isomorphic receiver inventory walk.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hid/src/inventory.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 *
 * This file preserves OpenLogi's receiver-level call order. It deliberately
 * stays above native HID I/O and below ShoMetrics descriptor/coalescing models.
 */

import type {
    OpenLogiHidppBatteryProbeResult,
    OpenLogiHidppExchangeResult,
    OpenLogiHidppProbedFeatures,
    OpenLogiHidppRequest,
} from "./openlogi-hidpp-battery-reader";
import {
    OPENLOGI_HIDPP_UNIFYING_SLOT_PROBE_MILLISECONDS,
} from "./openlogi-hidpp-transport";
import {
    buildOpenLogiBoltReceiverUniqueIdRequest,
    buildOpenLogiDeviceCodenameRequest,
    buildOpenLogiDevicePairingInformationRequest,
    buildOpenLogiPairingCountRequest,
    buildOpenLogiTriggerDeviceArrivalRequest,
    buildOpenLogiUnifyingReceiverInfoRequest,
    parseOpenLogiBoltReceiverUniqueId,
    parseOpenLogiDeviceCodename,
    parseOpenLogiPairingCount,
    parseOpenLogiReceiverPairingInformation,
    parseOpenLogiRegisterResponse,
    parseOpenLogiUnifyingReceiverInfo,
    type OpenLogiReceiverDeviceConnection,
    type OpenLogiReceiverKind,
    type OpenLogiReceiverPairingInformation,
} from "./openlogi-hidpp-receiver-registers";
import {
    assembleOpenLogiBoltPairedDevice,
    assembleOpenLogiUnifyingPairedDevice,
    buildOpenLogiUnifyingReceiverUidFallback,
    isOpenLogiBoltReceiverProbeComplete,
    isOpenLogiUnifyingReceiverProbeHealthy,
    type OpenLogiReceiverPairedDevice,
} from "./openlogi-receiver-inventory";
import { buildOpenLogiBoltCacheKey } from "./openlogi-inventory-policy";

export const OPENLOGI_RECEIVER_ARRIVAL_DRAIN_MILLISECONDS = 1_500;
const OPENLOGI_RECEIVER_SLOT_LIMIT = 6;

/** Supplies the transport and cached HID++ feature probe used by a receiver walk. */
export interface OpenLogiReceiverWalkRuntime {
    exchange(request: OpenLogiHidppRequest): OpenLogiHidppExchangeResult;
    drainReceiverConnectionEvents(input: {
        readonly receiverKind: OpenLogiReceiverKind;
        readonly triggerRequest: OpenLogiHidppRequest;
        readonly timeoutMilliseconds: number;
    }): readonly OpenLogiReceiverDeviceConnection[] | undefined;
    readBatteryProbe(input: {
        readonly receiverSlot: number;
        readonly cacheKey?: string;
        readonly online: boolean;
        readonly tick: number;
        readonly timeoutMilliseconds?: number;
    }): OpenLogiHidppBatteryProbeResult;
    evictUnseenBatteryProbeCache?(seenCacheKeys: ReadonlySet<string>): void;
    close?(): void;
}

export interface OpenLogiReceiverWalkInput {
    readonly runtime: OpenLogiReceiverWalkRuntime;
    readonly vendorId: number;
    readonly productId: number;
    readonly tick: number;
}

export interface OpenLogiReceiverInventory {
    readonly receiver: OpenLogiReceiverInformation;
    readonly pairedDevices: readonly OpenLogiReceiverPairedDevice[];
}

export interface OpenLogiReceiverInformation {
    readonly name: string;
    readonly vendorId: number;
    readonly productId: number;
    readonly uniqueId?: string;
}

export interface OpenLogiReceiverWalkResult {
    readonly inventory?: OpenLogiReceiverInventory;
    readonly healthy: boolean;
    readonly seenCacheKeys: ReadonlySet<string>;
}

/** Walks a Bolt receiver using OpenLogi's strict pairing-count completeness rule. */
export function walkOpenLogiBoltReceiver(input: OpenLogiReceiverWalkInput): OpenLogiReceiverWalkResult {
    const uniqueId = readOpenLogiBoltReceiverUniqueId(input.runtime);
    const pairingCount = readOpenLogiPairingCount(input.runtime);
    // Bolt combines arrival events with slot pairing registers: events identify
    // responsive online devices, while pairing registers also cover sleeping or
    // offline paired devices.
    const arrivalEventBySlot = mapOpenLogiArrivalEventsBySlot(
        input.runtime.drainReceiverConnectionEvents({
            receiverKind: "bolt",
            triggerRequest: buildOpenLogiTriggerDeviceArrivalRequest(),
            timeoutMilliseconds: OPENLOGI_RECEIVER_ARRIVAL_DRAIN_MILLISECONDS,
        }) ?? [],
    );

    const pairedDevices: OpenLogiReceiverPairedDevice[] = [];
    const seenCacheKeys = new Set<string>();
    for (let receiverSlot = 1; receiverSlot <= OPENLOGI_RECEIVER_SLOT_LIMIT; receiverSlot += 1) {
        const pairedDevice = probeOpenLogiBoltReceiverSlot({
            runtime: input.runtime,
            receiverSlot,
            arrivalEvent: arrivalEventBySlot.get(receiverSlot),
            tick: input.tick,
            seenCacheKeys,
        });
        if (pairedDevice !== undefined) {
            pairedDevices.push(pairedDevice);
        }
    }

    return {
        inventory: {
            receiver: {
                name: "Logi Bolt Receiver",
                vendorId: input.vendorId,
                productId: input.productId,
                ...optionalStringField("uniqueId", uniqueId),
            },
            pairedDevices,
        },
        healthy: isOpenLogiBoltReceiverProbeComplete({
            pairingCount,
            pairedDeviceCount: pairedDevices.length,
        }),
        seenCacheKeys,
    };
}

/** Walks a Unifying receiver using OpenLogi's online-event-only device surface. */
export function walkOpenLogiUnifyingReceiver(input: OpenLogiReceiverWalkInput): OpenLogiReceiverWalkResult {
    const receiverInfo = readOpenLogiUnifyingReceiverInfo(input.runtime);
    const pairingCount = readOpenLogiPairingCount(input.runtime);
    const arrivalEvents = input.runtime.drainReceiverConnectionEvents({
        receiverKind: "unifying",
        triggerRequest: buildOpenLogiTriggerDeviceArrivalRequest(),
        timeoutMilliseconds: OPENLOGI_RECEIVER_ARRIVAL_DRAIN_MILLISECONDS,
    });
    if (arrivalEvents === undefined) {
        // OpenLogi does not use pairing-info registers as a fallback inventory
        // source for Unifying devices, so failing to trigger arrivals makes this
        // receiver walk unhealthy for the current tick.
        return {
            healthy: false,
            seenCacheKeys: new Set(),
        };
    }

    const receiverUid = receiverInfo?.serialNumber ?? buildOpenLogiUnifyingReceiverUidFallback(input.productId);
    const seenCacheKeys = new Set<string>();
    const pairedDevices = arrivalEvents.map(arrivalEvent => {
        const assembled = assembleOpenLogiUnifyingPairedDevice({
            receiverUid,
            arrivalEvent,
            codename: readOpenLogiDeviceCodename(input.runtime, arrivalEvent.receiverSlot),
            probe: readProbeOrEmpty(input.runtime, {
                receiverSlot: arrivalEvent.receiverSlot,
                cacheKey: `unifying:${receiverUid}:${arrivalEvent.receiverSlot}`,
                online: arrivalEvent.online,
                tick: input.tick,
                timeoutMilliseconds: OPENLOGI_HIDPP_UNIFYING_SLOT_PROBE_MILLISECONDS,
            }),
        });
        seenCacheKeys.add(assembled.cacheKey);
        return assembled.pairedDevice;
    });

    return {
        inventory: {
            receiver: {
                name: "Unifying Receiver",
                vendorId: input.vendorId,
                productId: input.productId,
                ...optionalStringField("uniqueId", receiverInfo?.serialNumber),
            },
            pairedDevices,
        },
        healthy: isOpenLogiUnifyingReceiverProbeHealthy({ pairingCount }),
        seenCacheKeys,
    };
}

function probeOpenLogiBoltReceiverSlot(input: {
    readonly runtime: OpenLogiReceiverWalkRuntime;
    readonly receiverSlot: number;
    readonly arrivalEvent?: OpenLogiReceiverDeviceConnection;
    readonly tick: number;
    readonly seenCacheKeys: Set<string>;
}): OpenLogiReceiverPairedDevice | undefined {
    const pairingInformation = readOpenLogiDevicePairingInformation(input.runtime, "bolt", input.receiverSlot);
    if (pairingInformation === undefined) {
        return undefined;
    }

    // Arrival events win for volatile fields; the pairing register remains the
    // source of the stable unit id used by the cache key.
    const online = input.arrivalEvent?.online ?? pairingInformation.online;
    const assembled = assembleOpenLogiBoltPairedDevice({
        receiverSlot: input.receiverSlot,
        pairingInformation,
        arrivalEvent: input.arrivalEvent,
        codename: readOpenLogiDeviceCodename(input.runtime, input.receiverSlot),
        probe: readProbeOrEmpty(input.runtime, {
            receiverSlot: input.receiverSlot,
            cacheKey: buildOpenLogiBoltCacheKey(pairingInformation.unitId),
            online,
            tick: input.tick,
        }),
    });
    if (assembled.cacheKey !== undefined) {
        input.seenCacheKeys.add(assembled.cacheKey);
    }

    return assembled.pairedDevice;
}

function readOpenLogiBoltReceiverUniqueId(runtime: OpenLogiReceiverWalkRuntime): string | undefined {
    const payload = readOpenLogiRegisterPayload(runtime, buildOpenLogiBoltReceiverUniqueIdRequest());
    return payload === undefined ? undefined : parseOpenLogiBoltReceiverUniqueId(payload);
}

function readOpenLogiUnifyingReceiverInfo(runtime: OpenLogiReceiverWalkRuntime): {
    readonly serialNumber: string;
    readonly pairingSlots: number;
} | undefined {
    const payload = readOpenLogiRegisterPayload(runtime, buildOpenLogiUnifyingReceiverInfoRequest());
    return payload === undefined ? undefined : parseOpenLogiUnifyingReceiverInfo(payload);
}

function readOpenLogiPairingCount(runtime: OpenLogiReceiverWalkRuntime): number | undefined {
    const payload = readOpenLogiRegisterPayload(runtime, buildOpenLogiPairingCountRequest());
    return payload === undefined ? undefined : parseOpenLogiPairingCount(payload);
}

function readOpenLogiDevicePairingInformation(
    runtime: OpenLogiReceiverWalkRuntime,
    receiverKind: OpenLogiReceiverKind,
    receiverSlot: number,
): OpenLogiReceiverPairingInformation | undefined {
    const payload = readOpenLogiRegisterPayload(runtime, buildOpenLogiDevicePairingInformationRequest(receiverSlot));
    if (payload === undefined) {
        return undefined;
    }

    const parsed = parseOpenLogiReceiverPairingInformation(receiverKind, payload);
    return parsed.state === "pairingInformation" ? parsed.pairingInformation : undefined;
}

function readOpenLogiDeviceCodename(
    runtime: OpenLogiReceiverWalkRuntime,
    receiverSlot: number,
): string | undefined {
    const payload = readOpenLogiRegisterPayload(runtime, buildOpenLogiDeviceCodenameRequest(receiverSlot));
    return payload === undefined ? undefined : parseOpenLogiDeviceCodename(payload);
}

function readOpenLogiRegisterPayload(
    runtime: OpenLogiReceiverWalkRuntime,
    request: OpenLogiHidppRequest,
): readonly number[] | undefined {
    const result = runtime.exchange(request);
    if (result.state !== "response") {
        return undefined;
    }

    const parsed = parseOpenLogiRegisterResponse(result.report, request);
    return parsed.state === "register" ? parsed.payload : undefined;
}

function readProbeOrEmpty(
    runtime: OpenLogiReceiverWalkRuntime,
    input: Parameters<OpenLogiReceiverWalkRuntime["readBatteryProbe"]>[0],
): OpenLogiHidppProbedFeatures {
    const result = runtime.readBatteryProbe(input);
    return result.state === "probe" ? result.probe : {};
}

function mapOpenLogiArrivalEventsBySlot(
    events: readonly OpenLogiReceiverDeviceConnection[],
): ReadonlyMap<number, OpenLogiReceiverDeviceConnection> {
    return new Map(events.map(event => [event.receiverSlot, event]));
}

function optionalStringField<FieldName extends string>(
    fieldName: FieldName,
    value: string | undefined,
): Record<FieldName, string> | Record<string, never> {
    return value === undefined ? {} : { [fieldName]: value } as Record<FieldName, string>;
}
