import { monotonicNowMilliseconds } from "../../../../shared/clock";
import { logger } from "../../../../logging/logger";
import type { NativeHidDevice, NativeHidDeviceInfo } from "../native-hid-loader-internal";
import {
    buildOpenLogiTriggerDeviceArrivalRequest,
    OPENLOGI_RECEIVER_ARRIVAL_DRAIN_TIMEOUT_MILLISECONDS,
} from "./openlogi-derived/hid/inventory";
import {
    parseOpenLogiHidpp10RegisterResponse,
} from "./openlogi-derived/protocol/v10";
import type {
    OpenLogiReceiverDeviceConnection,
    OpenLogiReceiverKind,
} from "./openlogi-derived/receiver/mod";
import { parseOpenLogiBoltDeviceConnectionEvent } from "./openlogi-derived/receiver/bolt";
import { parseOpenLogiUnifyingDeviceConnectionEvent } from "./openlogi-derived/receiver/unifying";
import {
    buildLogitechBatteryStatusRequest,
    buildLogitechBatteryVoltageRequest,
    buildLogitechDeviceInformationRequest,
    buildLogitechFeatureLookupRequest,
    buildLogitechUnifiedBatteryCapabilitiesRequest,
    buildLogitechUnifiedBatteryInfoRequest,
    LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID,
    LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID,
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID,
    LOGITECH_HIDPP_SHORT_USAGE,
    LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
    matchesLogitechHidppExpectedResponse,
    parseLogitechBatteryStatusReport,
    parseLogitechBatteryVoltageReport,
    parseLogitechDeviceInformationReport,
    parseLogitechFeatureLookupReport,
    parseLogitechHidppErrorCode,
    parseLogitechUnifiedBatteryCapabilitiesReport,
    parseLogitechUnifiedBatteryInfoReport,
    type LogitechBatteryReading,
    type LogitechBatteryParseResult,
    type LogitechDeviceInformation,
    type LogitechHidppFeatureLookup,
    type LogitechHidppRequest,
    type LogitechReceiverSlot,
} from "./hidpp-protocol";

const DEFAULT_HIDPP_TRANSACTION_TIMEOUT_MILLISECONDS = 300;
const READ_SLICE_TIMEOUT_MILLISECONDS = 20;
// OpenLogi gives sleepy receiver-backed devices a larger arrival-event window.
// Keep this separate from ordinary feature transactions: Unifying arrival
// events are the online-slot discovery source, while feature reads can fail as
// transient no-data and retry on the next low-frequency battery poll.
const RECEIVER_ARRIVAL_DRAIN_TIMEOUT_MILLISECONDS = OPENLOGI_RECEIVER_ARRIVAL_DRAIN_TIMEOUT_MILLISECONDS;
const LOGITECH_HIDPP_DEBUG_LOG_INTERVAL_MILLISECONDS = 60_000;
const log = logger.for("Source:BatteryHID:Logitech");

/** Performs short write/read HID++ transactions for one opened Logitech route. */
export interface LogitechHidppTransport {
    exchange(request: LogitechHidppRequest): LogitechHidppExchangeResult;
}

export type LogitechHidppExchangeResult =
    | {
        readonly state: "response";
        readonly report: readonly number[];
        readonly unrelatedReports: readonly (readonly number[])[];
    }
    | {
        readonly state: "deviceError";
        readonly errorCode: number;
        readonly unrelatedReports: readonly (readonly number[])[];
    }
    | {
        readonly state: "timeout";
        readonly unrelatedReports: readonly (readonly number[])[];
    }
    | {
        readonly state: "ioError";
        readonly error: unknown;
        readonly unrelatedReports: readonly (readonly number[])[];
    };

export type LogitechFeatureReadResult =
    | {
        readonly state: "supported";
        readonly feature: LogitechHidppFeatureLookup;
    }
    | {
        readonly state: "unsupported";
    }
    | {
        readonly state: "noData";
        readonly reason: "timeout" | "deviceError" | "malformed" | "ioError";
    };

