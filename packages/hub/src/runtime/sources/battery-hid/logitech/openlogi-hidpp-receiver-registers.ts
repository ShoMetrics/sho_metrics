/**
 * OpenLogi-isomorphic HID++1.0 receiver register helpers.
 *
 * Source: OpenLogi
 * Files:
 * - `crates/openlogi-hidpp/src/protocol/v10.rs`
 * - `crates/openlogi-hidpp/src/receiver/bolt.rs`
 * - `crates/openlogi-hidpp/src/receiver/unifying.rs`
 * - `crates/openlogi-hid/src/inventory.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 *
 * This file intentionally models receiver registers, not device HID++2
 * features. Easy-Switch `0x1814` is not implemented by OpenLogi's read path and
 * belongs to ShoMetrics' extension layer.
 */

import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
    type LogitechReceiverSlot,
} from "./hidpp-protocol";
import {
    OPENLOGI_HIDPP_RESPONSE_TIMEOUT_MILLISECONDS,
    type OpenLogiHidppRequest,
} from "./openlogi-hidpp-battery-reader";

export const OPENLOGI_RECEIVER_DEVICE_INDEX = 0xFF;

const OPENLOGI_HIDPP10_SET_REGISTER_SUB_ID = 0x80;
const OPENLOGI_HIDPP10_GET_REGISTER_SUB_ID = 0x81;
const OPENLOGI_HIDPP10_SET_LONG_REGISTER_SUB_ID = 0x82;
const OPENLOGI_HIDPP10_GET_LONG_REGISTER_SUB_ID = 0x83;
const OPENLOGI_HIDPP10_ERROR_SUB_ID = 0x8F;

const OPENLOGI_RECEIVER_CONNECTIONS_REGISTER = 0x02;
const OPENLOGI_RECEIVER_INFO_REGISTER = 0xB5;
const OPENLOGI_BOLT_UNIQUE_ID_REGISTER = 0xFB;
const OPENLOGI_UNIFYING_RECEIVER_INFO_SUB_REGISTER = 0x03;
const OPENLOGI_DEVICE_PAIRING_INFORMATION_SUB_REGISTER_BASE = 0x50;
const OPENLOGI_DEVICE_CODENAME_SUB_REGISTER_BASE = 0x60;

export type OpenLogiReceiverKind = "bolt" | "unifying";

export type OpenLogiReceiverDeviceKind =
    | "unknown"
    | "keyboard"
    | "mouse"
    | "numpad"
    | "presenter"
    | "remote"
    | "trackball"
    | "touchpad"
    | "tablet"
    | "gamepad"
    | "joystick"
    | "headset";

export interface OpenLogiReceiverRegisterResponse {
    readonly state: "register";
    readonly payload: readonly number[];
}

export interface OpenLogiReceiverRegisterAccessError {
    readonly state: "registerError";
    readonly errorCode: number;
}

export type OpenLogiReceiverRegisterParseResult =
    | OpenLogiReceiverRegisterResponse
    | OpenLogiReceiverRegisterAccessError
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "malformed";
    };

export interface OpenLogiReceiverPairingInformation {
    readonly wirelessProductId: number;
    readonly deviceKind: OpenLogiReceiverDeviceKind;
    readonly encrypted: boolean;
    readonly online: boolean;
    /** Bolt uses this pairing-register unit id as the per-device cache key when it is non-zero. */
    readonly unitId: readonly number[];
}

export type OpenLogiReceiverPairingInformationParseResult =
    | {
        readonly state: "pairingInformation";
        readonly pairingInformation: OpenLogiReceiverPairingInformation;
    }
    | {
        readonly state: "unsupported";
        readonly rawKind: number;
    }
    | {
        readonly state: "malformed";
    };

export interface OpenLogiUnifyingReceiverInfo {
    readonly serialNumber: string;
    readonly pairingSlots: number;
}

