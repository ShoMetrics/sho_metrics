/**
 * Logitech HID++1.0 receiver register helpers for online slot discovery.
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
 * This file deliberately keeps only the receiver pieces ShoMetrics needs for
 * V1 battery support: online slot discovery and stable receiver/device ids.
 * It does not model OpenLogi's full inventory, codename, or asset surface.
 */

import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
    type LogitechHidppRequest,
    type LogitechReceiverSlot,
} from "./hidpp-protocol";

export const LOGITECH_RECEIVER_DEVICE_SLOT = 0xFF;

const HIDPP10_SET_REGISTER_SUB_ID = 0x80;
const HIDPP10_GET_LONG_REGISTER_SUB_ID = 0x83;
const HIDPP10_ERROR_SUB_ID = 0x8F;

const RECEIVER_CONNECTIONS_REGISTER = 0x02;
const RECEIVER_INFO_REGISTER = 0xB5;
const DEVICE_PAIRING_INFORMATION_SUB_REGISTER_BASE = 0x50;

export type LogitechReceiverProtocolKind = "bolt" | "unifying";

export type LogitechReceiverDeviceKind =
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

export interface LogitechReceiverRegisterResponse {
    readonly state: "register";
    readonly payload: readonly number[];
}

export interface LogitechReceiverRegisterAccessError {
    readonly state: "registerError";
    readonly errorCode: number;
}

export type LogitechReceiverRegisterParseResult =
    | LogitechReceiverRegisterResponse
    | LogitechReceiverRegisterAccessError
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "malformed";
    };

export interface LogitechReceiverPairingInformation {
    readonly wirelessProductId: number;
    readonly deviceKind: LogitechReceiverDeviceKind;
    readonly encrypted: boolean;
    readonly online: boolean;
    /** Bolt pairing registers expose a non-zero per-device unit id. */
    readonly unitId?: string;
}

export type LogitechReceiverPairingInformationParseResult =
    | {
        readonly state: "pairingInformation";
        readonly pairingInformation: LogitechReceiverPairingInformation;
    }
    | {
        readonly state: "unsupported";
        readonly rawKind: number;
    }
    | {
        readonly state: "malformed";
    };

export interface LogitechReceiverDeviceConnection {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly deviceKind: LogitechReceiverDeviceKind;
    readonly encrypted: boolean;
    readonly online: boolean;
    readonly wirelessProductId: number;
}

export type LogitechReceiverEventParseResult =
    | {
        readonly state: "deviceConnection";
        readonly connection: LogitechReceiverDeviceConnection;
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

/** Builds the receiver register write that makes Unifying/Bolt emit online-device events. */
export function buildLogitechTriggerDeviceArrivalRequest(): LogitechHidppRequest {
    return buildLogitechReceiverRegisterRequest({
        receiverSlot: LOGITECH_RECEIVER_DEVICE_SLOT,
        subId: HIDPP10_SET_REGISTER_SUB_ID,
        registerAddress: RECEIVER_CONNECTIONS_REGISTER,
        parameters: [0x02, 0x00, 0x00],
    });
}

/** Builds the Bolt/Unifying paired-device info read against `0xB5/0x5N`. */
export function buildLogitechDevicePairingInformationRequest(
    receiverSlot: LogitechReceiverSlot,
): LogitechHidppRequest {
    return buildLogitechReceiverLongRegisterRequest({
        receiverSlot: LOGITECH_RECEIVER_DEVICE_SLOT,
        registerAddress: RECEIVER_INFO_REGISTER,
        parameters: [
            DEVICE_PAIRING_INFORMATION_SUB_REGISTER_BASE | (receiverSlot & 0x0F),
            0x00,
            0x00,
        ],
    });
}

/**
 * Parses a HID++1.0/RAP register response for the given request.
 *
 * Success payloads exclude the echoed register byte, matching OpenLogi's
 * `read_register` and `read_long_register` return values.
 */
export function parseLogitechReceiverRegisterResponse(
    reportBytes: readonly number[],
    request: LogitechHidppRequest,
): LogitechReceiverRegisterParseResult {
    const requestReport = parseLogitechReceiverRegisterReport(request.bytes);
    const responseReport = parseLogitechReceiverRegisterReport(reportBytes);
    if (requestReport === undefined || responseReport === undefined) {
        return parseRegisterMalformedOrUnrelated(reportBytes);
    }

    if (responseReport.receiverSlot !== requestReport.receiverSlot) {
        return { state: "unrelated" };
    }

    if (responseReport.subId === HIDPP10_ERROR_SUB_ID) {
        if (responseReport.payload.length < 3 ||
            responseReport.payload[0] !== requestReport.subId ||
            responseReport.payload[1] !== requestReport.registerAddress) {
            return { state: "unrelated" };
        }

        return {
            state: "registerError",
            errorCode: responseReport.payload[2] ?? 0,
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

/** Parses Bolt/Unifying paired-device register payloads. */
export function parseLogitechReceiverPairingInformation(
    receiverKind: LogitechReceiverProtocolKind,
    payload: readonly number[],
): LogitechReceiverPairingInformationParseResult {
    if (payload.length !== 16) {
        return { state: "malformed" };
    }

    const flags = payload[1];
    const rawKind = flags === undefined ? undefined : flags & 0x0F;
    const deviceKind = rawKind === undefined
        ? undefined
        : parseReceiverDeviceKind(receiverKind, rawKind);
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
            encrypted: (flags & encryptionMask(receiverKind)) !== 0,
            // HID++ receiver registers use a cleared online bit to mean present.
            online: (flags & (1 << 6)) === 0,
            unitId: formatNonZeroHexBytes(payload.slice(4, 8)),
        },
    };
}

/** Parses receiver `0x41` device-connection events emitted after the trigger write. */
export function parseLogitechReceiverDeviceConnectionEvent(
    receiverKind: LogitechReceiverProtocolKind,
    reportBytes: readonly number[],
): LogitechReceiverEventParseResult {
    const report = parseLogitechReceiverRegisterReport(reportBytes);
    if (report === undefined) {
        return parseEventMalformedOrUnrelated(reportBytes);
    }

    if (report.subId !== 0x41) {
        return { state: "unrelated" };
    }

    const flags = report.payload[1];
    const rawKind = flags === undefined ? undefined : flags & 0x0F;
    const deviceKind = rawKind === undefined
        ? undefined
        : parseReceiverDeviceKind(receiverKind, rawKind);
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
            encrypted: (flags & encryptionMask(receiverKind)) !== 0,
            online: (flags & (1 << 6)) === 0,
            wirelessProductId: littleEndianUint16(report.payload[2], report.payload[3]),
        },
    };
}

function buildLogitechReceiverLongRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly registerAddress: number;
    readonly parameters?: readonly number[];
}): LogitechHidppRequest {
    return buildLogitechReceiverRegisterRequest({
        receiverSlot: input.receiverSlot,
        subId: HIDPP10_GET_LONG_REGISTER_SUB_ID,
        registerAddress: input.registerAddress,
        parameters: input.parameters,
    });
}

function buildLogitechReceiverRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly subId: number;
    readonly registerAddress: number;
    readonly parameters?: readonly number[];
}): LogitechHidppRequest {
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
    };
}

interface LogitechReceiverRegisterReport {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly subId: number;
    readonly registerAddress?: number;
    readonly payload: readonly number[];
}

function parseLogitechReceiverRegisterReport(reportBytes: readonly number[]): LogitechReceiverRegisterReport | undefined {
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

function parseRegisterMalformedOrUnrelated(reportBytes: readonly number[]): LogitechReceiverRegisterParseResult {
    if (reportBytes[0] === LOGITECH_HIDPP_SHORT_REPORT_ID || reportBytes[0] === LOGITECH_HIDPP_LONG_REPORT_ID) {
        return reportBytes.length === 7 || reportBytes.length === 20
            ? { state: "unrelated" }
            : { state: "malformed" };
    }

    return { state: "unrelated" };
}

function parseEventMalformedOrUnrelated(reportBytes: readonly number[]): LogitechReceiverEventParseResult {
    if (reportBytes[0] === LOGITECH_HIDPP_SHORT_REPORT_ID || reportBytes[0] === LOGITECH_HIDPP_LONG_REPORT_ID) {
        return reportBytes.length === 7 || reportBytes.length === 20
            ? { state: "unrelated" }
            : { state: "malformed" };
    }

    return { state: "unrelated" };
}

function parseReceiverDeviceKind(
    receiverKind: LogitechReceiverProtocolKind,
    rawKind: number,
): LogitechReceiverDeviceKind | undefined {
    const commonKind = parseCommonReceiverDeviceKind(rawKind);
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

function parseCommonReceiverDeviceKind(rawKind: number): LogitechReceiverDeviceKind | undefined {
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

function encryptionMask(receiverKind: LogitechReceiverProtocolKind): number {
    return receiverKind === "bolt" ? (1 << 5) : (1 << 4);
}

function littleEndianUint16(lowByte: number | undefined, highByte: number | undefined): number {
    return ((highByte ?? 0) << 8) | (lowByte ?? 0);
}

function formatNonZeroHexBytes(bytes: readonly number[]): string | undefined {
    return bytes.some(byte => byte !== 0)
        ? bytes.map(byte => byte.toString(16).padStart(2, "0")).join("")
        : undefined;
}
