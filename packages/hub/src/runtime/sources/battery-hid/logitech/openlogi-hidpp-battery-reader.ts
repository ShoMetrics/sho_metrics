/**
 * OpenLogi-isomorphic Logitech HID++ battery probing.
 *
 * Source: OpenLogi
 * Files:
 * - `crates/openlogi-hidpp/src/protocol/mod.rs`
 * - `crates/openlogi-hidpp/src/protocol/v20.rs`
 * - `crates/openlogi-hidpp/src/feature/root.rs`
 * - `crates/openlogi-hidpp/src/feature/feature_set/mod.rs`
 * - `crates/openlogi-hidpp/src/feature/unified_battery/mod.rs`
 * - `crates/openlogi-hidpp/src/feature/device_information/mod.rs`
 * - `crates/openlogi-hid/src/transport.rs`
 * - `crates/openlogi-hid/src/route.rs`
 * - `crates/openlogi-hid/src/inventory.rs`
 * - `crates/openlogi-hid/src/mappings.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 *
 * This file intentionally does not include ShoMetrics local HID++ extensions
 * such as BatteryStatus `0x1000` or ChangeHost `0x1814`.
 */

import {
    LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID,
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_ROOT_FEATURE_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
    LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
    type LogitechReceiverSlot,
} from "./hidpp-protocol";
import { monotonicNowMilliseconds } from "../../../../shared/clock";

export const OPENLOGI_HIDPP_RESPONSE_TIMEOUT_MILLISECONDS = 5_000;

const OPENLOGI_HIDPP_FEATURE_SET_FEATURE_ID = 0x0001;
const OPENLOGI_HIDPP_ROOT_FEATURE_INDEX = 0x00;
const OPENLOGI_HIDPP_ROOT_GET_FEATURE_FUNCTION_ID = 0x00;
const OPENLOGI_HIDPP_ROOT_PING_FUNCTION_ID = 0x01;
const OPENLOGI_HIDPP_FEATURE_SET_COUNT_FUNCTION_ID = 0x00;
const OPENLOGI_HIDPP_FEATURE_SET_GET_FEATURE_FUNCTION_ID = 0x01;
const OPENLOGI_HIDPP_UNIFIED_BATTERY_INFO_FUNCTION_ID = 0x01;
const OPENLOGI_HIDPP_DEVICE_INFORMATION_READ_FUNCTION_ID = 0x00;
const OPENLOGI_HIDPP_DEVICE_INFORMATION_SERIAL_FUNCTION_ID = 0x02;
const OPENLOGI_HIDPP_DEVICE_TYPE_AND_NAME_FEATURE_ID = 0x0005;
const OPENLOGI_HIDPP_DEVICE_TYPE_READ_FUNCTION_ID = 0x02;
const OPENLOGI_HIDPP_DEFAULT_SOFTWARE_ID = 0x01;
const OPENLOGI_HIDPP10_ERROR_SUB_ID = 0x8F;
const OPENLOGI_HIDPP10_INVALID_SUB_ID_ERROR = 0x01;

export interface OpenLogiHidppTransport {
    exchange(request: OpenLogiHidppRequest): OpenLogiHidppExchangeResult;
}

export interface OpenLogiHidppRequest {
    readonly bytes: readonly number[];
    readonly expectedResponse: OpenLogiHidppExpectedResponse;
    readonly timeoutMilliseconds: number;
}

export interface OpenLogiHidppExpectedResponse {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly featureIndex: number;
    readonly functionByte: number;
}

export type OpenLogiHidppExchangeResult =
    | {
        readonly state: "response";
        readonly report: readonly number[];
    }
    | {
        readonly state: "deviceError";
        readonly errorCode: number;
    }
    | {
        readonly state: "timeout";
    }
    | {
        readonly state: "ioError";
        readonly error: unknown;
    };

export interface OpenLogiHidppFeatureInformation {
    readonly featureId: number;
    readonly featureIndex: number;
    readonly featureType: number;
    readonly featureVersion: number;
}

export type OpenLogiHidppBatteryLevel = "critical" | "low" | "good" | "full";
export type OpenLogiHidppBatteryStatus =
    | "discharging"
    | "charging"
    | "chargingSlow"
    | "full"
    | "error";