export type LogitechBatteryReadResult =
    | {
        readonly state: "battery";
        readonly reading: LogitechBatteryReading;
        readonly deviceInformation?: LogitechDeviceInformation;
        readonly unrelatedReportCount: number;
    }
    | {
        readonly state: "unsupported";
    }
    | {
        readonly state: "noData";
        readonly reason:
            | "timeout"
            | "deviceError"
            | "malformed"
            | "noPercentage"
            | "outOfRange"
            | "ioError";
        readonly unrelatedReportCount: number;
    };

export type LogitechDeviceInformationReadResult =
    | {
        readonly state: "deviceInformation";
        readonly deviceInformation: LogitechDeviceInformation;
    }
    | {
        readonly state: "unsupported";
    }
    | {
        readonly state: "noData";
        readonly reason: "timeout" | "deviceError" | "malformed" | "ioError";
    };

type LogitechExchangeNoDataResult = {
    readonly state: "noData";
    readonly reason: "timeout" | "deviceError" | "ioError";
};

/** Caches HID++ feature table lookups for one plugin session and one transport route. */
export class LogitechHidppSession {
    private readonly featureLookupBySlotAndFeatureId = new Map<string, LogitechFeatureReadResult>();
    private readonly deviceInformationBySlot = new Map<LogitechReceiverSlot, LogitechDeviceInformationReadResult>();

    constructor(private readonly transport: LogitechHidppTransport) {}

    readBattery(receiverSlot: LogitechReceiverSlot): LogitechBatteryReadResult {
        // HID++ battery support is feature-table driven. Fallback is absent-only:
        // a malformed/timeout response means the queue is not trustworthy for
        // this tick, so the source publishes no-data instead of probing another
        // battery feature.
        const unifiedBatteryFeature = this.readFeature(receiverSlot, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID);
        if (unifiedBatteryFeature.state === "supported") {
            const batteryResult = this.readUnifiedBattery(receiverSlot, unifiedBatteryFeature.feature.featureIndex);
            return appendOptionalTelemetry(
                batteryResult,
                this.readDeviceInformationForBatteryResult(receiverSlot, batteryResult),
            );
        }

        if (unifiedBatteryFeature.state === "noData") {
            return {
                state: "noData",
                reason: unifiedBatteryFeature.reason,
                unrelatedReportCount: 0,
            };
        }

        const batteryStatusFeature = this.readFeature(receiverSlot, LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID);
        if (batteryStatusFeature.state === "supported") {
            const batteryResult = this.readBatteryStatus(receiverSlot, batteryStatusFeature.feature.featureIndex);
            return appendOptionalTelemetry(
                batteryResult,
                this.readDeviceInformationForBatteryResult(receiverSlot, batteryResult),
            );
        }

        if (batteryStatusFeature.state === "noData") {
            return {
                state: "noData",
                reason: batteryStatusFeature.reason,
                unrelatedReportCount: 0,
            };
        }

        const batteryVoltageFeature = this.readFeature(receiverSlot, LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID);
        if (batteryVoltageFeature.state === "unsupported") {
            return { state: "unsupported" };
        }

        if (batteryVoltageFeature.state === "noData") {
            return {
                state: "noData",
                reason: batteryVoltageFeature.reason,
                unrelatedReportCount: 0,
            };
        }

        const batteryResult = this.readBatteryVoltage(receiverSlot, batteryVoltageFeature.feature.featureIndex);
        return appendOptionalTelemetry(
            batteryResult,
            this.readDeviceInformationForBatteryResult(receiverSlot, batteryResult),
        );
    }

