/**
 * HID++2.0 framing derived from OpenLogi.
 *
 * Source: OpenLogi
 * Files:
 * - `crates/openlogi-hidpp/src/protocol/v20.rs`
 * - `crates/openlogi-hidpp/src/nibble.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

import {
    LOGITECH_HIDPP_SHORT_REPORT_ID,
    type LogitechReceiverSlot,
} from "../../logitech-hidpp-frame";

export const OPENLOGI_HIDPP20_ERROR_FEATURE_INDEX = 0xFF;

export interface OpenLogiHidpp20MessageHeader {
    readonly deviceIndex: LogitechReceiverSlot;
    readonly featureIndex: number;
    readonly functionId: number;
    readonly softwareId: number;
}

/**
 * Combines two four-bit HID++ nibbles into one byte.
 *
 * Source: OpenLogi `nibble.rs:combine`.
 */
export function combineOpenLogiHidpp20Nibbles(highNibble: number, lowNibble: number): number {
    return ((highNibble & 0x0F) << 4) | (lowNibble & 0x0F);
}

/**
 * Parses the HID++2 message header from report-id-excluded bytes.
 *
 * Derived glue: extracts the header offsets used by OpenLogi
 * `protocol/v20.rs:impl From<HidppMessage> for Message`.
 */
export function parseOpenLogiHidpp20MessageHeader(
    messageBytes: readonly number[],
): OpenLogiHidpp20MessageHeader | undefined {
    if (messageBytes.length < 3) {
        return undefined;
    }

    const functionAndSoftwareId = messageBytes[2] ?? 0;
    return {
        deviceIndex: messageBytes[0] ?? 0,
        featureIndex: messageBytes[1] ?? 0,
        functionId: functionAndSoftwareId >> 4,
        softwareId: functionAndSoftwareId & 0x0F,
    };
}

/**
 * Builds the report-id-excluded HID++2 short message bytes.
 *
 * Source: OpenLogi `protocol/v20.rs:impl From<Message> for HidppMessage`.
 */
export function buildOpenLogiHidpp20ShortMessagePayload(input: {
    readonly header: OpenLogiHidpp20MessageHeader;
    readonly payload?: readonly number[];
}): readonly number[] {
    const payload = input.payload ?? [];
    return [
        input.header.deviceIndex,
        input.header.featureIndex,
        combineOpenLogiHidpp20Nibbles(input.header.functionId, input.header.softwareId),
        payload[0] ?? 0x00,
        payload[1] ?? 0x00,
        payload[2] ?? 0x00,
    ];
}

/**
 * Builds the report-id-prefixed HID++2 short message bytes.
 *
 * Derived glue: OpenLogi converts `Message::Short` to a report-id-excluded
 * `HidppMessage::Short`; ShoMetrics request bytes include the HID report id.
 */
export function buildOpenLogiHidpp20ShortReportBytes(input: {
    readonly header: OpenLogiHidpp20MessageHeader;
    readonly payload?: readonly number[];
}): readonly number[] {
    return [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        ...buildOpenLogiHidpp20ShortMessagePayload(input),
    ];
}

/**
 * Matches a HID++2 response header or the corresponding `0xff` feature error.
 *
 * Source: OpenLogi `protocol/v20.rs:HidppChannel::send_v20`.
 */
export function matchesOpenLogiHidpp20ResponseHeader(input: {
    readonly responseHeader: OpenLogiHidpp20MessageHeader;
    readonly responsePayload: readonly number[];
    readonly requestHeader: OpenLogiHidpp20MessageHeader;
}): boolean {
    if (openLogiHidpp20HeadersAreEqual(input.responseHeader, input.requestHeader)) {
        return true;
    }

    return input.responseHeader.deviceIndex === input.requestHeader.deviceIndex &&
        input.responseHeader.featureIndex === OPENLOGI_HIDPP20_ERROR_FEATURE_INDEX &&
        combineOpenLogiHidpp20Nibbles(input.responseHeader.functionId, input.responseHeader.softwareId) ===
            input.requestHeader.featureIndex &&
        (input.responsePayload[0] ?? 0) ===
            combineOpenLogiHidpp20Nibbles(input.requestHeader.functionId, input.requestHeader.softwareId);
}

/**
 * Reads the HID++2 feature error code from an error response payload.
 *
 * Source: OpenLogi `protocol/v20.rs:HidppChannel::send_v20`.
 */
export function readOpenLogiHidpp20FeatureErrorCode(responsePayload: readonly number[]): number | undefined {
    return responsePayload[1];
}

/**
 * Compares HID++2 message headers exactly.
 *
 * Source: OpenLogi `protocol/v20.rs:MessageHeader` derives `PartialEq`.
 */
export function openLogiHidpp20HeadersAreEqual(
    leftHeader: OpenLogiHidpp20MessageHeader,
    rightHeader: OpenLogiHidpp20MessageHeader,
): boolean {
    return leftHeader.deviceIndex === rightHeader.deviceIndex &&
        leftHeader.featureIndex === rightHeader.featureIndex &&
        leftHeader.functionId === rightHeader.functionId &&
        leftHeader.softwareId === rightHeader.softwareId;
}