export interface OpenLogiHidppBatteryInfo {
    readonly percentage: number;
    readonly level: OpenLogiHidppBatteryLevel;
    readonly status: OpenLogiHidppBatteryStatus;
}

export interface OpenLogiHidppDeviceInformation {
    readonly entityCount: number;
    readonly serialNumber?: string;
    /** Four-byte random per-unit id used by OpenLogi to distinguish same-model devices. */
    readonly unitId: readonly number[];
    readonly transportFlags: number;
    /** Transport-specific model ids reported by `DeviceInformation 0x0003`. */
    readonly modelIds: readonly number[];
    readonly extendedModelId: number;
}

export type OpenLogiDeviceKind =
    | "mouse"
    | "keyboard"
    | "numpad"
    | "presenter"
    | "remote"
    | "trackball"
    | "touchpad"
    | "gamepad"
    | "joystick"
    | "headset"
    | "unknown";

export interface OpenLogiDeviceCapabilities {
    readonly buttons: boolean;
    readonly pointer: boolean;
    readonly lighting: boolean;
}

export interface OpenLogiHidppProbedFeatures {
    readonly battery?: OpenLogiHidppBatteryInfo;
    readonly deviceInformation?: OpenLogiHidppDeviceInformation;
    readonly deviceKind?: OpenLogiDeviceKind;
    /** Coarse feature-family flags used by OpenLogi to reject receiver-only direct nodes. */
    readonly capabilities?: OpenLogiDeviceCapabilities;
    /** Completed feature-table walk. Presence means immutable probe data is cacheable. */
    readonly featureIds?: readonly number[];
    readonly batteryFeatureIndex?: number;
}

export type OpenLogiHidppProbeFailure = Extract<OpenLogiHidppBatteryProbeResult, { readonly state: "noData" }>;

export type OpenLogiHidppBatteryProbeResult =
    | {
        readonly state: "probe";
        readonly probe: OpenLogiHidppProbedFeatures;
    }
    | {
        readonly state: "unsupported";
    }
    | {
        readonly state: "noData";
        readonly reason: "timeout" | "deviceError" | "malformed" | "unsupportedProtocol" | "ioError";
    };

/** Performs the OpenLogi HID++2.0 battery feature walk for one route. */
export class OpenLogiHidppBatterySession {
    constructor(
        private readonly transport: OpenLogiHidppTransport,
        private readonly monotonicNow = monotonicNowMilliseconds,
    ) {}

    probeFeatures(
        receiverSlot: LogitechReceiverSlot,
        timeoutMilliseconds?: number,
    ): OpenLogiHidppBatteryProbeResult {
        const deadlineMilliseconds = this.buildDeadlineMilliseconds(timeoutMilliseconds);
        // OpenLogi first pings Root to reject HID++1.0-only devices before
        // walking the HID++2.0 feature table.
        const protocol = this.determineProtocolVersion(receiverSlot, deadlineMilliseconds);
        if (protocol.state !== "v20") {
            return protocol.state === "noData"
                ? protocol
                : { state: "noData", reason: "unsupportedProtocol" };
        }

        const featureSetFeature = this.readRootFeature(
            receiverSlot,
            OPENLOGI_HIDPP_FEATURE_SET_FEATURE_ID,
            deadlineMilliseconds,
        );
        if (featureSetFeature.state !== "feature") {
            return featureSetFeature.state === "unsupported"
                ? { state: "unsupported" }
                : featureSetFeature;
        }

        const featureTable = this.enumerateFeatureSet(
            receiverSlot,
            featureSetFeature.feature.featureIndex,
            deadlineMilliseconds,
        );
        if (featureTable.state !== "features") {
            return featureTable;
        }

        const batteryFeatureIndex = openLogiBatteryFeatureIndex(featureTable.features.map(feature => feature.featureId));
        // OpenLogi's baseline reader only uses UnifiedBattery `0x1004`; ShoMetrics'
        // separate Logitech reader adds local fallbacks such as BatteryStatus `0x1000`.
        const battery = batteryFeatureIndex === undefined
            ? undefined
            : this.readBatteryInfoWithDeadline(receiverSlot, batteryFeatureIndex, deadlineMilliseconds);

        const deviceInformationFeature = featureTable.features.find(feature =>
            feature.featureId === LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID,
        );
        const deviceInformation = deviceInformationFeature === undefined
            ? undefined
            : this.readDeviceInformation(receiverSlot, deviceInformationFeature.featureIndex, deadlineMilliseconds);
        const deviceKindFeature = featureTable.features.find(feature =>
            feature.featureId === OPENLOGI_HIDPP_DEVICE_TYPE_AND_NAME_FEATURE_ID,
        );
        const deviceKind = deviceKindFeature === undefined
            ? undefined
            : this.readDeviceKind(receiverSlot, deviceKindFeature.featureIndex, deadlineMilliseconds);
        const featureIds = featureTable.features.map(feature => feature.featureId);

        return {
            state: "probe",
            probe: {
                battery: battery?.state === "battery" ? battery.battery : undefined,
                deviceInformation: deviceInformation?.state === "deviceInformation"
                    ? deviceInformation.deviceInformation
                    : undefined,
                deviceKind: deviceKind?.state === "deviceKind" ? deviceKind.deviceKind : undefined,
                capabilities: buildOpenLogiCapabilities(featureIds),
                featureIds,
                batteryFeatureIndex,
            },
        };
    }