export type OpenLogiReceiverEventParseResult =
    | {
        readonly state: "deviceConnection";
        readonly connection: OpenLogiReceiverDeviceConnection;
    }
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "unsupported";
        readonly rawKind: number;
    }
    | {
        readonly state: "malformed";
    };

export interface OpenLogiReceiverDeviceConnection {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly deviceKind: OpenLogiReceiverDeviceKind;
    readonly encrypted: boolean;
    readonly online: boolean;
    readonly wirelessProductId: number;
}

/** Builds OpenLogi's HID++1.0 short-register read request. */
export function buildOpenLogiReadRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly registerAddress: number;
    readonly parameters?: readonly number[];
}): OpenLogiHidppRequest {
    return buildOpenLogiReceiverRegisterRequest({
        receiverSlot: input.receiverSlot,
        subId: OPENLOGI_HIDPP10_GET_REGISTER_SUB_ID,
        registerAddress: input.registerAddress,
        parameters: input.parameters,
    });
}

/** Builds OpenLogi's HID++1.0 short-register write request. */
export function buildOpenLogiWriteRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly registerAddress: number;
    readonly parameters: readonly number[];
}): OpenLogiHidppRequest {
    return buildOpenLogiReceiverRegisterRequest({
        receiverSlot: input.receiverSlot,
        subId: OPENLOGI_HIDPP10_SET_REGISTER_SUB_ID,
        registerAddress: input.registerAddress,
        parameters: input.parameters,
    });
}

/** Builds OpenLogi's HID++1.0 long-register read request. */
export function buildOpenLogiReadLongRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly registerAddress: number;
    readonly parameters?: readonly number[];
}): OpenLogiHidppRequest {
    return buildOpenLogiReceiverRegisterRequest({
        receiverSlot: input.receiverSlot,
        subId: OPENLOGI_HIDPP10_GET_LONG_REGISTER_SUB_ID,
        registerAddress: input.registerAddress,
        parameters: input.parameters,
    });
}

/** Builds OpenLogi's HID++1.0 long-register write request. */
export function buildOpenLogiWriteLongRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly registerAddress: number;
    readonly payload: readonly number[];
}): OpenLogiHidppRequest {
    const payload = input.payload.slice(0, 16);
    return {
        bytes: [
            LOGITECH_HIDPP_LONG_REPORT_ID,
            input.receiverSlot,
            OPENLOGI_HIDPP10_SET_LONG_REGISTER_SUB_ID,
            input.registerAddress,
            ...payload,
            ...Array.from({ length: Math.max(0, 16 - payload.length) }, () => 0x00),
        ],
        expectedResponse: {
            receiverSlot: input.receiverSlot,
            featureIndex: OPENLOGI_HIDPP10_SET_LONG_REGISTER_SUB_ID,
            functionByte: input.registerAddress,
        },
        timeoutMilliseconds: OPENLOGI_HIDPP_RESPONSE_TIMEOUT_MILLISECONDS,
    };
}

/** Builds the `0x02` register request OpenLogi uses for receiver pairing count. */
export function buildOpenLogiPairingCountRequest(): OpenLogiHidppRequest {
    return buildOpenLogiReadRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: OPENLOGI_RECEIVER_CONNECTIONS_REGISTER,
    });
}

/** Builds the `0x02` register write OpenLogi uses to trigger arrival events. */
export function buildOpenLogiTriggerDeviceArrivalRequest(): OpenLogiHidppRequest {
    return buildOpenLogiWriteRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: OPENLOGI_RECEIVER_CONNECTIONS_REGISTER,
        parameters: [0x02, 0x00, 0x00],
    });
}

/** Builds the Bolt unique-id request against register `0xFB`. */
export function buildOpenLogiBoltReceiverUniqueIdRequest(): OpenLogiHidppRequest {
    return buildOpenLogiReadLongRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: OPENLOGI_BOLT_UNIQUE_ID_REGISTER,
    });
}

