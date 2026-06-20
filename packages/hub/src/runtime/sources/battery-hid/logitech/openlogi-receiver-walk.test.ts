import assert from "node:assert/strict";
import test from "node:test";
import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "./hidpp-protocol";
import type {
    OpenLogiHidppBatteryProbeResult,
    OpenLogiHidppExchangeResult,
    OpenLogiHidppRequest,
} from "./openlogi-hidpp-battery-reader";
import {
    buildOpenLogiBoltReceiverUniqueIdRequest,
    buildOpenLogiDeviceCodenameRequest,
    buildOpenLogiDevicePairingInformationRequest,
    buildOpenLogiPairingCountRequest,
    buildOpenLogiTriggerDeviceArrivalRequest,
    buildOpenLogiUnifyingReceiverInfoRequest,
    type OpenLogiReceiverDeviceConnection,
    type OpenLogiReceiverKind,
} from "./openlogi-hidpp-receiver-registers";
import { OPENLOGI_HIDPP_UNIFYING_SLOT_PROBE_MILLISECONDS } from "./openlogi-hidpp-transport";
import {
    OPENLOGI_RECEIVER_ARRIVAL_DRAIN_MILLISECONDS,
    type OpenLogiReceiverWalkRuntime,
    walkOpenLogiBoltReceiver,
    walkOpenLogiUnifyingReceiver,
} from "./openlogi-receiver-walk";

test("OpenLogi Bolt receiver walk reads receiver facts, drains arrivals, then probes readable slots", () => {
    const runtime = new FakeOpenLogiReceiverWalkRuntime({
        drainEvents: [{
            receiverSlot: 1,
            deviceKind: "mouse",
            encrypted: true,
            online: true,
            wirelessProductId: 0x1234,
        }],
        probeBySlot: new Map([
            [1, {
                state: "probe",
                probe: {
                    deviceKind: "trackball",
                    battery: {
                        percentage: 88,
                        level: "full",
                        status: "discharging",
                    },
                },
            }],
        ]),
    });
    runtime.setResponse(
        buildOpenLogiBoltReceiverUniqueIdRequest(),
        buildLongRegisterResponse(buildOpenLogiBoltReceiverUniqueIdRequest(), bytesFromAscii("BOLT123456789012")),
    );
    runtime.setResponse(
        buildOpenLogiPairingCountRequest(),
        buildShortRegisterResponse(buildOpenLogiPairingCountRequest(), [0x00, 0x01, 0x00]),
    );
    runtime.setResponse(
        buildOpenLogiDevicePairingInformationRequest(1),
        buildLongRegisterResponse(buildOpenLogiDevicePairingInformationRequest(1), [
            0x51,
            0x01,
            0x99,
            0x99,
            0xAA,
            0xBB,
            0xCC,
            0xDD,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
        ]),
    );
    runtime.setResponse(
        buildOpenLogiDeviceCodenameRequest(1),
        buildLongRegisterResponse(buildOpenLogiDeviceCodenameRequest(1), codenamePayload("MX Anywhere")),
    );

    const result = walkOpenLogiBoltReceiver({
        runtime,
        vendorId: 0x046D,
        productId: 0xC548,
        tick: 7,
    });

    assert.deepEqual(runtime.exchangeRequests.slice(0, 4), [
        buildOpenLogiBoltReceiverUniqueIdRequest().bytes,
        buildOpenLogiPairingCountRequest().bytes,
        buildOpenLogiDevicePairingInformationRequest(1).bytes,
        buildOpenLogiDeviceCodenameRequest(1).bytes,
    ]);
    assert.deepEqual(runtime.drainRequests, [{
        receiverKind: "bolt",
        triggerRequestBytes: buildOpenLogiTriggerDeviceArrivalRequest().bytes,
        timeoutMilliseconds: OPENLOGI_RECEIVER_ARRIVAL_DRAIN_MILLISECONDS,
    }]);
    assert.equal(result.healthy, true);
    assert.deepEqual([...result.seenCacheKeys], ["bolt:aabbccdd"]);
    assert.deepEqual(result.inventory, {
        receiver: {
            name: "Logi Bolt Receiver",
            vendorId: 0x046D,
            productId: 0xC548,
            uniqueId: "BOLT123456789012",
        },
        pairedDevices: [{
            receiverSlot: 1,
            codename: "MX Anywhere",
            wirelessProductId: 0x1234,
            deviceKind: "trackball",
            online: true,
            battery: {
                percentage: 88,
                level: "full",
                status: "discharging",
            },
        }],
    });
});