    readBatteryInfo(
        receiverSlot: LogitechReceiverSlot,
        featureIndex: number,
        timeoutMilliseconds?: number,
    ): { readonly state: "battery"; readonly battery: OpenLogiHidppBatteryInfo } | OpenLogiHidppProbeFailure {
        // Cache hits call this directly with the memoized UnifiedBattery feature
        // index, avoiding Root + FeatureSet discovery for each tick.
        return this.readBatteryInfoWithDeadline(
            receiverSlot,
            featureIndex,
            this.buildDeadlineMilliseconds(timeoutMilliseconds),
        );
    }

    private readBatteryInfoWithDeadline(
        receiverSlot: LogitechReceiverSlot,
        featureIndex: number,
        deadlineMilliseconds: number | undefined,
    ): { readonly state: "battery"; readonly battery: OpenLogiHidppBatteryInfo } | OpenLogiHidppProbeFailure {
        const request = buildOpenLogiShortRequest({
            receiverSlot,
            featureIndex,
            functionId: OPENLOGI_HIDPP_UNIFIED_BATTERY_INFO_FUNCTION_ID,
        });
        const exchangeResult = this.exchangeBeforeDeadline(request, deadlineMilliseconds);
        if (exchangeResult.state !== "response") {
            return mapOpenLogiExchangeFailure(exchangeResult);
        }

        const report = parseOpenLogiStrictReport(exchangeResult.report, request.expectedResponse);
        if (report === undefined || report.payload.length < 3) {
            return { state: "noData", reason: "malformed" };
        }

        const level = parseOpenLogiBatteryLevel(report.payload[1]);
        const status = parseOpenLogiBatteryStatus(report.payload[2]);
        if (level === undefined || status === undefined) {
            return { state: "noData", reason: "malformed" };
        }

        return {
            state: "battery",
            battery: {
                percentage: report.payload[0],
                level,
                status,
            },
        };
    }

    private determineProtocolVersion(
        receiverSlot: LogitechReceiverSlot,
        deadlineMilliseconds: number | undefined,
    ): { readonly state: "v20" } | OpenLogiHidppBatteryProbeResult {
        const request = buildOpenLogiShortRequest({
            receiverSlot,
            featureIndex: LOGITECH_HIDPP_ROOT_FEATURE_ID,
            functionId: OPENLOGI_HIDPP_ROOT_PING_FUNCTION_ID,
            softwareId: OPENLOGI_HIDPP_DEFAULT_SOFTWARE_ID,
        });
        const exchangeResult = this.exchangeBeforeDeadline(request, deadlineMilliseconds);
        if (exchangeResult.state !== "response") {
            return mapOpenLogiExchangeFailure(exchangeResult);
        }

        const protocol = parseOpenLogiProtocolVersionResponse(exchangeResult.report, request.expectedResponse);
        if (protocol === "v20") {
            return { state: "v20" };
        }

        if (protocol === "v10") {
            return { state: "noData", reason: "unsupportedProtocol" };
        }

        if (protocol === "unrelated") {
            return { state: "noData", reason: "malformed" };
        }

        return { state: "noData", reason: "malformed" };
    }

