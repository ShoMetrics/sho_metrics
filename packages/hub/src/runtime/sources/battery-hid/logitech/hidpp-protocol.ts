/**
 * HID++2.0 protocol facts used by the Logitech battery reader.
 *
 * The framing, feature ids, function ids, and payload offsets are cross-checked
 * against local `scripts/battery/probe-logitech-current-state.mjs` runs plus
 * OpenLogi, Mouser, and Solaar references. Solaar-derived expression is kept
 * in `solaar-derived/`.
 */

import { estimateSolaarLogitechBatteryPercentFromVoltageMillivolts } from "./solaar-derived/solaar-logitech-battery-voltage";
import { OPENLOGI_BOLT_RECEIVER_PRODUCT_ID } from "./openlogi-derived/receiver/bolt";
import {
    OPENLOGI_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    OPENLOGI_UNIFYING_RECEIVER_PRODUCT_ID,
} from "./openlogi-derived/receiver/unifying";
import {
    OPENLOGI_HIDPP_CLASSIC_SHORT_USAGE,
    OPENLOGI_HIDPP_CLASSIC_USAGE_PAGE,
    OPENLOGI_LOGITECH_VENDOR_ID,
} from "./openlogi-derived/hid/transport";
import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "./logitech-hidpp-frame";
import {
    buildOpenLogiHidpp20ShortReportBytes,
    combineOpenLogiHidpp20Nibbles,
    matchesOpenLogiHidpp20ResponseHeader,
    openLogiHidpp20HeadersAreEqual,
    OPENLOGI_HIDPP20_ERROR_FEATURE_INDEX,
    parseOpenLogiHidpp20MessageHeader,
    readOpenLogiHidpp20FeatureErrorCode,
    type OpenLogiHidpp20MessageHeader,
} from "./openlogi-derived/protocol/v20";
import {
    buildOpenLogiRootGetFeatureRequestPayload,
    OPENLOGI_ROOT_FEATURE_ID,
    OPENLOGI_ROOT_FEATURE_INDEX,
    OPENLOGI_ROOT_GET_FEATURE_FUNCTION_ID,
    parseOpenLogiRootGetFeatureResponsePayload,
} from "./openlogi-derived/feature/root";
import {
    encodeOpenLogiBatteryLevel,
    OPENLOGI_UNIFIED_BATTERY_CAPABILITIES_FUNCTION_ID,
    OPENLOGI_UNIFIED_BATTERY_FEATURE_ID,
    OPENLOGI_UNIFIED_BATTERY_INFO_FUNCTION_ID,
    parseOpenLogiBatteryCapabilitiesPayload,
    parseOpenLogiBatteryInfoPayload,
    type OpenLogiBatteryLevel,
} from "./openlogi-derived/feature/unified-battery";
import type {
    LogitechHidppExpectedResponse,
    LogitechHidppRequest,
    LogitechReceiverSlot,
} from "./logitech-hidpp-frame";

export {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "./logitech-hidpp-frame";
export type {
    LogitechHidppExpectedResponse,
    LogitechHidppRequest,
    LogitechReceiverSlot,
} from "./logitech-hidpp-frame";

export const LOGITECH_HIDPP_VENDOR_ID = OPENLOGI_LOGITECH_VENDOR_ID;
export const LOGITECH_BOLT_RECEIVER_PRODUCT_ID = OPENLOGI_BOLT_RECEIVER_PRODUCT_ID;
export const LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID = OPENLOGI_UNIFYING_RECEIVER_PRODUCT_ID;
export const LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID = OPENLOGI_UNIFYING_NANO_RECEIVER_PRODUCT_ID;
export const LOGITECH_HIDPP_CLASSIC_USAGE_PAGE = OPENLOGI_HIDPP_CLASSIC_USAGE_PAGE;
export const LOGITECH_HIDPP_SHORT_USAGE = OPENLOGI_HIDPP_CLASSIC_SHORT_USAGE;

export const LOGITECH_HIDPP_ROOT_FEATURE_ID = OPENLOGI_ROOT_FEATURE_ID;
export const LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID = 0x0003;
export const LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID = 0x1000;
export const LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID = 0x1001;
export const LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID = OPENLOGI_UNIFIED_BATTERY_FEATURE_ID;

export const LOGITECH_HIDPP_MAX_RECEIVER_SLOT = 6;

const HIDPP2_SOFTWARE_ID = 0x01;
const BATTERY_STATUS_READ_FUNCTION_ID = 0x00;
const BATTERY_VOLTAGE_READ_FUNCTION_ID = 0x00;
const DEVICE_INFORMATION_READ_FUNCTION_ID = 0x00;

export interface LogitechHidppReport {
    readonly reportId: number | undefined;
    readonly receiverSlot: LogitechReceiverSlot;
    readonly featureIndex: number;
    readonly functionByte: number;
    readonly functionId: number;
    readonly softwareId: number;
    readonly payload: readonly number[];
}

export interface LogitechHidppFeatureLookup {
    readonly featureId: number;
    readonly featureIndex: number;
    readonly featureVersion: number;
}

export type LogitechHidppFeatureLookupParseResult =
    | {
        readonly state: "supported";
        readonly feature: LogitechHidppFeatureLookup;
    }
    | {
        readonly state: "unsupported";
        readonly featureId: number;
    }
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "malformed";
    };