    readDeviceInformation(receiverSlot: LogitechReceiverSlot): LogitechDeviceInformationReadResult {
        const cached = this.deviceInformationBySlot.get(receiverSlot);
        if (cached !== undefined) {
            return cached;
        }

        const feature = this.readFeature(receiverSlot, LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID);
        if (feature.state === "unsupported") {
            const result = { state: "unsupported" } satisfies LogitechDeviceInformationReadResult;
            this.deviceInformationBySlot.set(receiverSlot, result);
            return result;
        }

        if (feature.state === "noData") {
            const result = {
                state: "noData",
                reason: feature.reason,
            } satisfies LogitechDeviceInformationReadResult;
            this.deviceInformationBySlot.set(receiverSlot, result);
            return result;
        }

        const request = buildLogitechDeviceInformationRequest(receiverSlot, feature.feature.featureIndex);
        const exchangeResult = this.transport.exchange(request);
        if (exchangeResult.state !== "response") {
            const result = mapExchangeFailure(exchangeResult);
            this.deviceInformationBySlot.set(receiverSlot, result);
            return result;
        }

        const parsed = parseLogitechDeviceInformationReport(exchangeResult.report, request.expectedResponse);
        if (parsed.state !== "deviceInformation") {
            const result = {
                state: "noData",
                reason: parsed.state === "malformed" ? "malformed" : "timeout",
            } satisfies LogitechDeviceInformationReadResult;
            this.deviceInformationBySlot.set(receiverSlot, result);
            return result;
        }

        const result = {
            state: "deviceInformation",
            deviceInformation: parsed.deviceInformation,
        } satisfies LogitechDeviceInformationReadResult;
        this.deviceInformationBySlot.set(receiverSlot, result);
        return result;
    }

    readFeature(receiverSlot: LogitechReceiverSlot, featureId: number): LogitechFeatureReadResult {
        const cacheKey = `${receiverSlot}:${featureId}`;
        const cached = this.featureLookupBySlotAndFeatureId.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const request = buildLogitechFeatureLookupRequest(receiverSlot, featureId);
        const exchangeResult = this.transport.exchange(request);
        const result = parseFeatureExchangeResult(exchangeResult, receiverSlot, featureId);
        this.featureLookupBySlotAndFeatureId.set(cacheKey, result);
        return result;
    }

    private readUnifiedBattery(receiverSlot: LogitechReceiverSlot, featureIndex: number): LogitechBatteryReadResult {
        const capabilitiesRequest = buildLogitechUnifiedBatteryCapabilitiesRequest(receiverSlot, featureIndex);
        const capabilitiesExchange = this.transport.exchange(capabilitiesRequest);
        if (capabilitiesExchange.state !== "response") {
            const failure = mapExchangeFailure(capabilitiesExchange);
            return {
                state: "noData",
                reason: failure.reason,
                unrelatedReportCount: capabilitiesExchange.unrelatedReports.length,
            };
        }

        const capabilities = parseLogitechUnifiedBatteryCapabilitiesReport(
            capabilitiesExchange.report,
            capabilitiesRequest.expectedResponse,
        );
        if (capabilities.state !== "capabilities") {
            return {
                state: "noData",
                reason: capabilities.state === "malformed" ? "malformed" : "timeout",
                unrelatedReportCount: capabilitiesExchange.unrelatedReports.length,
            };
        }

        const infoRequest = buildLogitechUnifiedBatteryInfoRequest(receiverSlot, featureIndex);
        const infoExchange = this.transport.exchange(infoRequest);
        if (infoExchange.state !== "response") {
            const failure = mapExchangeFailure(infoExchange);
            return {
                state: "noData",
                reason: failure.reason,
                unrelatedReportCount: capabilitiesExchange.unrelatedReports.length + infoExchange.unrelatedReports.length,
            };
        }

        const battery = parseLogitechUnifiedBatteryInfoReport(
            infoExchange.report,
            infoRequest.expectedResponse,
            capabilities.capabilities,
        );

        return mapBatteryParseResult(
            battery,
            capabilitiesExchange.unrelatedReports.length + infoExchange.unrelatedReports.length,
        );
    }

    private readBatteryStatus(receiverSlot: LogitechReceiverSlot, featureIndex: number): LogitechBatteryReadResult {
        const request = buildLogitechBatteryStatusRequest(receiverSlot, featureIndex);
        const exchangeResult = this.transport.exchange(request);
        if (exchangeResult.state !== "response") {
            const failure = mapExchangeFailure(exchangeResult);
            return {
                state: "noData",
                reason: failure.reason,
                unrelatedReportCount: exchangeResult.unrelatedReports.length,
            };
        }

        return mapBatteryParseResult(
            parseLogitechBatteryStatusReport(exchangeResult.report, request.expectedResponse),
            exchangeResult.unrelatedReports.length,
        );
    }

