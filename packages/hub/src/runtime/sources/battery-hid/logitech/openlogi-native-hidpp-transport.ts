/**
 * Native HID exchange adapter for the isolated OpenLogi HID++ port.
 *
 * This is ShoMetrics glue around the OpenLogi-isomorphic request/response
 * model. It intentionally does not use ShoMetrics' Logitech session because
 * that session adds local extensions such as `0x1000` and `0x1814`.
 */

import { monotonicNowMilliseconds } from "../../../../shared/clock";
import { logger } from "../../../../logging/logger";
import type { NativeHidDevice } from "../native-hid-loader-internal";
import { OpenLogiHidppBatteryProbeCache } from "./openlogi-hidpp-battery-cache";
import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "./hidpp-protocol";
import {
    OpenLogiHidppBatterySession,
    matchesOpenLogiExpectedResponse,
    normalizeOpenLogiOutgoingRequest,
    parseOpenLogiDeviceErrorCode,
    parseOpenLogiProtocolVersionResponse,
    type OpenLogiHidppBatteryProbeResult,
    type OpenLogiHidppExchangeResult,
    type OpenLogiHidppRequest,
    type OpenLogiHidppTransport,
} from "./openlogi-hidpp-battery-reader";
import {
    parseOpenLogiReceiverDeviceConnectionEvent,
    parseOpenLogiRegisterResponse,
    type OpenLogiReceiverDeviceConnection,
    type OpenLogiReceiverKind,
} from "./openlogi-hidpp-receiver-registers";
import type { OpenLogiReceiverWalkRuntime } from "./openlogi-receiver-walk";

const OPENLOGI_NATIVE_READ_SLICE_TIMEOUT_MILLISECONDS = 20;
const OPENLOGI_NATIVE_DEBUG_LOG_INTERVAL_MILLISECONDS = 60_000;
const log = logger.for("Source:BatteryHID:OpenLogi");

/** Performs one OpenLogi HID++ exchange through already-opened HID handles. */
export class OpenLogiNativeHidppTransport implements OpenLogiHidppTransport {
    constructor(
        private readonly writeDevice: NativeHidDevice | OpenLogiNativeHidppWriteDevices,
        private readonly readDevices: readonly NativeHidDevice[],
        private readonly reportSupport: OpenLogiNativeHidppReportSupport,
        private readonly monotonicNow = monotonicNowMilliseconds,
    ) {}

    exchange(request: OpenLogiHidppRequest): OpenLogiHidppExchangeResult {
        const outgoingRequest = normalizeOpenLogiOutgoingRequest({
            request,
            supportsShortReports: this.reportSupport.supportsShortReports,
            supportsLongReports: this.reportSupport.supportsLongReports,
        });

        let unrelatedReportCount = 0;
        try {
            writeOpenLogiNativeReport(this.writeDevice, outgoingRequest.bytes);
            const deadlineMilliseconds = this.monotonicNow() + outgoingRequest.timeoutMilliseconds;

            while (this.monotonicNow() < deadlineMilliseconds) {
                for (const device of this.readDevices) {
                    // Receiver queues can contain reports from manufacturer
                    // software or other HID++ traffic; only the exact expected
                    // response completes this transaction.
                    const remainingMilliseconds = Math.max(1, deadlineMilliseconds - this.monotonicNow());
                    const report = device.readTimeout(
                        Math.min(OPENLOGI_NATIVE_READ_SLICE_TIMEOUT_MILLISECONDS, remainingMilliseconds),
                    );
                    if (report.length === 0) {
                        continue;
                    }

                    if (matchesOpenLogiExpectedResponse(report, outgoingRequest.expectedResponse)) {
                        logOpenLogiNativeExchangeOutcome(outgoingRequest, "response", unrelatedReportCount);
                        return {
                            state: "response",
                            report,
                        };
                    }

                    if (isOpenLogiHidpp10ProtocolFallback(report, outgoingRequest)) {
                        logOpenLogiNativeExchangeOutcome(outgoingRequest, "response", unrelatedReportCount);
                        return {
                            state: "response",
                            report,
                        };
                    }

                    const errorCode = parseOpenLogiDeviceErrorCode(report, outgoingRequest.expectedResponse);
                    if (errorCode !== undefined) {
                        logOpenLogiNativeExchangeOutcome(
                            outgoingRequest,
                            "deviceError",
                            unrelatedReportCount,
                            `errorCode=${formatByte(errorCode)}`,
                        );
                        return {
                            state: "deviceError",
                            errorCode,
                        };
                    }

                    unrelatedReportCount += 1;
                }
            }

            logOpenLogiNativeExchangeOutcome(outgoingRequest, "timeout", unrelatedReportCount);
            return { state: "timeout" };
        } catch (error) {
            logOpenLogiNativeExchangeOutcome(outgoingRequest, "ioError", unrelatedReportCount);
            return {
                state: "ioError",
                error,
            };
        }
    }