export interface LogitechBatteryReading {
    readonly percent: number;
    readonly percentSource: "reported" | "voltageEstimated";
    readonly featureId: number;
    readonly statusByte: number;
    readonly nextPercent?: number;
    readonly approximateLevelByte?: number;
    readonly voltageMillivolts?: number;
}

export type LogitechBatteryParseResult =
    | {
        readonly state: "battery";
        readonly reading: LogitechBatteryReading;
    }
    | {
        readonly state: "noData";
        readonly reason: "noPercentage" | "outOfRange";
    }
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "malformed";
    };

export interface LogitechUnifiedBatteryCapabilities {
    readonly supportsPercentage: boolean;
    readonly isRechargeable: boolean;
    readonly reportedLevelMask: number;
}

export type LogitechUnifiedBatteryCapabilitiesParseResult =
    | {
        readonly state: "capabilities";
        readonly capabilities: LogitechUnifiedBatteryCapabilities;
    }
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "malformed";
    };

export interface LogitechDeviceInformation {
    readonly unitId?: string;
    readonly modelId?: string;
    readonly entityCount: number;
    readonly transportFlags: number;
    readonly extendedModelId: number;
    readonly hasSerialNumberFunction: boolean;
}

export type LogitechDeviceInformationParseResult =
    | {
        readonly state: "deviceInformation";
        readonly deviceInformation: LogitechDeviceInformation;
    }
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "malformed";
    };

export function buildLogitechFeatureLookupRequest(
    receiverSlot: LogitechReceiverSlot,
    featureId: number,
): LogitechHidppRequest {
    return buildLogitechShortFeatureRequest({
        receiverSlot,
        featureIndex: OPENLOGI_ROOT_FEATURE_INDEX,
        functionId: OPENLOGI_ROOT_GET_FEATURE_FUNCTION_ID,
        softwareId: HIDPP2_SOFTWARE_ID,
        parameters: buildOpenLogiRootGetFeatureRequestPayload(featureId),
    });
}

export function buildLogitechBatteryStatusRequest(
    receiverSlot: LogitechReceiverSlot,
    featureIndex: number,
): LogitechHidppRequest {
    return buildLogitechShortFeatureRequest({
        receiverSlot,
        featureIndex,
        functionId: BATTERY_STATUS_READ_FUNCTION_ID,
    });
}

export function buildLogitechBatteryVoltageRequest(
    receiverSlot: LogitechReceiverSlot,
    featureIndex: number,
): LogitechHidppRequest {
    return buildLogitechShortFeatureRequest({
        receiverSlot,
        featureIndex,
        functionId: BATTERY_VOLTAGE_READ_FUNCTION_ID,
    });
}

export function buildLogitechUnifiedBatteryCapabilitiesRequest(
    receiverSlot: LogitechReceiverSlot,
    featureIndex: number,
): LogitechHidppRequest {
    return buildLogitechShortFeatureRequest({
        receiverSlot,
        featureIndex,
        functionId: OPENLOGI_UNIFIED_BATTERY_CAPABILITIES_FUNCTION_ID,
    });
}

