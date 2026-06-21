/**
 * HID++1.0 RAP register framing derived from OpenLogi.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/protocol/v10.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
    type LogitechHidppRequest,
    type LogitechReceiverSlot,
} from "../../logitech-hidpp-frame";

export const OPENLOGI_HIDPP10_SET_REGISTER_SUB_ID = 0x80;
export const OPENLOGI_HIDPP10_GET_LONG_REGISTER_SUB_ID = 0x83;
export const OPENLOGI_HIDPP10_ERROR_SUB_ID = 0x8F;

export interface OpenLogiHidpp10RegisterResponse {
    readonly state: "register";
    readonly payload: readonly number[];
}

export interface OpenLogiHidpp10RegisterAccessError {
    readonly state: "registerError";
    readonly errorCode: number;
}

export type OpenLogiHidpp10RegisterParseResult =
    | OpenLogiHidpp10RegisterResponse
    | OpenLogiHidpp10RegisterAccessError
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "malformed";
    };

export interface OpenLogiHidpp10Report {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly subId: number;
    readonly payload: readonly number[];
}

export type OpenLogiHidpp10ReportShape =
    | "valid"
    | "malformed"
    | "unrelated";

interface OpenLogiHidpp10RegisterReport extends OpenLogiHidpp10Report {
    readonly registerAddress?: number;
}

/**
 * Builds a HID++1.0 set-register request.
 *
 * Source: OpenLogi `protocol/v10.rs:write_register`.
 */
export function buildOpenLogiHidpp10SetRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly registerAddress: number;
    readonly parameters?: readonly number[];
}): LogitechHidppRequest {
    return buildOpenLogiHidpp10RegisterRequest({
        receiverSlot: input.receiverSlot,
        subId: OPENLOGI_HIDPP10_SET_REGISTER_SUB_ID,
        registerAddress: input.registerAddress,
        parameters: input.parameters,
    });
}

/**
 * Builds a HID++1.0 get-long-register request.
 *
 * Source: OpenLogi `protocol/v10.rs:read_long_register`.
 */
export function buildOpenLogiHidpp10GetLongRegisterRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly registerAddress: number;
    readonly parameters?: readonly number[];
}): LogitechHidppRequest {
    return buildOpenLogiHidpp10RegisterRequest({
        receiverSlot: input.receiverSlot,
        subId: OPENLOGI_HIDPP10_GET_LONG_REGISTER_SUB_ID,
        registerAddress: input.registerAddress,
        parameters: input.parameters,
    });
}

/**
 * Parses a HID++1.0/RAP register response for the given request.
 *
 * Source: OpenLogi `protocol/v10.rs:is_rap_response`, `read_register`,
 * and `read_long_register`.
 */
export function parseOpenLogiHidpp10RegisterResponse(
    reportBytes: readonly number[],
    request: LogitechHidppRequest,
): OpenLogiHidpp10RegisterParseResult {
    const requestReport = parseOpenLogiHidpp10RegisterReport(request.bytes);
    const responseReport = parseOpenLogiHidpp10RegisterReport(reportBytes);
    if (requestReport === undefined || responseReport === undefined) {
        return parseRegisterMalformedOrUnrelated(reportBytes);
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

/**
 * Splits a raw HID++1.0 report into the header/payload shape used by OpenLogi receiver listeners.
 *
 * Derived glue: extracted from OpenLogi `v10::Message::from(raw)`
 * usage in `receiver/bolt.rs` and `receiver/unifying.rs`; OpenLogi has no
 * direct function with this name.
 */
export function parseOpenLogiHidpp10Report(reportBytes: readonly number[]): OpenLogiHidpp10Report | undefined {
    if (classifyOpenLogiHidpp10ReportShape(reportBytes) !== "valid") {
        return undefined;
    }

    return {
        receiverSlot: reportBytes[1] ?? 0,
        subId: reportBytes[2] ?? 0,
        payload: reportBytes.slice(3),
    };
}

/**
 * Classifies whether a raw report belongs to HID++1.0 framing.
 *
 * Derived glue: extracted from OpenLogi listener and register
 * response matching. OpenLogi expresses this through `v10::Message::from(raw)`
 * plus listener-level filtering rather than a standalone helper.
 */
export function classifyOpenLogiHidpp10ReportShape(reportBytes: readonly number[]): OpenLogiHidpp10ReportShape {
    if (reportBytes[0] !== LOGITECH_HIDPP_SHORT_REPORT_ID && reportBytes[0] !== LOGITECH_HIDPP_LONG_REPORT_ID) {
        return "unrelated";
    }

    return reportBytes.length === 7 || reportBytes.length === 20
        ? "valid"
        : "malformed";
}

function buildOpenLogiHidpp10RegisterRequest(input: {
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

function parseOpenLogiHidpp10RegisterReport(reportBytes: readonly number[]): OpenLogiHidpp10RegisterReport | undefined {
    const report = parseOpenLogiHidpp10Report(reportBytes);
    if (report === undefined) {
        return undefined;
    }

    return {
        ...report,
        registerAddress: reportBytes[3],
    };
}

function parseRegisterMalformedOrUnrelated(reportBytes: readonly number[]): OpenLogiHidpp10RegisterParseResult {
    if (classifyOpenLogiHidpp10ReportShape(reportBytes) === "malformed") {
        return { state: "malformed" };
    }

    return { state: "unrelated" };
}