    close(): void {
        for (const device of this.readDevices) {
            device.close();
        }
    }

    /**
     * Triggers and drains receiver device-arrival events.
     *
     * OpenLogi listens before sending the trigger. The short-transaction
     * adapter preserves that by parsing `0x41` events while waiting for the
     * trigger acknowledgement, then continuing the drain window.
     */
    drainReceiverConnectionEvents(input: {
        readonly receiverKind: OpenLogiReceiverKind;
        readonly triggerRequest: OpenLogiHidppRequest;
        readonly timeoutMilliseconds: number;
    }): readonly OpenLogiReceiverDeviceConnection[] | undefined {
        const outgoingRequest = normalizeOpenLogiOutgoingRequest({
            request: input.triggerRequest,
            supportsShortReports: this.reportSupport.supportsShortReports,
            supportsLongReports: this.reportSupport.supportsLongReports,
        });
        const connections: OpenLogiReceiverDeviceConnection[] = [];
        let unrelatedReportCount = 0;

        try {
            writeOpenLogiNativeReport(this.writeDevice, outgoingRequest.bytes);
            const triggerDeadlineMilliseconds = this.monotonicNow() + outgoingRequest.timeoutMilliseconds;
            let triggerAcknowledged = false;

            while (this.monotonicNow() < triggerDeadlineMilliseconds && !triggerAcknowledged) {
                const readResult = this.readNativeReportBefore(triggerDeadlineMilliseconds);
                if (readResult === undefined) {
                    continue;
                }

                const event = parseOpenLogiReceiverDeviceConnectionEvent(input.receiverKind, readResult);
                if (event.state === "deviceConnection") {
                    connections.push(event.connection);
                    continue;
                }

                const triggerResponse = parseOpenLogiRegisterResponse(readResult, outgoingRequest);
                if (triggerResponse.state === "register") {
                    triggerAcknowledged = true;
                    continue;
                }

                if (triggerResponse.state === "registerError" || triggerResponse.state === "malformed") {
                    logOpenLogiNativeExchangeOutcome(outgoingRequest, "deviceError", unrelatedReportCount);
                    return undefined;
                }

                unrelatedReportCount += 1;
            }

            if (!triggerAcknowledged) {
                logOpenLogiNativeExchangeOutcome(outgoingRequest, "timeout", unrelatedReportCount);
                return undefined;
            }

            const drainDeadlineMilliseconds = this.monotonicNow() + input.timeoutMilliseconds;
            while (this.monotonicNow() < drainDeadlineMilliseconds) {
                const report = this.readNativeReportBefore(drainDeadlineMilliseconds);
                if (report === undefined) {
                    continue;
                }

                const event = parseOpenLogiReceiverDeviceConnectionEvent(input.receiverKind, report);
                if (event.state === "deviceConnection") {
                    connections.push(event.connection);
                    continue;
                }

                unrelatedReportCount += 1;
            }

            logOpenLogiNativeExchangeOutcome(outgoingRequest, "response", unrelatedReportCount);
            return connections;
        } catch {
            logOpenLogiNativeExchangeOutcome(outgoingRequest, "ioError", unrelatedReportCount);
            return undefined;
        }
    }

    private readNativeReportBefore(deadlineMilliseconds: number): readonly number[] | undefined {
        for (const device of this.readDevices) {
            const remainingMilliseconds = Math.max(1, deadlineMilliseconds - this.monotonicNow());
            const report = device.readTimeout(
                Math.min(OPENLOGI_NATIVE_READ_SLICE_TIMEOUT_MILLISECONDS, remainingMilliseconds),
            );
            if (report.length > 0) {
                return report;
            }
        }

        return undefined;
    }
}

export interface OpenLogiNativeHidppReportSupport {
    readonly supportsShortReports: boolean;
    readonly supportsLongReports: boolean;
}