export function buildLogitechUnifiedBatteryInfoRequest(
    receiverSlot: LogitechReceiverSlot,
    featureIndex: number,
): LogitechHidppRequest {
    return buildLogitechShortFeatureRequest({
        receiverSlot,
        featureIndex,
        functionId: OPENLOGI_UNIFIED_BATTERY_INFO_FUNCTION_ID,
    });
}

export function buildLogitechDeviceInformationRequest(
    receiverSlot: LogitechReceiverSlot,
    featureIndex: number,
): LogitechHidppRequest {
    return buildLogitechShortFeatureRequest({
        receiverSlot,
        featureIndex,
        functionId: DEVICE_INFORMATION_READ_FUNCTION_ID,
    });
}

export function parseLogitechHidppReport(bytes: readonly number[]): LogitechHidppReport | undefined {
    // Native HID reads can return reports with or without the report id byte depending
    // on platform/path. Normalize both shapes to the same HID++ header:
    // receiver slot, feature index, function/software byte, then payload.
    const hasReportId = bytes[0] === LOGITECH_HIDPP_SHORT_REPORT_ID ||
        bytes[0] === LOGITECH_HIDPP_LONG_REPORT_ID;
    const headerOffset = hasReportId ? 1 : 0;
    if (bytes.length < headerOffset + 3) {
        return undefined;
    }

    const messageBytes = bytes.slice(headerOffset);
    const header = parseOpenLogiHidpp20MessageHeader(messageBytes);
    if (header === undefined) {
        return undefined;
    }

    const functionByte = combineOpenLogiHidpp20Nibbles(header.functionId, header.softwareId);
    return {
        reportId: hasReportId ? bytes[0] : undefined,
        receiverSlot: header.deviceIndex,
        featureIndex: header.featureIndex,
        functionByte,
        functionId: header.functionId,
        softwareId: header.softwareId,
        payload: bytes.slice(headerOffset + 3),
    };
}

export function matchesLogitechHidppExpectedResponse(
    bytes: readonly number[],
    expectedResponse: LogitechHidppExpectedResponse,
): boolean {
    const report = parseLogitechHidppReport(bytes);
    return report !== undefined && matchesExpectedReport(report, expectedResponse);
}

export function parseLogitechHidppErrorCode(
    bytes: readonly number[],
    expectedResponse: LogitechHidppExpectedResponse,
): number | undefined {
    const report = parseLogitechHidppReport(bytes);
    if (report === undefined ||
        report.featureIndex !== OPENLOGI_HIDPP20_ERROR_FEATURE_INDEX ||
        !matchesOpenLogiHidpp20ResponseHeader({
            responseHeader: reportToOpenLogiHeader(report),
            responsePayload: report.payload,
            requestHeader: expectedResponseToOpenLogiHeader(expectedResponse),
        })) {
        return undefined;
    }

    return readOpenLogiHidpp20FeatureErrorCode(report.payload);
}

export function parseLogitechFeatureLookupReport(
    bytes: readonly number[],
    receiverSlot: LogitechReceiverSlot,
    featureId: number,
): LogitechHidppFeatureLookupParseResult {
    const report = parseLogitechHidppReport(bytes);
    if (report === undefined) {
        return { state: "malformed" };
    }

    if (!matchesExpectedReport(report, buildLogitechFeatureLookupRequest(receiverSlot, featureId).expectedResponse)) {
        return { state: "unrelated" };
    }

    if (report.payload.length < 3) {
        return { state: "malformed" };
    }

    const featureInformation = parseOpenLogiRootGetFeatureResponsePayload(report.payload);
    if (featureInformation === undefined) {
        return { state: "unsupported", featureId };
    }

    return {
        state: "supported",
        feature: {
            featureId,
            featureIndex: featureInformation.index,
            featureVersion: featureInformation.version,
        },
    };
}