    private readRootFeature(
        receiverSlot: LogitechReceiverSlot,
        featureId: number,
        deadlineMilliseconds: number | undefined,
    ):
        | { readonly state: "feature"; readonly feature: OpenLogiHidppFeatureInformation }
        | { readonly state: "unsupported" }
        | OpenLogiHidppBatteryProbeResult {
        const request = buildOpenLogiShortRequest({
            receiverSlot,
            featureIndex: OPENLOGI_HIDPP_ROOT_FEATURE_INDEX,
            functionId: OPENLOGI_HIDPP_ROOT_GET_FEATURE_FUNCTION_ID,
            softwareId: OPENLOGI_HIDPP_DEFAULT_SOFTWARE_ID,
            parameters: [(featureId >> 8) & 0xFF, featureId & 0xFF, 0x00],
        });
        const exchangeResult = this.exchangeBeforeDeadline(request, deadlineMilliseconds);
        if (exchangeResult.state !== "response") {
            return mapOpenLogiExchangeFailure(exchangeResult);
        }

        const report = parseOpenLogiStrictReport(exchangeResult.report, request.expectedResponse);
        if (report === undefined || report.payload.length < 3) {
            return { state: "noData", reason: "malformed" };
        }

        if (report.payload[0] === 0) {
            return { state: "unsupported" };
        }

        return {
            state: "feature",
            feature: {
                featureId,
                featureIndex: report.payload[0],
                featureType: report.payload[1],
                featureVersion: report.payload[2],
            },
        };
    }

    private enumerateFeatureSet(
        receiverSlot: LogitechReceiverSlot,
        featureSetIndex: number,
        deadlineMilliseconds: number | undefined,
    ): { readonly state: "features"; readonly features: readonly OpenLogiHidppFeatureInformation[] } | OpenLogiHidppBatteryProbeResult {
        const countRequest = buildOpenLogiShortRequest({
            receiverSlot,
            featureIndex: featureSetIndex,
            functionId: OPENLOGI_HIDPP_FEATURE_SET_COUNT_FUNCTION_ID,
        });
        const countExchange = this.exchangeBeforeDeadline(countRequest, deadlineMilliseconds);
        if (countExchange.state !== "response") {
            return mapOpenLogiExchangeFailure(countExchange);
        }

        const countReport = parseOpenLogiStrictReport(countExchange.report, countRequest.expectedResponse);
        if (countReport === undefined || countReport.payload.length < 1) {
            return { state: "noData", reason: "malformed" };
        }

        const features: OpenLogiHidppFeatureInformation[] = [];
        for (let featureIndex = 1; featureIndex <= countReport.payload[0]; featureIndex += 1) {
            const featureRequest = buildOpenLogiShortRequest({
                receiverSlot,
                featureIndex: featureSetIndex,
                functionId: OPENLOGI_HIDPP_FEATURE_SET_GET_FEATURE_FUNCTION_ID,
                parameters: [featureIndex, 0x00, 0x00],
            });
            const featureExchange = this.exchangeBeforeDeadline(featureRequest, deadlineMilliseconds);
            if (featureExchange.state !== "response") {
                return mapOpenLogiExchangeFailure(featureExchange);
            }

            const featureReport = parseOpenLogiStrictReport(featureExchange.report, featureRequest.expectedResponse);
            if (featureReport === undefined || featureReport.payload.length < 4) {
                return { state: "noData", reason: "malformed" };
            }

            features.push({
                featureId: (featureReport.payload[0] << 8) | featureReport.payload[1],
                featureIndex,
                featureType: featureReport.payload[2],
                featureVersion: featureReport.payload[3],
            });
        }

        return {
            state: "features",
            features,
        };
    }

