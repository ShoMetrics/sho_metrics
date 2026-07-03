import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../../../logging/node-logger";
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
            if (isWindowsServiceNotInstalledQueryError(error)) {
                return "notInstalled";
            }

            logUnknownServiceStatus("queryFailed");
            return "unknown";
        }
    },
};

export function isWindowsServiceNotInstalledQueryError(error: unknown): boolean {
    // execFile stores sc.exe's process exit code on error.code. sc.exe returns
    // the Win32 1060 code for ERROR_SERVICE_DOES_NOT_EXIST, so prefer this
    // locale-proof signal and keep output text as a fallback only.
    const exitCode = readUnknownProperty(error, "code");
    if (exitCode === 1060 || exitCode === "1060") {
        return true;
    }

    const message = [
        toError(error).message,
        readStringProperty(error, "stdout"),
        readStringProperty(error, "stderr"),
    ].filter(text => text !== undefined)
        .join("\n")
        .toLowerCase();

    return message.includes("1060") || message.includes("does not exist");
}

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

function readStringProperty(value: unknown, propertyName: string): string | undefined {
    const propertyValue = readUnknownProperty(value, propertyName);
    return typeof propertyValue === "string" ? propertyValue : undefined;
}

function readUnknownProperty(value: unknown, propertyName: string): unknown {
    return typeof value === "object" && value !== null && propertyName in value
        ? (value as Record<string, unknown>)[propertyName]
        : undefined;
}