export function parseLogitechBatteryStatusReport(
    bytes: readonly number[],
    expectedResponse: LogitechHidppExpectedResponse,
): LogitechBatteryParseResult {
    const report = parseStrictMatchingReport(bytes, expectedResponse);
    if (report === undefined) {
        return { state: "unrelated" };
    }

    if (report.payload.length < 3) {
        return { state: "malformed" };
    }

    // BATTERY_STATUS 0x1000 payload starts with the current percentage, then
    // next lower threshold, then status. Zero means "no percentage available"
    // on this older feature, so v1 does not invent a percentage.
    const percent = report.payload[0];
    if (percent === 0) {
        return { state: "noData", reason: "noPercentage" };
    }

    if (!isBatteryPercent(percent)) {
        return { state: "noData", reason: "outOfRange" };
    }

    const nextPercentByte = report.payload[1];
    return {
        state: "battery",
        reading: {
            featureId: LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID,
            percent,
            percentSource: "reported",
            nextPercent: isBatteryPercent(nextPercentByte) && nextPercentByte > 0 ? nextPercentByte : undefined,
            statusByte: report.payload[2],
        },
    };
}

export function parseLogitechBatteryVoltageReport(
    bytes: readonly number[],
    expectedResponse: LogitechHidppExpectedResponse,
): LogitechBatteryParseResult {
    const report = parseStrictMatchingReport(bytes, expectedResponse);
    if (report === undefined) {
        return { state: "unrelated" };
    }

    if (report.payload.length < 3) {
        return { state: "malformed" };
    }

    // BATTERY_VOLTAGE 0x1001 reports a raw millivolt value and flags, not an
    // explicit percentage. The percentage is a Solaar-derived estimate and is
    // preserved as a different source so UI can warn users.
    const voltageMillivolts = (report.payload[0] << 8) | report.payload[1];
    const percent = estimateSolaarLogitechBatteryPercentFromVoltageMillivolts(voltageMillivolts);
    if (!isBatteryPercent(percent)) {
        return { state: "noData", reason: "outOfRange" };
    }

    return {
        state: "battery",
        reading: {
            featureId: LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID,
            percent,
            percentSource: "voltageEstimated",
            statusByte: report.payload[2],
            voltageMillivolts,
        },
    };
}

export function parseLogitechUnifiedBatteryCapabilitiesReport(
    bytes: readonly number[],
    expectedResponse: LogitechHidppExpectedResponse,
): LogitechUnifiedBatteryCapabilitiesParseResult {
    const report = parseStrictMatchingReport(bytes, expectedResponse);
    if (report === undefined) {
        return { state: "unrelated" };
    }

    if (report.payload.length < 2) {
        return { state: "malformed" };
    }

    const capabilities = parseOpenLogiBatteryCapabilitiesPayload(report.payload);
    return {
        state: "capabilities",
        capabilities: {
            reportedLevelMask: encodeOpenLogiBatteryLevelMask(capabilities.reportedLevels),
            isRechargeable: capabilities.rechargeable,
            supportsPercentage: capabilities.percentage,
        },
    };
}

export function parseLogitechUnifiedBatteryInfoReport(
    bytes: readonly number[],
    expectedResponse: LogitechHidppExpectedResponse,
    capabilities: LogitechUnifiedBatteryCapabilities,
): LogitechBatteryParseResult {
    const report = parseStrictMatchingReport(bytes, expectedResponse);
    if (report === undefined) {
        return { state: "unrelated" };
    }

    if (report.payload.length < 3) {
        return { state: "malformed" };
    }

    if (!capabilities.supportsPercentage) {
        return { state: "noData", reason: "noPercentage" };
    }

    const batteryInfo = parseOpenLogiBatteryInfoPayload(report.payload);
    const percent = batteryInfo.chargingPercentage;
    if (!isBatteryPercent(percent)) {
        return { state: "noData", reason: "outOfRange" };
    }

    return {
        state: "battery",
        reading: {
            featureId: LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
            percent,
            percentSource: "reported",
            approximateLevelByte: batteryInfo.levelByte,
            statusByte: batteryInfo.statusByte,
        },
    };
}

