/**
 * HID++2.0 protocol facts used by the Logitech battery reader.
 *
 * The framing, feature ids, function ids, and payload offsets are cross-checked
 * against local `scripts/battery/probe-logitech-current-state.mjs` runs plus
 * OpenLogi and Mouser references. No reference implementation code is copied
 * here.
 */

export const LOGITECH_HIDPP_VENDOR_ID = 0x046D;
export const LOGITECH_BOLT_RECEIVER_PRODUCT_ID = 0xC548;
export const LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID = 0xC52B;
export const LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID = 0xC532;
export const LOGITECH_HIDPP_CLASSIC_USAGE_PAGE = 0xFF00;
export const LOGITECH_HIDPP_SHORT_USAGE = 0x0001;

export const LOGITECH_HIDPP_ROOT_FEATURE_ID = 0x0000;
export const LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID = 0x0003;
export const LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID = 0x1000;
export const LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID = 0x1004;

export const LOGITECH_HIDPP_SHORT_REPORT_ID = 0x10;
export const LOGITECH_HIDPP_LONG_REPORT_ID = 0x11;
export const LOGITECH_HIDPP_MAX_RECEIVER_SLOT = 6;

const HIDPP_ROOT_FEATURE_INDEX = 0x00;
const ROOT_GET_FEATURE_FUNCTION_ID = 0x00;
const HIDPP2_SOFTWARE_ID = 0x01;
const BATTERY_STATUS_READ_FUNCTION_ID = 0x00;
const UNIFIED_BATTERY_CAPABILITIES_FUNCTION_ID = 0x00;
const UNIFIED_BATTERY_INFO_FUNCTION_ID = 0x01;
const DEVICE_INFORMATION_READ_FUNCTION_ID = 0x00;
const HIDPP_ERROR_FEATURE_INDEX = 0xFF;

/** HID++ receiver paired-device slot, called device index in HID++ framing. */
export type LogitechReceiverSlot = number;

export interface LogitechHidppRequest {
    readonly bytes: readonly number[];
    readonly expectedResponse: LogitechHidppExpectedResponse;
}

/** Strict response header expected for one HID++ request. */
export interface LogitechHidppExpectedResponse {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly featureIndex: number;
    readonly functionByte: number;
}

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
    readonly featureType: number;
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
    readonly featureId: number;
    readonly statusByte: number;
    readonly nextPercent?: number;
    readonly approximateLevelByte?: number;
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
        featureIndex: HIDPP_ROOT_FEATURE_INDEX,
        functionId: ROOT_GET_FEATURE_FUNCTION_ID,
        softwareId: HIDPP2_SOFTWARE_ID,
        parameters: [(featureId >> 8) & 0xFF, featureId & 0xFF, 0x00],
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

export function buildLogitechUnifiedBatteryCapabilitiesRequest(
    receiverSlot: LogitechReceiverSlot,
    featureIndex: number,
): LogitechHidppRequest {
    return buildLogitechShortFeatureRequest({
        receiverSlot,
        featureIndex,
        functionId: UNIFIED_BATTERY_CAPABILITIES_FUNCTION_ID,
    });
}

export function buildLogitechUnifiedBatteryInfoRequest(
    receiverSlot: LogitechReceiverSlot,
    featureIndex: number,
): LogitechHidppRequest {
    return buildLogitechShortFeatureRequest({
        receiverSlot,
        featureIndex,
        functionId: UNIFIED_BATTERY_INFO_FUNCTION_ID,
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

    const functionByte = bytes[headerOffset + 2];
    return {
        reportId: hasReportId ? bytes[0] : undefined,
        receiverSlot: bytes[headerOffset],
        featureIndex: bytes[headerOffset + 1],
        functionByte,
        functionId: functionByte >> 4,
        softwareId: functionByte & 0x0F,
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
    // HID++ errors use feature index 0xFF. The first payload byte echoes the
    // function byte that failed, so match it against the pending request before
    // treating the report as this transaction's device error.
    const report = parseLogitechHidppReport(bytes);
    if (report === undefined ||
        report.receiverSlot !== expectedResponse.receiverSlot ||
        report.featureIndex !== HIDPP_ERROR_FEATURE_INDEX ||
        report.functionByte !== expectedResponse.featureIndex ||
        report.payload[0] !== expectedResponse.functionByte) {
        return undefined;
    }

    return report.payload[1];
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

    // Root.getFeature returns index/type/version for a supported feature. A
    // zero index is the HID++ "feature not present" response, not malformed.
    const featureIndex = report.payload[0];
    if (featureIndex === 0) {
        return { state: "unsupported", featureId };
    }

    return {
        state: "supported",
        feature: {
            featureId,
            featureIndex,
            featureType: report.payload[1],
            featureVersion: report.payload[2],
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
            nextPercent: isBatteryPercent(nextPercentByte) && nextPercentByte > 0 ? nextPercentByte : undefined,
            statusByte: report.payload[2],
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

    // UNIFIED_BATTERY 0x1004 gates percentage parsing through capabilities.
    // Devices that only expose approximate levels are handled as no-data for
    // percent until a tested conversion exists.
    return {
        state: "capabilities",
        capabilities: {
            reportedLevelMask: report.payload[0],
            isRechargeable: (report.payload[1] & 0x01) !== 0,
            supportsPercentage: (report.payload[1] & 0x02) !== 0,
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

    const percent = report.payload[0];
    if (!isBatteryPercent(percent)) {
        return { state: "noData", reason: "outOfRange" };
    }

    return {
        state: "battery",
        reading: {
            featureId: LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
            percent,
            approximateLevelByte: report.payload[1],
            statusByte: report.payload[2],
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
    // HID++2.0 requests carry a four-bit software id. OpenLogi uses 1 for all
    // application-originated requests; using the same id avoids devices treating
    // later feature reads differently from the Root lookup.
    const functionByte = ((input.functionId & 0x0F) << 4) | ((input.softwareId ?? HIDPP2_SOFTWARE_ID) & 0x0F);
    const parameters = input.parameters ?? [];
    const bytes = [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        input.receiverSlot,
        input.featureIndex,
        functionByte,
        parameters[0] ?? 0x00,
        parameters[1] ?? 0x00,
        parameters[2] ?? 0x00,
    ];

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
    return report.receiverSlot === expectedResponse.receiverSlot &&
        report.featureIndex === expectedResponse.featureIndex &&
        report.functionByte === expectedResponse.functionByte;
}

function isBatteryPercent(value: number): boolean {
    return value >= 0 && value <= 100;
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
