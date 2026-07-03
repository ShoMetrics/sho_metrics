import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../../../../logging/node-logger";
import {
    asArray,
    asRecord,
    buildMacOsBluetoothExecFileOptions,
    parsePlistXmlValue,
} from "./macos-process";

const log = logger.for("Source:NodeSystem:BluetoothBattery:IOKitHID");
const IOKIT_HID_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 60_000;

const execFileAsync = promisify(execFile);

/**
 * Supplies command execution and plist parsing for the IOKit HID event service query.
 */
export interface IokitHidEventServiceDependencies {
    readonly execFile: (path: string, arguments_: readonly string[]) => Promise<string>;
    readonly parsePlistXmlValue: (xml: string) => Promise<unknown>;
}

/**
 * Reads AppleDeviceManagementHIDEventService properties through ioreg.
 *
 * This is the Node-only equivalence helper for Stats `Kit/helpers.swift:fetchIOService`.
 * The structured archive path is preferred because it avoids scraping the ioreg
 * text tree; the text parser is retained only as a fallback for hosts where
 * `ioreg -a` fails before returning plist data.
 */
export async function fetchAppleDeviceManagementHIDEventServiceProperties(
    dependencies: IokitHidEventServiceDependencies = createIokitHidEventServiceDependencies(),
): Promise<readonly Record<string, unknown>[]> {
    try {
        const stdout = await dependencies.execFile("/usr/sbin/ioreg", [
            "-a",
            "-r",
            "-c",
            "AppleDeviceManagementHIDEventService",
            "-l",
            "-w",
            "0",
        ]);
        return await parseAppleDeviceManagementHIDEventServiceArchiveXml(stdout, dependencies.parsePlistXmlValue);
    } catch (error) {
        log.atDebug()
            .everyMs("iokit-hid-event-service-archive-fallback", IOKIT_HID_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => `iokitHidEventServiceArchiveFallback reason=${formatErrorMessage(error)}`);
    }

    const stdout = await dependencies.execFile("/usr/sbin/ioreg", [
        "-r",
        "-c",
        "AppleDeviceManagementHIDEventService",
        "-l",
        "-w",
        "0",
    ]);
    return parseAppleDeviceManagementHIDEventServiceTextOutput(stdout);
}

/**
 * Parses ioreg archive plist output into IOKit HID event service dictionaries.
 *
 * ioreg archive output may contain plist `data` values such as `BD_ADDR`.
 * `plutil -convert json` rejects those, so this parser rewrites data payloads
 * to lower-case hex strings before converting through plutil. Empty or
 * malformed data blocks are left untouched; if plutil rejects the archive, the
 * caller falls back to the text parser. The text fallback exposes the same
 * values as `<hex>`, which keeps both query paths aligned.
 */
export async function parseAppleDeviceManagementHIDEventServiceArchiveXml(
    xml: string,
    parsePlistXmlValue: (xml: string) => Promise<unknown>,
): Promise<readonly Record<string, unknown>[]> {
    const parsedArchive = await parsePlistXmlValue(rewritePlistDataValuesAsHexStrings(xml));
    return asArray(parsedArchive)?.flatMap(rawDevice => {
        const device = asRecord(rawDevice);
        return device === undefined ? [] : [device];
    }) ?? [];
}

/**
 * Parses ioreg text output used as a fallback when archive plist output fails.
 *
 * This shape is not a stable formal API. Keep this parser tested against the
 * archive parser's normalized record shape so the two paths do not drift.
 */
export function parseAppleDeviceManagementHIDEventServiceTextOutput(stdout: string): readonly Record<string, unknown>[] {
    const list: Record<string, unknown>[] = [];
    let currentDevice: Record<string, unknown> | undefined;

    for (const line of stdout.split(/\r?\n/u)) {
        if (line.includes("+-o AppleDeviceManagementHIDEventService")) {
            if (currentDevice !== undefined) {
                list.push(currentDevice);
            }
            currentDevice = {};
            continue;
        }

        const match = line.match(/^\s*(?:\|\s*)?"([^"]+)" = (.*)$/u);
        if (currentDevice === undefined || match?.[1] === undefined || match[2] === undefined) {
            continue;
        }

        currentDevice[match[1]] = parseIoregPropertyValue(match[2]);
    }

    if (currentDevice !== undefined) {
        list.push(currentDevice);
    }

    return list;
}

function createIokitHidEventServiceDependencies(): IokitHidEventServiceDependencies {
    return {
        execFile: async (path, arguments_) => {
            const { stdout } = await execFileAsync(path, [...arguments_], buildMacOsBluetoothExecFileOptions());
            return stdout;
        },
        parsePlistXmlValue,
    };
}

function rewritePlistDataValuesAsHexStrings(xml: string): string {
    return xml.replaceAll(/<data>\s*([A-Za-z0-9+/=\s]+?)\s*<\/data>/gu, (_match, base64Value: string) => {
        const hexValue = Buffer.from(base64Value.replaceAll(/\s/gu, ""), "base64").toString("hex");
        return `<string>${hexValue}</string>`;
    });
}

function parseIoregPropertyValue(value: string): unknown {
    const trimmedValue = value.trim();
    if (trimmedValue === "Yes") {
        return true;
    }
    if (trimmedValue === "No") {
        return false;
    }
    if (trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")) {
        return trimmedValue.slice(1, -1);
    }
    if (/^-?\d+$/u.test(trimmedValue)) {
        return Number(trimmedValue);
    }
    if (/^<[0-9a-fA-F]+>$/u.test(trimmedValue)) {
        return trimmedValue.slice(1, -1).toLowerCase();
    }

    return trimmedValue;
}

function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