export function parseLogitechDeviceInformationReport(
    bytes: readonly number[],
    expectedResponse: LogitechHidppExpectedResponse,
): LogitechDeviceInformationParseResult {
    const report = parseStrictMatchingReport(bytes, expectedResponse);
    if (report === undefined) {
        return { state: "unrelated" };
    }

    if (report.payload.length < 15) {
        return { state: "malformed" };
    }

    // DEVICE_INFORMATION function 0x00 exposes a unit id and transport PIDs.
    // The unit id is the only Logitech value currently trusted as per-unit
    // identity; raw HID serial strings are not upgraded here.
    return {
        state: "deviceInformation",
        deviceInformation: {
            entityCount: report.payload[0],
            unitId: formatNonZeroHexBytes(report.payload.slice(1, 5)),
            transportFlags: report.payload[6],
            modelId: formatLogitechModelId(report.payload.slice(7, 13), report.payload[13]),
            extendedModelId: report.payload[13],
            hasSerialNumberFunction: (report.payload[14] & 0x01) !== 0,
        },
    };
}

function buildLogitechShortFeatureRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly featureIndex: number;
    readonly functionId: number;
    readonly softwareId?: number;
    readonly parameters?: readonly number[];
}): LogitechHidppRequest {
    const softwareId = input.softwareId ?? HIDPP2_SOFTWARE_ID;
    const functionByte = combineOpenLogiHidpp20Nibbles(input.functionId, softwareId);
    const parameters = input.parameters ?? [];
    const bytes = buildOpenLogiHidpp20ShortReportBytes({
        header: {
            deviceIndex: input.receiverSlot,
            featureIndex: input.featureIndex,
            functionId: input.functionId,
            softwareId,
        },
        payload: parameters,
    });

    return {
        bytes,
        expectedResponse: {
            receiverSlot: input.receiverSlot,
            featureIndex: input.featureIndex,
            functionByte,
        },
    };
}

function parseStrictMatchingReport(
    bytes: readonly number[],
    expectedResponse: LogitechHidppExpectedResponse,
): LogitechHidppReport | undefined {
    const report = parseLogitechHidppReport(bytes);
    return report !== undefined && matchesExpectedReport(report, expectedResponse)
        ? report
        : undefined;
}

function matchesExpectedReport(
    report: LogitechHidppReport,
    expectedResponse: LogitechHidppExpectedResponse,
): boolean {
    return openLogiHidpp20HeadersAreEqual(
        reportToOpenLogiHeader(report),
        expectedResponseToOpenLogiHeader(expectedResponse),
    );
}

function reportToOpenLogiHeader(report: LogitechHidppReport): OpenLogiHidpp20MessageHeader {
    return {
        deviceIndex: report.receiverSlot,
        featureIndex: report.featureIndex,
        functionId: report.functionId,
        softwareId: report.softwareId,
    };
}

function expectedResponseToOpenLogiHeader(
    expectedResponse: LogitechHidppExpectedResponse,
): OpenLogiHidpp20MessageHeader {
    return {
        deviceIndex: expectedResponse.receiverSlot,
        featureIndex: expectedResponse.featureIndex,
        functionId: expectedResponse.functionByte >> 4,
        softwareId: expectedResponse.functionByte & 0x0F,
    };
}

function isBatteryPercent(value: number): boolean {
    return value >= 0 && value <= 100;
}

function encodeOpenLogiBatteryLevelMask(reportedLevels: ReadonlySet<OpenLogiBatteryLevel>): number {
    let mask = 0;
    for (const level of reportedLevels) {
        mask |= encodeOpenLogiBatteryLevel(level);
    }

    return mask;
}

function formatNonZeroHexBytes(bytes: readonly number[]): string | undefined {
    if (bytes.every(value => value === 0)) {
        return undefined;
    }

    return bytes
        .map(value => value.toString(16).padStart(2, "0"))
        .join("");
}

function formatLogitechModelId(
    modelBytes: readonly number[],
    extendedModelId: number,
): string | undefined {
    if (modelBytes.length < 6 || (modelBytes.every(value => value === 0) && extendedModelId === 0)) {
        return undefined;
    }

    const transportPidParts = [
        formatU16(modelBytes[0], modelBytes[1]),
        formatU16(modelBytes[2], modelBytes[3]),
        formatU16(modelBytes[4], modelBytes[5]),
    ];

    return `logitech:${transportPidParts.join("-")}:ext-${extendedModelId.toString(16).padStart(2, "0")}`;
}

function formatU16(highByte: number, lowByte: number): string {
    return ((highByte << 8) | lowByte).toString(16).padStart(4, "0");
}