    private readBatteryVoltage(receiverSlot: LogitechReceiverSlot, featureIndex: number): LogitechBatteryReadResult {
        const request = buildLogitechBatteryVoltageRequest(receiverSlot, featureIndex);
        const exchangeResult = this.transport.exchange(request);
        if (exchangeResult.state !== "response") {
            const failure = mapExchangeFailure(exchangeResult);
            return {
                state: "noData",
                reason: failure.reason,
                unrelatedReportCount: exchangeResult.unrelatedReports.length,
            };
        }

        return mapBatteryParseResult(
            parseLogitechBatteryVoltageReport(exchangeResult.report, request.expectedResponse),
            exchangeResult.unrelatedReports.length,
        );
    }

    private readDeviceInformationForBatteryResult(
        receiverSlot: LogitechReceiverSlot,
        batteryResult: LogitechBatteryReadResult,
    ): LogitechDeviceInformationReadResult {
        return batteryResult.state === "battery"
            ? this.readDeviceInformation(receiverSlot)
            : { state: "unsupported" };
    }
}

/** Implements the open-write-read-close transaction shape used by vendor HID battery reads. */
export class NativeLogitechHidppTransport implements LogitechHidppTransport {
    constructor(
        private readonly writeDevice: NativeHidDevice,
        private readonly readDevices: readonly NativeHidDevice[],
        private readonly transactionTimeoutMilliseconds = DEFAULT_HIDPP_TRANSACTION_TIMEOUT_MILLISECONDS,
        private readonly monotonicNow = monotonicNowMilliseconds,
    ) {}

    exchange(request: LogitechHidppRequest): LogitechHidppExchangeResult {
        const unrelatedReports: Array<readonly number[]> = [];

        try {
            this.writeDevice.write([...request.bytes]);
            const deadlineMilliseconds = this.monotonicNow() + this.transactionTimeoutMilliseconds;

            while (this.monotonicNow() < deadlineMilliseconds) {
                for (const device of this.readDevices) {
                    const remainingMilliseconds = Math.max(1, deadlineMilliseconds - this.monotonicNow());
                    const report = device.readTimeout(Math.min(READ_SLICE_TIMEOUT_MILLISECONDS, remainingMilliseconds));
                    if (report.length === 0) {
                        continue;
                    }

                    if (matchesLogitechHidppExpectedResponse(report, request.expectedResponse)) {
                        logUnrelatedReportsBeforeOutcome(request, unrelatedReports.length, "response");
                        return {
                            state: "response",
                            report,
                            unrelatedReports,
                        };
                    }

                    const errorCode = parseLogitechHidppErrorCode(report, request.expectedResponse);
                    if (errorCode !== undefined) {
                        logHidppExchangeOutcome(request, "deviceError", unrelatedReports.length, `errorCode=${formatByte(errorCode)}`);
                        return {
                            state: "deviceError",
                            errorCode,
                            unrelatedReports,
                        };
                    }

                    unrelatedReports.push(report);
                }
            }

            logHidppExchangeOutcome(request, "timeout", unrelatedReports.length);
            return {
                state: "timeout",
                unrelatedReports,
            };
        } catch (error) {
            logHidppExchangeOutcome(request, "ioError", unrelatedReports.length);
            return {
                state: "ioError",
                error,
                unrelatedReports,
            };
        }
    }