/** Builds the Unifying receiver-info request against `0xB5/0x03`. */
export function buildOpenLogiUnifyingReceiverInfoRequest(): OpenLogiHidppRequest {
    return buildOpenLogiReadLongRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: OPENLOGI_RECEIVER_INFO_REGISTER,
        parameters: [OPENLOGI_UNIFYING_RECEIVER_INFO_SUB_REGISTER, 0x00, 0x00],
    });
}

/** Builds the shared Bolt/Unifying pairing-info request against `0xB5/0x5N`. */
export function buildOpenLogiDevicePairingInformationRequest(
    receiverSlot: LogitechReceiverSlot,
): OpenLogiHidppRequest {
    return buildOpenLogiReadLongRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: OPENLOGI_RECEIVER_INFO_REGISTER,
        parameters: [
            OPENLOGI_DEVICE_PAIRING_INFORMATION_SUB_REGISTER_BASE | (receiverSlot & 0x0F),
            0x00,
            0x00,
        ],
    });
}

/** Builds OpenLogi's first-chunk codename request against `0xB5/0x6N`. */
export function buildOpenLogiDeviceCodenameRequest(receiverSlot: LogitechReceiverSlot): OpenLogiHidppRequest {
    return buildOpenLogiReadLongRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: OPENLOGI_RECEIVER_INFO_REGISTER,
        parameters: [
            OPENLOGI_DEVICE_CODENAME_SUB_REGISTER_BASE + (receiverSlot & 0x0F),
            0x01,
            0x00,
        ],
    });
}

/**
 * Parses the HID++1.0/RAP response shape OpenLogi accepts for a register call.
 *
 * OpenLogi matches both success and error responses by the request sub-id and
 * register address. Success payloads exclude the echoed register byte, matching
 * `read_register` and `read_long_register` return values in OpenLogi.
 */
export function parseOpenLogiRegisterResponse(
    reportBytes: readonly number[],
    request: OpenLogiHidppRequest,
): OpenLogiReceiverRegisterParseResult {
    const requestReport = parseOpenLogiReceiverRegisterReport(request.bytes);
    const responseReport = parseOpenLogiReceiverRegisterReport(reportBytes);
    if (requestReport === undefined || responseReport === undefined) {
        return parseOpenLogiRegisterMalformedOrUnrelated(reportBytes);
    }

    if (responseReport.receiverSlot !== requestReport.receiverSlot) {
        return { state: "unrelated" };
    }

    if (responseReport.subId === OPENLOGI_HIDPP10_ERROR_SUB_ID) {
        if (responseReport.payload.length < 3 ||
            responseReport.payload[0] !== requestReport.subId ||
            responseReport.payload[1] !== requestReport.registerAddress) {
            return { state: "unrelated" };
        }

        const errorCode = responseReport.payload[2];
        return errorCode === undefined
            ? { state: "malformed" }
            : {
                state: "registerError",
                errorCode,
            };
    }

    if (responseReport.subId !== requestReport.subId ||
        responseReport.registerAddress !== requestReport.registerAddress) {
        return { state: "unrelated" };
    }

    return {
        state: "register",
        payload: responseReport.payload.slice(1),
    };
}

/** Parses OpenLogi's `count_pairings()` response payload. */
export function parseOpenLogiPairingCount(payload: readonly number[]): number | undefined {
    return payload[1];
}

/** Parses OpenLogi's Bolt receiver unique-id payload as UTF-8 bytes. */
export function parseOpenLogiBoltReceiverUniqueId(payload: readonly number[]): string | undefined {
    // OpenLogi names this a receiver unique id rather than a device serial. Keep
    // it receiver-scoped and do not treat it as peripheral identity.
    return payload.length === 16 ? textFromUtf8Bytes(payload) : undefined;
}

/** Parses OpenLogi's Unifying receiver info from register `0xB5/0x03`. */
export function parseOpenLogiUnifyingReceiverInfo(payload: readonly number[]): OpenLogiUnifyingReceiverInfo | undefined {
    return payload.length === 16
        ? {
            serialNumber: formatUpperHexBytes(payload.slice(1, 5)),
            pairingSlots: payload[6] ?? 0,
        }
        : undefined;
}