    private readDeviceInformation(
        receiverSlot: LogitechReceiverSlot,
        featureIndex: number,
        deadlineMilliseconds: number | undefined,
    ):
        | { readonly state: "deviceInformation"; readonly deviceInformation: OpenLogiHidppDeviceInformation }
        | OpenLogiHidppProbeFailure {
        const infoRequest = buildOpenLogiShortRequest({
            receiverSlot,
            featureIndex,
            functionId: OPENLOGI_HIDPP_DEVICE_INFORMATION_READ_FUNCTION_ID,
        });
        const infoExchange = this.exchangeBeforeDeadline(infoRequest, deadlineMilliseconds);
        if (infoExchange.state !== "response") {
            return mapOpenLogiExchangeFailure(infoExchange);
        }

        const infoReport = parseOpenLogiStrictReport(infoExchange.report, infoRequest.expectedResponse);
        if (infoReport === undefined || infoReport.payload.length < 15) {
            return { state: "noData", reason: "malformed" };
        }

        // OpenLogi only asks for the serial-number function when the capability
        // bit says that function is implemented.
        const serialNumber = (infoReport.payload[14] & 0x01) === 0 ?
            undefined :
            this.readDeviceSerialNumber(receiverSlot, featureIndex, deadlineMilliseconds);

        return {
            state: "deviceInformation",
            deviceInformation: {
                entityCount: infoReport.payload[0],
                serialNumber,
                unitId: infoReport.payload.slice(1, 5),
                transportFlags: infoReport.payload[6],
                modelIds: [
                    readBigEndianU16(infoReport.payload[7], infoReport.payload[8]),
                    readBigEndianU16(infoReport.payload[9], infoReport.payload[10]),
                    readBigEndianU16(infoReport.payload[11], infoReport.payload[12]),
                ],
                extendedModelId: infoReport.payload[13],
            },
        };
    }

    private readDeviceSerialNumber(
        receiverSlot: LogitechReceiverSlot,
        featureIndex: number,
        deadlineMilliseconds: number | undefined,
    ): string | undefined {
        const request = buildOpenLogiShortRequest({
            receiverSlot,
            featureIndex,
            functionId: OPENLOGI_HIDPP_DEVICE_INFORMATION_SERIAL_FUNCTION_ID,
        });
        const exchangeResult = this.exchangeBeforeDeadline(request, deadlineMilliseconds);
        if (exchangeResult.state !== "response") {
            return undefined;
        }

        const report = parseOpenLogiStrictReport(exchangeResult.report, request.expectedResponse);
        if (report === undefined || report.payload.length < 12) {
            return undefined;
        }

        return normalizeOpenLogiSerialNumber(report.payload.slice(0, 12));
    }

    private readDeviceKind(
        receiverSlot: LogitechReceiverSlot,
        featureIndex: number,
        deadlineMilliseconds: number | undefined,
    ): { readonly state: "deviceKind"; readonly deviceKind: OpenLogiDeviceKind } | OpenLogiHidppProbeFailure {
        const request = buildOpenLogiShortRequest({
            receiverSlot,
            featureIndex,
            functionId: OPENLOGI_HIDPP_DEVICE_TYPE_READ_FUNCTION_ID,
        });
        const exchangeResult = this.exchangeBeforeDeadline(request, deadlineMilliseconds);
        if (exchangeResult.state !== "response") {
            return mapOpenLogiExchangeFailure(exchangeResult);
        }

        const report = parseOpenLogiStrictReport(exchangeResult.report, request.expectedResponse);
        if (report === undefined || report.payload.length < 1) {
            return { state: "noData", reason: "malformed" };
        }

        const deviceKind = mapOpenLogiDeviceType(report.payload[0]);
        if (deviceKind === undefined) {
            return { state: "noData", reason: "malformed" };
        }

        return {
            state: "deviceKind",
            deviceKind,
        };
    }

    private buildDeadlineMilliseconds(timeoutMilliseconds: number | undefined): number | undefined {
        return timeoutMilliseconds === undefined
            ? undefined
            : this.monotonicNow() + timeoutMilliseconds;
    }

    private exchangeBeforeDeadline(
        request: OpenLogiHidppRequest,
        deadlineMilliseconds: number | undefined,
    ): OpenLogiHidppExchangeResult {
        if (deadlineMilliseconds === undefined) {
            return this.transport.exchange(request);
        }

        const remainingMilliseconds = deadlineMilliseconds - this.monotonicNow();
        if (remainingMilliseconds <= 0) {
            return { state: "timeout" };
        }

        return this.transport.exchange({
            ...request,
            timeoutMilliseconds: Math.min(request.timeoutMilliseconds, Math.max(1, remainingMilliseconds)),
        });
    }
}

