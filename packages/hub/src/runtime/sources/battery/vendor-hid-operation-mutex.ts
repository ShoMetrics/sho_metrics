import { logger } from "../../../logging/logger";
import { monotonicNowMilliseconds } from "../../../shared/clock";

const log = logger.for("Source:BatteryHID");
const VENDOR_HID_MUTEX_LOG_INTERVAL_MILLISECONDS = 30_000;
const EVENT_LOOP_LAG_PROBE_INTERVAL_MILLISECONDS = 20;

type MutexOperation<T> = () => T | Promise<T>;

interface QueuedMutexOperation<T> {
    readonly label: string;
    readonly enqueuedAtMonotonicMilliseconds: number;
    readonly operation: MutexOperation<T>;
    readonly resolve: (value: T) => void;
    readonly reject: (reason: unknown) => void;
}

/**
 * Serializes vendor HID operations through one async mutex.
 *
 * This prevents overlapping receiver transactions from stealing each other's
 * HID++ responses. It does not move node-hid off the main thread; the debug
 * lag fields below exist to measure that separate event-loop blocking cost.
 *
 * The mutex owns release through `finally`; callers provide an operation and cannot forget
 * to unlock after a timeout or exception.
 */
export class VendorHidOperationMutex {
    private readonly queue: Array<QueuedMutexOperation<unknown>> = [];
    private isRunning = false;

    run<T>(label: string, operation: MutexOperation<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({
                label,
                enqueuedAtMonotonicMilliseconds: monotonicNowMilliseconds(),
                operation,
                resolve: resolve as (value: unknown) => void,
                reject,
            });
            this.drain();
        });
    }

    private drain(): void {
        if (this.isRunning) {
            return;
        }

        const queuedOperation = this.queue.shift();
        if (queuedOperation === undefined) {
            return;
        }

        this.isRunning = true;
        this.runQueuedOperation(queuedOperation).catch(error => {
            log.error(() => `Vendor HID operation mutex internal failure: ${String(error)}`);
        });
    }

    private async runQueuedOperation(queuedOperation: QueuedMutexOperation<unknown>): Promise<void> {
        const waitMilliseconds = monotonicNowMilliseconds() - queuedOperation.enqueuedAtMonotonicMilliseconds;
        log.atInfo()
            .everyMs(`vendor-hid-operation-mutex:${queuedOperation.label}`, VENDOR_HID_MUTEX_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "vendorHidOperationMutex",
                `label=${queuedOperation.label}`,
                `waitMs=${waitMilliseconds}`,
                `queued=${this.queue.length}`,
            ].join(" "));

        const operationStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        const eventLoopProbeStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        let eventLoopProbeFiredAtMonotonicMilliseconds: number | undefined;
        const eventLoopProbeTimer = setTimeout(() => {
            eventLoopProbeFiredAtMonotonicMilliseconds = monotonicNowMilliseconds();
        }, 0);
        let eventLoopLagProbeLastAtMonotonicMilliseconds = eventLoopProbeStartedAtMonotonicMilliseconds;
        let maxEventLoopLagMilliseconds = 0;
        const eventLoopLagProbeInterval = setInterval(() => {
            const nowMilliseconds = monotonicNowMilliseconds();
            maxEventLoopLagMilliseconds = Math.max(
                maxEventLoopLagMilliseconds,
                nowMilliseconds
                    - eventLoopLagProbeLastAtMonotonicMilliseconds
                    - EVENT_LOOP_LAG_PROBE_INTERVAL_MILLISECONDS,
            );
            eventLoopLagProbeLastAtMonotonicMilliseconds = nowMilliseconds;
        }, EVENT_LOOP_LAG_PROBE_INTERVAL_MILLISECONDS);
        let outcome = "success";

        try {
            queuedOperation.resolve(await queuedOperation.operation());
        } catch (error) {
            outcome = "error";
            queuedOperation.reject(error);
        } finally {
            await new Promise(resolve => setTimeout(resolve, 0));
            const completedAtMonotonicMilliseconds = monotonicNowMilliseconds();
            const eventLoopBlockedMilliseconds = (eventLoopProbeFiredAtMonotonicMilliseconds ?? completedAtMonotonicMilliseconds)
                - eventLoopProbeStartedAtMonotonicMilliseconds;
            clearTimeout(eventLoopProbeTimer);
            clearInterval(eventLoopLagProbeInterval);
            log.debug(() => [
                "vendorHidOperationMutex",
                `label=${queuedOperation.label}`,
                `outcome=${outcome}`,
                `waitMs=${Math.round(waitMilliseconds)}`,
                `operationMs=${Math.round(completedAtMonotonicMilliseconds - operationStartedAtMonotonicMilliseconds)}`,
                `eventLoopBlockedMs=${Math.round(eventLoopBlockedMilliseconds)}`,
                `eventLoopLagMaxMs=${Math.round(maxEventLoopLagMilliseconds)}`,
                `queued=${this.queue.length}`,
            ].join(" "));
            this.isRunning = false;
            this.drain();
        }
    }
}

export const vendorHidOperationMutex = new VendorHidOperationMutex();