/** Parses OpenLogi's Bolt/Unifying paired-device register payload. */
export function parseOpenLogiReceiverPairingInformation(
    receiverKind: OpenLogiReceiverKind,
    payload: readonly number[],
): OpenLogiReceiverPairingInformationParseResult {
    if (payload.length !== 16) {
        return { state: "malformed" };
    }

    const flags = payload[1];
    const rawKind = flags === undefined ? undefined : flags & 0x0F;
    const deviceKind = rawKind === undefined
        ? undefined
        : parseOpenLogiReceiverDeviceKind(receiverKind, rawKind);
    if (rawKind === undefined || deviceKind === undefined) {
        return {
            state: rawKind === undefined ? "malformed" : "unsupported",
            rawKind: rawKind ?? 0,
        };
    }

    return {
        state: "pairingInformation",
        pairingInformation: {
            wirelessProductId: littleEndianUint16(payload[2], payload[3]),
            deviceKind,
            encrypted: (flags & openLogiEncryptionMask(receiverKind)) !== 0,
            // HID++ receiver registers use a cleared online bit to mean present.
            online: (flags & (1 << 6)) === 0,
            unitId: payload.slice(4, 8),
        },
    };
}

/**
 * Parses the codename chunk OpenLogi's inventory workaround reads.
 *
 * OpenLogi treats byte 2 as a byte length, clamps it to the 13 bytes available
 * in one long-register response, and returns `None` for invalid UTF-8.
 */
export function parseOpenLogiDeviceCodename(payload: readonly number[]): string | undefined {
    if (payload.length !== 16) {
        return undefined;
    }

    const nameLength = Math.min(payload[2] ?? 0, 13);
    return textFromUtf8Bytes(payload.slice(3, 3 + nameLength));
}

/** Parses OpenLogi's receiver device-connection event from an unmatched report. */
export function parseOpenLogiReceiverDeviceConnectionEvent(
    receiverKind: OpenLogiReceiverKind,
    reportBytes: readonly number[],
): OpenLogiReceiverEventParseResult {
    const report = parseOpenLogiReceiverRegisterReport(reportBytes);
    if (report === undefined) {
        return parseOpenLogiEventMalformedOrUnrelated(reportBytes);
    }

    if (report.subId !== 0x41) {
        return { state: "unrelated" };
    }

    const flags = report.payload[1];
    const rawKind = flags === undefined ? undefined : flags & 0x0F;
    const deviceKind = rawKind === undefined
        ? undefined
        : parseOpenLogiReceiverDeviceKind(receiverKind, rawKind);
    if (rawKind === undefined || deviceKind === undefined) {
        return {
            state: rawKind === undefined ? "malformed" : "unsupported",
            rawKind: rawKind ?? 0,
        };
    }

    return {
        state: "deviceConnection",
        connection: {
            receiverSlot: report.receiverSlot,
            deviceKind,
            encrypted: (flags & openLogiEncryptionMask(receiverKind)) !== 0,
            online: (flags & (1 << 6)) === 0,
            wirelessProductId: littleEndianUint16(report.payload[2], report.payload[3]),
        },
    };
}

function buildOpenLogiReceiverRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly subId: number;
    readonly registerAddress: number;
    readonly parameters?: readonly number[];
}): OpenLogiHidppRequest {
    const parameters = input.parameters ?? [];
    return {
        bytes: [
            LOGITECH_HIDPP_SHORT_REPORT_ID,
            input.receiverSlot,
            input.subId,
            input.registerAddress,
            parameters[0] ?? 0x00,
            parameters[1] ?? 0x00,
            parameters[2] ?? 0x00,
        ],
        expectedResponse: {
            receiverSlot: input.receiverSlot,
            featureIndex: input.subId,
            functionByte: input.registerAddress,
        },
        timeoutMilliseconds: OPENLOGI_HIDPP_RESPONSE_TIMEOUT_MILLISECONDS,
    };
}