export function openLogiBatteryFeatureIndex(featureIds: Iterable<number>): number | undefined {
    let featureIndex = 1;
    for (const featureId of featureIds) {
        if (featureId === LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID) {
            return featureIndex;
        }

        featureIndex += 1;
    }

    return undefined;
}

export function normalizeOpenLogiOutgoingRequest(input: {
    readonly request: OpenLogiHidppRequest;
    readonly supportsShortReports: boolean;
    readonly supportsLongReports: boolean;
}): OpenLogiHidppRequest {
    if (input.request.bytes[0] !== LOGITECH_HIDPP_SHORT_REPORT_ID ||
        input.supportsShortReports ||
        !input.supportsLongReports) {
        return input.request;
    }

    // Long-only HID++ nodes still accept short-message semantics when the
    // request is encoded in a long report and padded to 20 bytes.
    return {
        ...input.request,
        bytes: [
            LOGITECH_HIDPP_LONG_REPORT_ID,
            ...input.request.bytes.slice(1),
            ...Array.from(
                { length: 20 - input.request.bytes.length },
                () => 0x00,
            ),
        ],
    };
}

export function matchesOpenLogiExpectedResponse(
    reportBytes: readonly number[],
    expectedResponse: OpenLogiHidppExpectedResponse,
): boolean {
    return parseOpenLogiStrictReport(reportBytes, expectedResponse) !== undefined;
}

export function parseOpenLogiProtocolVersionResponse(
    reportBytes: readonly number[],
    expectedResponse: OpenLogiHidppExpectedResponse,
): "v20" | "v10" | "unrelated" | "malformed" {
    const v20Report = parseOpenLogiStrictReport(reportBytes, expectedResponse);
    if (v20Report !== undefined) {
        return v20Report.payload.length < 2 ? "malformed" : "v20";
    }

    if (reportBytes[0] !== LOGITECH_HIDPP_SHORT_REPORT_ID || reportBytes.length !== 7) {
        return "unrelated";
    }

    return reportBytes[1] === expectedResponse.receiverSlot &&
        reportBytes[2] === OPENLOGI_HIDPP10_ERROR_SUB_ID &&
        reportBytes[3] === OPENLOGI_HIDPP_ROOT_FEATURE_INDEX &&
        reportBytes[4] === expectedResponse.functionByte
        ? reportBytes[5] === OPENLOGI_HIDPP10_INVALID_SUB_ID_ERROR ? "v10" : "unrelated"
        : "unrelated";
}

export function parseOpenLogiDeviceErrorCode(
    reportBytes: readonly number[],
    expectedResponse: OpenLogiHidppExpectedResponse,
): number | undefined {
    if (reportBytes[0] !== LOGITECH_HIDPP_SHORT_REPORT_ID && reportBytes[0] !== LOGITECH_HIDPP_LONG_REPORT_ID) {
        return undefined;
    }

    if (reportBytes.length !== 7 && reportBytes.length !== 20) {
        return undefined;
    }

    return reportBytes[1] === expectedResponse.receiverSlot &&
        reportBytes[2] === 0xFF &&
        reportBytes[3] === expectedResponse.featureIndex &&
        reportBytes[4] === expectedResponse.functionByte
        ? reportBytes[5]
        : undefined;
}

export function buildOpenLogiCapabilities(featureIds: readonly number[]): OpenLogiDeviceCapabilities {
    return {
        buttons: hasOpenLogiFeatureFamily(featureIds, [0x1B00, 0x1B01, 0x1B02, 0x1B03, 0x1B04]),
        pointer: hasOpenLogiFeatureFamily(featureIds, [0x2201, 0x2202]),
        lighting: hasOpenLogiFeatureFamily(featureIds, [0x8080, 0x8070]),
    };
}