test("OpenLogi Unifying receiver walk treats arrival-trigger failure as a failed probe", () => {
    const runtime = new FakeOpenLogiReceiverWalkRuntime({
        drainEvents: undefined,
    });
    runtime.setResponse(
        buildOpenLogiUnifyingReceiverInfoRequest(),
        buildLongRegisterResponse(buildOpenLogiUnifyingReceiverInfoRequest(), [
            0x03,
            0xDE,
            0xAD,
            0xBE,
            0xEF,
            0x00,
            0x06,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
        ]),
    );
    runtime.setResponse(
        buildOpenLogiPairingCountRequest(),
        buildShortRegisterResponse(buildOpenLogiPairingCountRequest(), [0x00, 0x01, 0x00]),
    );

    const result = walkOpenLogiUnifyingReceiver({
        runtime,
        vendorId: 0x046D,
        productId: 0xC52B,
        tick: 9,
    });

    assert.deepEqual(runtime.exchangeRequests, [
        buildOpenLogiUnifyingReceiverInfoRequest().bytes,
        buildOpenLogiPairingCountRequest().bytes,
    ]);
    assert.deepEqual(result, {
        healthy: false,
        seenCacheKeys: new Set(),
    });
});

test("OpenLogi Unifying receiver walk uses receiver uid fallback and slot probe budget", () => {
    const runtime = new FakeOpenLogiReceiverWalkRuntime({
        drainEvents: [{
            receiverSlot: 3,
            deviceKind: "mouse",
            encrypted: true,
            online: true,
            wirelessProductId: 0x4069,
        }],
        probeBySlot: new Map([
            [3, {
                state: "probe",
                probe: {
                    capabilities: {
                        buttons: true,
                        pointer: true,
                        lighting: false,
                    },
                },
            }],
        ]),
    });
    runtime.setResponse(
        buildOpenLogiPairingCountRequest(),
        buildShortRegisterResponse(buildOpenLogiPairingCountRequest(), [0x00, 0x01, 0x00]),
    );
    runtime.setResponse(
        buildOpenLogiDeviceCodenameRequest(3),
        buildLongRegisterResponse(buildOpenLogiDeviceCodenameRequest(3), codenamePayload("MX Master 3")),
    );

    const result = walkOpenLogiUnifyingReceiver({
        runtime,
        vendorId: 0x046D,
        productId: 0xC52B,
        tick: 11,
    });

    assert.deepEqual(runtime.probeInputs, [{
        receiverSlot: 3,
        cacheKey: "unifying:pid:c52b:3",
        online: true,
        tick: 11,
        timeoutMilliseconds: OPENLOGI_HIDPP_UNIFYING_SLOT_PROBE_MILLISECONDS,
    }]);
    assert.equal(result.healthy, true);
    assert.deepEqual([...result.seenCacheKeys], ["unifying:pid:c52b:3"]);
    assert.deepEqual(result.inventory, {
        receiver: {
            name: "Unifying Receiver",
            vendorId: 0x046D,
            productId: 0xC52B,
        },
        pairedDevices: [{
            receiverSlot: 3,
            codename: "MX Master 3",
            wirelessProductId: 0x4069,
            deviceKind: "mouse",
            online: true,
            capabilities: {
                buttons: true,
                pointer: true,
                lighting: false,
            },
        }],
    });
});

