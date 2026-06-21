/**
 * Logitech Bolt receiver register facts derived from OpenLogi.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/receiver/bolt.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

import {
    type LogitechHidppRequest,
    type LogitechReceiverSlot,
} from "../../logitech-hidpp-frame";
import {
    buildOpenLogiHidpp10GetLongRegisterRequest,
    classifyOpenLogiHidpp10ReportShape,
    parseOpenLogiHidpp10Report,
} from "../protocol/v10";
import {
    OPENLOGI_RECEIVER_DEVICE_INDEX,
    parseOpenLogiCommonReceiverDeviceKind,
    type OpenLogiReceiverDeviceKind,
    type OpenLogiReceiverDeviceConnection,
    type OpenLogiReceiverEventParseResult,
    type OpenLogiReceiverPairingInformationParseResult,
} from "./mod";

export const OPENLOGI_BOLT_RECEIVER_PRODUCT_ID = 0xC548;

const BOLT_RECEIVER_INFO_REGISTER = 0xB5;
const BOLT_DEVICE_PAIRING_INFORMATION_SUB_REGISTER_BASE = 0x50;

/**
 * Builds the Bolt paired-device info read against `0xB5/0x5N`.
 *
 * Source: OpenLogi `receiver/bolt.rs:get_device_pairing_information`.
 */
export function buildOpenLogiBoltDevicePairingInformationRequest(
    receiverSlot: LogitechReceiverSlot,
): LogitechHidppRequest {
    return buildOpenLogiHidpp10GetLongRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: BOLT_RECEIVER_INFO_REGISTER,
        parameters: [
            BOLT_DEVICE_PAIRING_INFORMATION_SUB_REGISTER_BASE | (receiverSlot & 0x0F),
            0x00,
            0x00,
        ],
    });
}

/**
 * Parses Bolt paired-device register payloads.
 *
 * Source: OpenLogi `receiver/bolt.rs:get_device_pairing_information`.
 */
export function parseOpenLogiBoltDevicePairingInformation(
    payload: readonly number[],
): OpenLogiReceiverPairingInformationParseResult {
    if (payload.length !== 16) {
        return { state: "malformed" };
    }

    const flags = payload[1];
    const rawKind = flags === undefined ? undefined : flags & 0x0F;
    const deviceKind = rawKind === undefined ? undefined : parseOpenLogiBoltDeviceKind(rawKind);
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
            encrypted: (flags & (1 << 5)) !== 0,
            // HID++ receiver registers use a cleared online bit to mean present.
            online: (flags & (1 << 6)) === 0,
            unitId: formatNonZeroHexBytes(payload.slice(4, 8)),
        },
    };
}

/**
 * Parses Bolt receiver `0x41` device-connection events.
 *
 * Source: OpenLogi `receiver/bolt.rs:Receiver::new` device-connection listener body.
 */
export function parseOpenLogiBoltDeviceConnectionEvent(
    reportBytes: readonly number[],
): OpenLogiReceiverEventParseResult {
    const report = parseOpenLogiHidpp10Report(reportBytes);
    if (report === undefined) {
        return parseEventMalformedOrUnrelated(reportBytes);
    }

    if (report.subId !== 0x41) {
        return { state: "unrelated" };
    }

    return mapBoltConnectionPayload(report.receiverSlot, report.payload);
}

/**
 * Parses Bolt device-kind values.
 *
 * Source: OpenLogi `receiver/bolt.rs:DeviceKind`.
 */
export function parseOpenLogiBoltDeviceKind(rawKind: number): OpenLogiReceiverDeviceKind | undefined {
    const commonKind = parseOpenLogiCommonReceiverDeviceKind(rawKind);
    if (commonKind !== undefined) {
        return commonKind;
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

function mapBoltConnectionPayload(
    receiverSlot: number,
    payload: readonly number[],
): OpenLogiReceiverEventParseResult {
    const flags = payload[1];
    const rawKind = flags === undefined ? undefined : flags & 0x0F;
    const deviceKind = rawKind === undefined ? undefined : parseOpenLogiBoltDeviceKind(rawKind);
    if (rawKind === undefined || deviceKind === undefined) {
        return {
            state: rawKind === undefined ? "malformed" : "unsupported",
            rawKind: rawKind ?? 0,
        };
    }

    const connection: OpenLogiReceiverDeviceConnection = {
        receiverSlot,
        deviceKind,
        encrypted: (flags & (1 << 5)) !== 0,
        online: (flags & (1 << 6)) === 0,
        wirelessProductId: littleEndianUint16(payload[2], payload[3]),
    };

    return {
        state: "deviceConnection",
        connection,
    };
}

function parseEventMalformedOrUnrelated(reportBytes: readonly number[]): OpenLogiReceiverEventParseResult {
    if (classifyOpenLogiHidpp10ReportShape(reportBytes) === "malformed") {
        return { state: "malformed" };
    }

    return { state: "unrelated" };
}

function littleEndianUint16(lowByte: number | undefined, highByte: number | undefined): number {
    return ((highByte ?? 0) << 8) | (lowByte ?? 0);
}

function formatNonZeroHexBytes(bytes: readonly number[]): string | undefined {
    return bytes.some(byte => byte !== 0)
        ? bytes.map(byte => byte.toString(16).padStart(2, "0")).join("")
        : undefined;
}