interface OpenLogiReceiverRegisterReport {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly subId: number;
    readonly registerAddress?: number;
    readonly payload: readonly number[];
}

function parseOpenLogiReceiverRegisterReport(
    reportBytes: readonly number[],
): OpenLogiReceiverRegisterReport | undefined {
    if (reportBytes[0] !== LOGITECH_HIDPP_SHORT_REPORT_ID && reportBytes[0] !== LOGITECH_HIDPP_LONG_REPORT_ID) {
        return undefined;
    }

    if (reportBytes.length !== 7 && reportBytes.length !== 20) {
        return undefined;
    }

    return {
        receiverSlot: reportBytes[1] ?? 0,
        subId: reportBytes[2] ?? 0,
        registerAddress: reportBytes[3],
        payload: reportBytes.slice(3),
    };
}

function parseOpenLogiRegisterMalformedOrUnrelated(reportBytes: readonly number[]): OpenLogiReceiverRegisterParseResult {
    if (reportBytes[0] === LOGITECH_HIDPP_SHORT_REPORT_ID || reportBytes[0] === LOGITECH_HIDPP_LONG_REPORT_ID) {
        return reportBytes.length === 7 || reportBytes.length === 20
            ? { state: "unrelated" }
            : { state: "malformed" };
    }

    return { state: "unrelated" };
}

function parseOpenLogiEventMalformedOrUnrelated(reportBytes: readonly number[]): OpenLogiReceiverEventParseResult {
    if (reportBytes[0] === LOGITECH_HIDPP_SHORT_REPORT_ID || reportBytes[0] === LOGITECH_HIDPP_LONG_REPORT_ID) {
        return reportBytes.length === 7 || reportBytes.length === 20
            ? { state: "unrelated" }
            : { state: "malformed" };
    }

    return { state: "unrelated" };
}

function parseOpenLogiReceiverDeviceKind(
    receiverKind: OpenLogiReceiverKind,
    rawKind: number,
): OpenLogiReceiverDeviceKind | undefined {
    // Bolt and Unifying share the low kind values, then diverge for values 5+.
    const commonKind = parseOpenLogiCommonReceiverDeviceKind(rawKind);
    if (commonKind !== undefined) {
        return commonKind;
    }

    if (receiverKind === "unifying") {
        switch (rawKind) {
            case 0x05:
                return "remote";
            case 0x06:
                return "trackball";
            case 0x07:
                return "touchpad";
        }

        return undefined;
    }

    switch (rawKind) {
        case 0x07:
            return "remote";
        case 0x08:
            return "trackball";
        case 0x09:
            return "touchpad";
        case 0x0A:
            return "tablet";
        case 0x0B:
            return "gamepad";
        case 0x0C:
            return "joystick";
        case 0x0D:
            return "headset";
    }

    return undefined;
}

function parseOpenLogiCommonReceiverDeviceKind(rawKind: number): OpenLogiReceiverDeviceKind | undefined {
    switch (rawKind) {
        case 0x00:
            return "unknown";
        case 0x01:
            return "keyboard";
        case 0x02:
            return "mouse";
        case 0x03:
            return "numpad";
        case 0x04:
            return "presenter";
    }

    return undefined;
}

function openLogiEncryptionMask(receiverKind: OpenLogiReceiverKind): number {
    return receiverKind === "bolt" ? (1 << 5) : (1 << 4);
}

function littleEndianUint16(lowByte: number | undefined, highByte: number | undefined): number {
    return ((highByte ?? 0) << 8) | (lowByte ?? 0);
}

function formatUpperHexBytes(bytes: readonly number[]): string {
    return bytes
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

function textFromUtf8Bytes(bytes: readonly number[]): string | undefined {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
        return decoder.decode(Uint8Array.from(bytes));
    } catch {
        return undefined;
    }
}