export interface OpenLogiNativeHidppWriteDevices {
    readonly shortReportDevice?: NativeHidDevice;
    readonly longReportDevice?: NativeHidDevice;
}

/** Adapts native HID exchange and probe cache to the OpenLogi receiver walk. */
export class OpenLogiNativeReceiverWalkRuntime implements OpenLogiReceiverWalkRuntime {
    constructor(
        private readonly transport: OpenLogiNativeHidppTransport,
        private readonly batterySession: OpenLogiHidppBatterySession,
        private readonly batteryProbeCache: OpenLogiHidppBatteryProbeCache,
    ) {}

    exchange(request: OpenLogiHidppRequest): OpenLogiHidppExchangeResult {
        return this.transport.exchange(request);
    }

    drainReceiverConnectionEvents(input: {
        readonly receiverKind: OpenLogiReceiverKind;
        readonly triggerRequest: OpenLogiHidppRequest;
        readonly timeoutMilliseconds: number;
    }): readonly OpenLogiReceiverDeviceConnection[] | undefined {
        return this.transport.drainReceiverConnectionEvents(input);
    }

    readBatteryProbe(input: {
        readonly receiverSlot: number;
        readonly cacheKey?: string;
        readonly online: boolean;
        readonly tick: number;
        readonly timeoutMilliseconds?: number;
    }): OpenLogiHidppBatteryProbeResult {
        return this.batteryProbeCache.readBattery({
            session: this.batterySession,
            ...input,
        });
    }

    evictUnseenBatteryProbeCache(seenCacheKeys: ReadonlySet<string>): void {
        this.batteryProbeCache.evictUnseen(seenCacheKeys);
    }

    close(): void {
        this.transport.close();
    }
}

function isOpenLogiHidpp10ProtocolFallback(
    report: readonly number[],
    request: OpenLogiHidppRequest,
): boolean {
    return request.expectedResponse.featureIndex === 0x00 &&
        parseOpenLogiProtocolVersionResponse(report, request.expectedResponse) === "v10";
}

function writeOpenLogiNativeReport(
    writeDevice: NativeHidDevice | OpenLogiNativeHidppWriteDevices,
    report: readonly number[],
): number {
    if (isOpenLogiNativeHidppWriteDevices(writeDevice)) {
        // Some platforms expose separate short and long report collections.
        // Route by report id when possible, then fall back to whichever handle is
        // available so long-only devices still work.
        const reportId = report[0];
        const routedDevice = reportId === LOGITECH_HIDPP_LONG_REPORT_ID
            ? writeDevice.longReportDevice
            : reportId === LOGITECH_HIDPP_SHORT_REPORT_ID
                ? writeDevice.shortReportDevice
                : undefined;
        const fallbackDevice = routedDevice ?? writeDevice.shortReportDevice ?? writeDevice.longReportDevice;
        if (fallbackDevice === undefined) {
            throw new Error("No OpenLogi native HID write device is available.");
        }

        return fallbackDevice.write([...report]);
    }

    return writeDevice.write([...report]);
}

function isOpenLogiNativeHidppWriteDevices(
    value: NativeHidDevice | OpenLogiNativeHidppWriteDevices,
): value is OpenLogiNativeHidppWriteDevices {
    return "shortReportDevice" in value || "longReportDevice" in value;
}

function logOpenLogiNativeExchangeOutcome(
    request: OpenLogiHidppRequest,
    outcome: "response" | "deviceError" | "timeout" | "ioError",
    unrelatedReportCount: number,
    detail?: string,
): void {
    log.atDebug()
        .everyMs(
            `exchange:${request.expectedResponse.receiverSlot}:${request.expectedResponse.featureIndex}:` +
                `${request.expectedResponse.functionByte}:${outcome}`,
            OPENLOGI_NATIVE_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            `OpenLogi HID++ exchange outcome=${outcome}`,
            `slot=${request.expectedResponse.receiverSlot}`,
            `featureIndex=${formatByte(request.expectedResponse.featureIndex)}`,
            `functionByte=${formatByte(request.expectedResponse.functionByte)}`,
            `unrelatedReports=${unrelatedReportCount}`,
            detail,
        ].filter(Boolean).join(" "));
}

function formatByte(value: number): string {
    return `0x${value.toString(16).padStart(2, "0").toUpperCase()}`;
}
