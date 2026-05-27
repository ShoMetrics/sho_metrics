import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../../../logging/logger";
import { toError } from "./windows-helper-grpc-errors";

const log = logger.for("Source:WindowsHelper");
const execFileAsync = promisify(execFile);

/** Cache duration for Windows service status probes. */
export const HELPER_SERVICE_STATUS_CACHE_MILLISECONDS = 30000;

// Mirrors `ServiceName` in
// packages/source-windows/ShoMetrics.Source.Windows.Contracts/WindowsSourceServiceConstants.cs.
const WINDOWS_HELPER_SERVICE_NAME = "ShoMetrics Source Windows";

export type WindowsHelperServiceStatus = "unknown" | "notInstalled" | "installedStopped" | "running";

/** Reads packaged Windows service status without touching the metric pipe. */
export interface WindowsHelperServiceStatusReader {
    readStatus(): Promise<WindowsHelperServiceStatus>;
}

export const windowsServiceStatusReader: WindowsHelperServiceStatusReader = {
    async readStatus(): Promise<WindowsHelperServiceStatus> {
        try {
            const { stdout } = await execFileAsync(
                "sc.exe",
                ["query", WINDOWS_HELPER_SERVICE_NAME],
                { windowsHide: true },
            );
            const output = stdout.toLowerCase();

            if (output.includes("running")) {
                return "running";
            }

            if (output.includes("stopped")
                || output.includes("stop_pending")
                || output.includes("start_pending")) {
                return "installedStopped";
            }

            logUnknownServiceStatus("unrecognizedOutput");
            return "unknown";
        } catch (error) {
            const message = toError(error).message.toLowerCase();
            if (message.includes("1060") || message.includes("does not exist")) {
                return "notInstalled";
            }

            logUnknownServiceStatus("queryFailed");
            return "unknown";
        }
    },
};

function logUnknownServiceStatus(reason: "queryFailed" | "unrecognizedOutput"): void {
    log.atWarn()
        .everyMs(
            `service-status-unknown:${reason}`,
            HELPER_SERVICE_STATUS_CACHE_MILLISECONDS,
        )
        .log(() => [
            "windowsHelperServiceStatusUnknown",
            `reason=${reason}`,
        ].join(" "));
}