    /**
     * Triggers and drains receiver online-device events.
     *
     * Unifying exposes online devices through these `0x41` events rather than
     * a stable per-slot inventory register. Bolt can also emit them, but Bolt
     * still uses pairing registers as the stable unit-id source.
     */
    drainReceiverConnectionEvents(receiverKind: OpenLogiReceiverKind): readonly OpenLogiReceiverDeviceConnection[] | undefined {
        const request = buildOpenLogiTriggerDeviceArrivalRequest();
        const connections: OpenLogiReceiverDeviceConnection[] = [];
        let unrelatedReportCount = 0;

        try {
            this.writeDevice.write([...request.bytes]);
            const triggerDeadlineMilliseconds = this.monotonicNow() + DEFAULT_HIDPP_TRANSACTION_TIMEOUT_MILLISECONDS;
            let triggerAcknowledged = false;

            while (this.monotonicNow() < triggerDeadlineMilliseconds && !triggerAcknowledged) {
                const report = this.readAnyReportBefore(triggerDeadlineMilliseconds);
                if (report === undefined) {
                    continue;
                }

                const event = parseOpenLogiReceiverDeviceConnectionEvent(receiverKind, report);
                if (event.state === "deviceConnection") {
                    connections.push(event.connection);
                    continue;
                }

                const triggerResponse = parseOpenLogiHidpp10RegisterResponse(report, request);
                if (triggerResponse.state === "register") {
                    triggerAcknowledged = true;
                    continue;
                }

                if (triggerResponse.state === "registerError" || triggerResponse.state === "malformed") {
                    logHidppExchangeOutcome(request, "deviceError", unrelatedReportCount);
                    return undefined;
                }

                unrelatedReportCount += 1;
            }

            if (!triggerAcknowledged) {
                logHidppExchangeOutcome(request, "timeout", unrelatedReportCount);
                return undefined;
            }

            const drainDeadlineMilliseconds = this.monotonicNow() + RECEIVER_ARRIVAL_DRAIN_TIMEOUT_MILLISECONDS;
            while (this.monotonicNow() < drainDeadlineMilliseconds) {
                const report = this.readAnyReportBefore(drainDeadlineMilliseconds);
                if (report === undefined) {
                    continue;
                }

                const event = parseOpenLogiReceiverDeviceConnectionEvent(receiverKind, report);
                if (event.state === "deviceConnection") {
                    connections.push(event.connection);
                    continue;
                }

                unrelatedReportCount += 1;
            }

            logHidppExchangeOutcome(request, "response", unrelatedReportCount);
            return connections;
        } catch {
            logHidppExchangeOutcome(request, "ioError", unrelatedReportCount);
            return undefined;
        }
    }

    close(): void {
        for (const device of this.readDevices) {
            device.close();
        }
    }

    private readAnyReportBefore(deadlineMilliseconds: number): readonly number[] | undefined {
        for (const device of this.readDevices) {
            const remainingMilliseconds = Math.max(1, deadlineMilliseconds - this.monotonicNow());
            const report = device.readTimeout(Math.min(READ_SLICE_TIMEOUT_MILLISECONDS, remainingMilliseconds));
            if (report.length !== 0) {
                return report;
            }
        }

        return undefined;
    }
}

function parseOpenLogiReceiverDeviceConnectionEvent(
    receiverKind: OpenLogiReceiverKind,
    report: readonly number[],
) {
    switch (receiverKind) {
        case "unifying":
            return parseOpenLogiUnifyingDeviceConnectionEvent(report);
        case "bolt":
            return parseOpenLogiBoltDeviceConnectionEvent(report);
        default:
            return assertNever(receiverKind);
    }
}

function assertNever(value: never): never {
    throw new Error(`Unexpected Logitech receiver kind: ${value}`);
}

export function openNativeLogitechHidppTransport(
    nativeDeviceInfoList: readonly NativeHidDeviceInfo[],
    openDevice: (path: string) => NativeHidDevice,
): NativeLogitechHidppTransport | undefined {
    const devicePathList = [...nativeDeviceInfoList]
        .sort(compareLogitechWriteHandlePreference)
        .flatMap(deviceInfo =>
            deviceInfo.path === undefined ? [] : [deviceInfo.path],
        );
    if (devicePathList.length === 0) {
        return undefined;
    }

    const openedDevices = devicePathList.map(path => openDevice(path));
    return new NativeLogitechHidppTransport(openedDevices[0], openedDevices);
}

function compareLogitechWriteHandlePreference(
    left: NativeHidDeviceInfo,
    right: NativeHidDeviceInfo,
): number {
    return scoreLogitechWriteHandle(right) - scoreLogitechWriteHandle(left)
        || (left.path ?? "").localeCompare(right.path ?? "");
}

