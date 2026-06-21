/**
 * Logitech Unifying receiver register facts derived from OpenLogi.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/receiver/unifying.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "../../logitech-hidpp-frame";
import {
    parseOpenLogiCommonReceiverDeviceKind,
    type OpenLogiReceiverDeviceKind,
    type OpenLogiReceiverDeviceConnection,
    type OpenLogiReceiverEventParseResult,
} from "./mod";

export const OPENLOGI_UNIFYING_RECEIVER_PRODUCT_ID = 0xC52B;
export const OPENLOGI_UNIFYING_NANO_RECEIVER_PRODUCT_ID = 0xC532;

/**
 * Parses Unifying receiver `0x41` device-connection events.
 *
 * Source: OpenLogi `receiver/unifying.rs:listen_to_device_connection`.
 */
export function parseOpenLogiUnifyingDeviceConnectionEvent(
    reportBytes: readonly number[],
): OpenLogiReceiverEventParseResult {
    const report = parseReceiverRegisterReport(reportBytes);
    if (report === undefined) {
        return parseEventMalformedOrUnrelated(reportBytes);
    }

    if (report.subId !== 0x41) {
        return { state: "unrelated" };
    }

    return mapUnifyingConnectionPayload(report.receiverSlot, report.payload);
}

/**
 * Parses Unifying device-kind values.
 *
 * Source: OpenLogi `receiver/unifying.rs:DeviceKind`.
 */
export function parseOpenLogiUnifyingDeviceKind(rawKind: number): OpenLogiReceiverDeviceKind | undefined {
    const commonKind = parseOpenLogiCommonReceiverDeviceKind(rawKind);
    if (commonKind !== undefined) {
        return commonKind;
    }

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

function mapUnifyingConnectionPayload(
    receiverSlot: number,
    payload: readonly number[],
): OpenLogiReceiverEventParseResult {
    const flags = payload[1];
    const rawKind = flags === undefined ? undefined : flags & 0x0F;
    const deviceKind = rawKind === undefined ? undefined : parseOpenLogiUnifyingDeviceKind(rawKind);
    if (rawKind === undefined || deviceKind === undefined) {
        return {
            state: rawKind === undefined ? "malformed" : "unsupported",
            rawKind: rawKind ?? 0,
        };
    }

    const connection: OpenLogiReceiverDeviceConnection = {
        receiverSlot,
        deviceKind,
        encrypted: (flags & (1 << 4)) !== 0,
        online: (flags & (1 << 6)) === 0,
        wirelessProductId: littleEndianUint16(payload[2], payload[3]),
    };

    return {
        state: "deviceConnection",
        connection,
    };
}

interface ReceiverRegisterReport {
    readonly receiverSlot: number;
    readonly subId: number;
    readonly payload: readonly number[];
}

function parseReceiverRegisterReport(reportBytes: readonly number[]): ReceiverRegisterReport | undefined {
    if (reportBytes[0] !== LOGITECH_HIDPP_SHORT_REPORT_ID && reportBytes[0] !== LOGITECH_HIDPP_LONG_REPORT_ID) {
        return undefined;
    }

    if (reportBytes.length !== 7 && reportBytes.length !== 20) {
        return undefined;
    }

    return {
        receiverSlot: reportBytes[1] ?? 0,
        subId: reportBytes[2] ?? 0,
        payload: reportBytes.slice(3),
    };
}

function parseEventMalformedOrUnrelated(reportBytes: readonly number[]): OpenLogiReceiverEventParseResult {
    if (reportBytes[0] === LOGITECH_HIDPP_SHORT_REPORT_ID || reportBytes[0] === LOGITECH_HIDPP_LONG_REPORT_ID) {
        return reportBytes.length === 7 || reportBytes.length === 20
            ? { state: "unrelated" }
            : { state: "malformed" };
    }

    return { state: "unrelated" };
}

function littleEndianUint16(lowByte: number | undefined, highByte: number | undefined): number {
    return ((highByte ?? 0) << 8) | (lowByte ?? 0);
}
