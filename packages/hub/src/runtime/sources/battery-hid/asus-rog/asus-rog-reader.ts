import { monotonicNowMilliseconds } from "../../../../shared/clock";
import { logger } from "../../../../logging/logger";
import type {
    NativeHidDevice,
    NativeHidDeviceInfo,
} from "../native-hid-loader-internal";
import type {
    AsusRogBatteryParser,
    AsusRogBatteryReading,
    AsusRogBatteryRequest,
} from "./asus-rog-protocol";

const DEFAULT_ASUS_ROG_TRANSACTION_TIMEOUT_MILLISECONDS = 300;
const READ_SLICE_TIMEOUT_MILLISECONDS = 20;
const ASUS_ROG_DEBUG_LOG_INTERVAL_MILLISECONDS = 60_000;
const log = logger.for("Source:BatteryHID:AsusROG");

export type AsusRogBatteryReadResult =
    | {
          readonly state: "battery";
          readonly reading: AsusRogBatteryReading;
          readonly unrelatedReportCount: number;
      }
    | {
          readonly state: "noData";
          readonly reason:
              | "knownNoData"
              | "timeout"
              | "malformed"
              | "outOfRange"
              | "ioError";
          readonly unrelatedReportCount: number;
      };

/** Performs one short ASUS ROG GET transaction against one opened HID path. */
export class NativeAsusRogHidTransport {
    constructor(
        private readonly device: NativeHidDevice,
        private readonly transactionTimeoutMilliseconds = DEFAULT_ASUS_ROG_TRANSACTION_TIMEOUT_MILLISECONDS,
        private readonly monotonicNow = monotonicNowMilliseconds,
    ) {}

    exchange(
        request: AsusRogBatteryRequest,
        parseReport: AsusRogBatteryParser,
    ): AsusRogBatteryReadResult {
        let unrelatedReportCount = 0;

        try {
            // ASUS Armoury Crate can share the same vendor-defined report
            // queue. Keep reading until the matching parser sees our response,
            // known no-data, or the short deadline expires.
            this.device.write([...request.bytes]);
            const deadlineMilliseconds =
                this.monotonicNow() + this.transactionTimeoutMilliseconds;

            while (this.monotonicNow() < deadlineMilliseconds) {
                const remainingMilliseconds = Math.max(
                    1,
                    deadlineMilliseconds - this.monotonicNow(),
                );
                const report = this.device.readTimeout(
                    Math.min(
                        READ_SLICE_TIMEOUT_MILLISECONDS,
                        remainingMilliseconds,
                    ),
                );
                if (report.length === 0) {
                    continue;
                }

                const parsed = parseReport(report);
                switch (parsed.state) {
                    case "battery":
                        logAsusRogExchangeOutcome(
                            request,
                            "response",
                            unrelatedReportCount,
                        );
                        return {
                            state: "battery",
                            reading: parsed.reading,
                            unrelatedReportCount,
                        };
                    case "noData":
                        logAsusRogExchangeOutcome(
                            request,
                            parsed.reason,
                            unrelatedReportCount,
                        );
                        return {
                            state: "noData",
                            reason: parsed.reason,
                            unrelatedReportCount,
                        };
                    case "malformed":
                        logAsusRogExchangeOutcome(
                            request,
                            "malformed",
                            unrelatedReportCount,
                        );
                        return {
                            state: "noData",
                            reason: "malformed",
                            unrelatedReportCount,
                        };
                    case "unrelated":
                        // Other ASUS SDK traffic on the same collection is
                        // expected under manufacturer software contention.
                        unrelatedReportCount += 1;
                        break;
                }
            }

            logAsusRogExchangeOutcome(request, "timeout", unrelatedReportCount);
            return {
                state: "noData",
                reason: "timeout",
                unrelatedReportCount,
            };
        } catch (error) {
            void error;
            // The source owner reports only a bounded outcome. HID errors are
            // noisy and often transient when devices are unplugged or another
            // ASUS process is active.
            logAsusRogExchangeOutcome(request, "ioError", unrelatedReportCount);
            return {
                state: "noData",
                reason: "ioError",
                unrelatedReportCount,
            };
        }
    }

    close(): void {
        this.device.close();
    }
}

export function openNativeAsusRogHidTransport(
    deviceInfo: NativeHidDeviceInfo,
    openDevice: (path: string) => NativeHidDevice,
): NativeAsusRogHidTransport | undefined {
    // Discovery owns allowlisting; this helper only turns a concrete HID path
    // into a short-lived transaction object.
    return deviceInfo.path === undefined
        ? undefined
        : new NativeAsusRogHidTransport(openDevice(deviceInfo.path));
}

function logAsusRogExchangeOutcome(
    request: AsusRogBatteryRequest,
    outcome:
        | "response"
        | "knownNoData"
        | "outOfRange"
        | "malformed"
        | "timeout"
        | "ioError",
    unrelatedReportCount: number,
): void {
    log.atDebug()
        .everyMs(
            `asus-rog-exchange:${request.kind}:${outcome}`,
            ASUS_ROG_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() =>
            [
                "ASUS ROG battery exchange",
                `kind=${request.kind}`,
                `outcome=${outcome}`,
                `unrelatedReports=${unrelatedReportCount}`,
            ].join(" "),
        );
}