interface DrainRequest {
    readonly receiverKind: OpenLogiReceiverKind;
    readonly triggerRequestBytes: readonly number[];
    readonly timeoutMilliseconds: number;
}

class FakeOpenLogiReceiverWalkRuntime implements OpenLogiReceiverWalkRuntime {
    readonly exchangeRequests: readonly number[][] = [];
    readonly drainRequests: DrainRequest[] = [];
    readonly probeInputs: Parameters<OpenLogiReceiverWalkRuntime["readBatteryProbe"]>[0][] = [];
    private readonly responseByRequestKey = new Map<string, readonly number[]>();
    private readonly drainEvents: readonly OpenLogiReceiverDeviceConnection[] | undefined;
    private readonly probeBySlot: ReadonlyMap<number, OpenLogiHidppBatteryProbeResult>;

    constructor(input: {
        readonly drainEvents?: readonly OpenLogiReceiverDeviceConnection[];
        readonly probeBySlot?: ReadonlyMap<number, OpenLogiHidppBatteryProbeResult>;
    }) {
        this.drainEvents = input.drainEvents;
        this.probeBySlot = input.probeBySlot ?? new Map();
    }

    setResponse(request: OpenLogiHidppRequest, response: readonly number[]): void {
        this.responseByRequestKey.set(requestKey(request), response);
    }

    exchange(request: OpenLogiHidppRequest): OpenLogiHidppExchangeResult {
        (this.exchangeRequests as number[][]).push([...request.bytes]);
        const response = this.responseByRequestKey.get(requestKey(request));
        return response === undefined
            ? { state: "timeout" }
            : {
                state: "response",
                report: response,
            };
    }

    drainReceiverConnectionEvents(input: {
        readonly receiverKind: OpenLogiReceiverKind;
        readonly triggerRequest: OpenLogiHidppRequest;
        readonly timeoutMilliseconds: number;
    }): readonly OpenLogiReceiverDeviceConnection[] | undefined {
        this.drainRequests.push({
            receiverKind: input.receiverKind,
            triggerRequestBytes: [...input.triggerRequest.bytes],
            timeoutMilliseconds: input.timeoutMilliseconds,
        });
        return this.drainEvents;
    }

    readBatteryProbe(
        input: Parameters<OpenLogiReceiverWalkRuntime["readBatteryProbe"]>[0],
    ): OpenLogiHidppBatteryProbeResult {
        this.probeInputs.push(input);
        return this.probeBySlot.get(input.receiverSlot) ?? {
            state: "probe",
            probe: {},
        };
    }
}

function requestKey(request: OpenLogiHidppRequest): string {
    return request.bytes.join(",");
}

function buildShortRegisterResponse(request: OpenLogiHidppRequest, payload: readonly number[]): readonly number[] {
    return [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        request.bytes[1] ?? 0,
        request.bytes[2] ?? 0,
        request.bytes[3] ?? 0,
        payload[0] ?? 0,
        payload[1] ?? 0,
        payload[2] ?? 0,
    ];
}

function buildLongRegisterResponse(request: OpenLogiHidppRequest, payload: readonly number[]): readonly number[] {
    return [
        LOGITECH_HIDPP_LONG_REPORT_ID,
        request.bytes[1] ?? 0,
        request.bytes[2] ?? 0,
        request.bytes[3] ?? 0,
        ...payload.slice(0, 16),
        ...Array.from({ length: Math.max(0, 16 - payload.length) }, () => 0x00),
    ];
}

function codenamePayload(name: string): readonly number[] {
    const nameBytes = bytesFromAscii(name);
    return [
        0x60,
        0x01,
        nameBytes.length,
        ...nameBytes,
        ...Array.from({ length: Math.max(0, 13 - nameBytes.length) }, () => 0x00),
    ];
}

function bytesFromAscii(text: string): readonly number[] {
    return [...Buffer.from(text, "ascii")];
}