function buildOpenLogiShortRequest(input: {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly featureIndex: number;
    readonly functionId: number;
    readonly softwareId?: number;
    readonly parameters?: readonly number[];
}): OpenLogiHidppRequest {
    const functionByte = ((input.functionId & 0x0F) << 4) |
        ((input.softwareId ?? OPENLOGI_HIDPP_DEFAULT_SOFTWARE_ID) & 0x0F);
    const parameters = input.parameters ?? [];
    return {
        bytes: [
            LOGITECH_HIDPP_SHORT_REPORT_ID,
            input.receiverSlot,
            input.featureIndex,
            functionByte,
            parameters[0] ?? 0x00,
            parameters[1] ?? 0x00,
            parameters[2] ?? 0x00,
        ],
        expectedResponse: {
            receiverSlot: input.receiverSlot,
            featureIndex: input.featureIndex,
            functionByte,
        },
        timeoutMilliseconds: OPENLOGI_HIDPP_RESPONSE_TIMEOUT_MILLISECONDS,
    };
}

function parseOpenLogiStrictReport(
    bytes: readonly number[],
    expectedResponse: OpenLogiHidppExpectedResponse,
): { readonly payload: readonly number[] } | undefined {
    if (bytes[0] !== LOGITECH_HIDPP_SHORT_REPORT_ID && bytes[0] !== LOGITECH_HIDPP_LONG_REPORT_ID) {
        return undefined;
    }

    if (bytes.length !== 7 && bytes.length !== 20) {
        return undefined;
    }

    const receiverSlot = bytes[1];
    const featureIndex = bytes[2];
    const functionByte = bytes[3];
    return receiverSlot === expectedResponse.receiverSlot &&
        featureIndex === expectedResponse.featureIndex &&
        functionByte === expectedResponse.functionByte
        ? { payload: bytes.slice(4) }
        : undefined;
}

function mapOpenLogiExchangeFailure(
    exchangeResult: Exclude<OpenLogiHidppExchangeResult, { readonly state: "response" }>,
): OpenLogiHidppProbeFailure {
    switch (exchangeResult.state) {
        case "deviceError":
            return { state: "noData", reason: "deviceError" };
        case "timeout":
            return { state: "noData", reason: "timeout" };
        case "ioError":
            return { state: "noData", reason: "ioError" };
    }
}

function parseOpenLogiBatteryLevel(levelByte: number): OpenLogiHidppBatteryLevel | undefined {
    switch (levelByte) {
        case 0x01:
            return "critical";
        case 0x02:
            return "low";
        case 0x04:
            return "good";
        case 0x08:
            return "full";
        default:
            return undefined;
    }
}

function parseOpenLogiBatteryStatus(statusByte: number): OpenLogiHidppBatteryStatus | undefined {
    switch (statusByte) {
        case 0x00:
            return "discharging";
        case 0x01:
            return "charging";
        case 0x02:
            return "chargingSlow";
        case 0x03:
            return "full";
        case 0x04:
            return "error";
        default:
            return undefined;
    }
}

function normalizeOpenLogiSerialNumber(bytes: readonly number[]): string | undefined {
    try {
        const serialNumber = new TextDecoder("utf-8", { fatal: true })
            .decode(Uint8Array.from(bytes))
            .replace(/^\0+|\0+$/gu, "")
            .trim();
        return serialNumber.length === 0 ? undefined : serialNumber;
    } catch {
        return undefined;
    }
}

function readBigEndianU16(highByte: number, lowByte: number): number {
    return (highByte << 8) | lowByte;
}

function hasOpenLogiFeatureFamily(featureIds: readonly number[], familyFeatureIds: readonly number[]): boolean {
    return featureIds.some(featureId => familyFeatureIds.includes(featureId));
}

function mapOpenLogiDeviceType(deviceTypeByte: number): OpenLogiDeviceKind | undefined {
    switch (deviceTypeByte) {
        case 0x00:
            return "keyboard";
        case 0x01:
            return "remote";
        case 0x02:
            return "numpad";
        case 0x03:
            return "mouse";
        case 0x04:
            return "touchpad";
        case 0x05:
            return "trackball";
        case 0x06:
            return "presenter";
        case 0x08:
            return "headset";
        case 0x0B:
            return "joystick";
        case 0x0C:
            return "gamepad";
        case 0x07:
        case 0x09:
        case 0x0A:
        case 0x0D:
        case 0x0E:
        case 0x0F:
        case 0x10:
        case 0x11:
        case 0x12:
        case 0x13:
            return "unknown";
        default:
            return undefined;
    }
}