function scoreLogitechWriteHandle(deviceInfo: NativeHidDeviceInfo): number {
    return deviceInfo.usagePage === LOGITECH_HIDPP_CLASSIC_USAGE_PAGE &&
        deviceInfo.usage === LOGITECH_HIDPP_SHORT_USAGE
        ? 1
        : 0;
}

function parseFeatureExchangeResult(
    exchangeResult: LogitechHidppExchangeResult,
    receiverSlot: LogitechReceiverSlot,
    featureId: number,
): LogitechFeatureReadResult {
    if (exchangeResult.state !== "response") {
        return mapExchangeFailure(exchangeResult);
    }

    const parsed = parseLogitechFeatureLookupReport(exchangeResult.report, receiverSlot, featureId);
    switch (parsed.state) {
        case "supported":
            return {
                state: "supported",
                feature: parsed.feature,
            };
        case "unsupported":
            return { state: "unsupported" };
        case "malformed":
        case "unrelated":
            return {
                state: "noData",
                reason: parsed.state === "malformed" ? "malformed" : "timeout",
            };
    }
}

function logUnrelatedReportsBeforeOutcome(
    request: LogitechHidppRequest,
    unrelatedReportCount: number,
    outcome: "response" | "deviceError",
): void {
    if (unrelatedReportCount === 0) {
        return;
    }

    logHidppExchangeOutcome(request, outcome, unrelatedReportCount);
}

function logHidppExchangeOutcome(
    request: LogitechHidppRequest,
    outcome: "response" | "deviceError" | "timeout" | "ioError",
    unrelatedReportCount: number,
    extra?: string,
): void {
    log.atDebug()
        .everyMs(
            [
                "hidpp-exchange",
                outcome,
                request.expectedResponse.receiverSlot,
                request.expectedResponse.featureIndex,
                request.expectedResponse.functionByte,
            ].join(":"),
            LOGITECH_HIDPP_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "Logitech HID++ exchange",
            `outcome=${outcome}`,
            `receiverSlot=${request.expectedResponse.receiverSlot}`,
            `featureIndex=${formatByte(request.expectedResponse.featureIndex)}`,
            `functionByte=${formatByte(request.expectedResponse.functionByte)}`,
            `unrelatedReports=${unrelatedReportCount}`,
            extra,
        ].filter(part => part !== undefined).join(" "));
}

function mapBatteryParseResult(
    parseResult: LogitechBatteryParseResult,
    unrelatedReportCount: number,
): LogitechBatteryReadResult {
    switch (parseResult.state) {
        case "battery":
            return {
                state: "battery",
                reading: parseResult.reading,
                unrelatedReportCount,
            };
        case "noData":
            return {
                state: "noData",
                reason: parseResult.reason,
                unrelatedReportCount,
            };
        case "malformed":
        case "unrelated":
            return {
                state: "noData",
                reason: parseResult.state === "malformed" ? "malformed" : "timeout",
                unrelatedReportCount,
            };
    }
}

function appendOptionalTelemetry(
    batteryResult: LogitechBatteryReadResult,
    deviceInformationResult: LogitechDeviceInformationReadResult,
): LogitechBatteryReadResult {
    if (batteryResult.state !== "battery") {
        return batteryResult;
    }

    return {
        ...batteryResult,
        deviceInformation: deviceInformationResult.state === "deviceInformation"
            ? deviceInformationResult.deviceInformation
            : undefined,
    };
}

function mapExchangeFailure(
    exchangeResult: Exclude<LogitechHidppExchangeResult, { readonly state: "response" }>,
): LogitechExchangeNoDataResult {
    switch (exchangeResult.state) {
        case "deviceError":
            return {
                state: "noData",
                reason: "deviceError",
            };
        case "timeout":
            return {
                state: "noData",
                reason: "timeout",
            };
        case "ioError":
            return {
                state: "noData",
                reason: "ioError",
            };
    }
}

function formatByte(value: number): string {
    return `0x${value.toString(16).padStart(2, "0")}`;
}
