/**
 * ASUS ROG battery protocol facts used by the vendor HID battery reader.
 *
 * Keyboard offsets come from local RX96, Falchion RX Low Profile, and Azoth
 * probes. Mouse offsets and allowlist shape are cross-checked against
 * G-Helper model files, but no G-Helper implementation code is copied here.
 */

export const ASUS_ROG_VENDOR_ID = 0x0b05;
export const ASUS_ROG_OMNI_RECEIVER_PRODUCT_ID = 0x1ace;
export const ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE = 0xff00;
export const ASUS_ROG_BATTERY_REPORT_LENGTH = 64;

const ASUS_ROG_KEYBOARD_REPORT_ID = 0x02;
const ASUS_ROG_GET_FAMILY_BYTE = 0x12;
const ASUS_ROG_KEYBOARD_BATTERY_SUBCOMMAND = 0x01;
const ASUS_ROG_MOUSE_BATTERY_SUBCOMMAND = 0x07;

export type AsusRogBatteryRequestKind =
    | "keyboardOmni"
    | "keyboardWired"
    | "mouseDirect";

export interface AsusRogBatteryRequest {
    readonly kind: AsusRogBatteryRequestKind;
    readonly bytes: readonly number[];
}

export type AsusRogBatteryParser = (
    report: readonly number[],
) => AsusRogBatteryParseResult;

export type AsusRogBatteryParseResult =
    | {
          readonly state: "battery";
          readonly reading: AsusRogBatteryReading;
      }
    | {
          readonly state: "noData";
          readonly reason: "knownNoData" | "outOfRange";
      }
    | {
          readonly state: "unrelated";
      }
    | {
          readonly state: "malformed";
      };

export interface AsusRogBatteryReading {
    readonly percent: number;
    readonly rawChargingByte?: number;
    readonly chargingState?: AsusRogChargingState;
}

export type AsusRogChargingState = "charging" | "notCharging" | "unknown";

export type AsusRogMouseBatteryParserKind =
    | "rawPercentAt5"
    | "quarterPercentAt5"
    | "quarterPercentAt7";

/** Builds the verified Omni keyboard battery request. */
export function buildAsusRogKeyboardOmniBatteryRequest(): AsusRogBatteryRequest {
    return {
        kind: "keyboardOmni",
        bytes: padReport([
            ASUS_ROG_KEYBOARD_REPORT_ID,
            ASUS_ROG_GET_FAMILY_BYTE,
            ASUS_ROG_KEYBOARD_BATTERY_SUBCOMMAND,
        ]),
    };
}

/**
 * Builds the verified wired-style keyboard battery request.
 *
 * Local HID probes write report id `0x02` followed by the `12 01` GET
 * payload. Device responses may return without the report id, so the parser
 * accepts both response shapes while keeping offsets explicit.
 */
export function buildAsusRogKeyboardWiredBatteryRequest(): AsusRogBatteryRequest {
    return {
        kind: "keyboardWired",
        bytes: padReport([
            ASUS_ROG_KEYBOARD_REPORT_ID,
            ASUS_ROG_GET_FAMILY_BYTE,
            ASUS_ROG_KEYBOARD_BATTERY_SUBCOMMAND,
        ]),
    };
}

/** Builds the G-Helper-cross-checked ROG mouse battery GET request. */
export function buildAsusRogMouseBatteryRequest(
    reportId: number,
): AsusRogBatteryRequest {
    return {
        kind: "mouseDirect",
        bytes: padReport([
            reportId,
            ASUS_ROG_GET_FAMILY_BYTE,
            ASUS_ROG_MOUSE_BATTERY_SUBCOMMAND,
        ]),
    };
}

export function parseAsusRogKeyboardOmniBatteryReport(
    report: readonly number[],
): AsusRogBatteryParseResult {
    // The receiver returns this explicit no-data shape when no paired keyboard
    // battery response is available on the Omni keyboard collection.
    if (startsWith(report, [ASUS_ROG_KEYBOARD_REPORT_ID, 0xff, 0xaa])) {
        return { state: "noData", reason: "knownNoData" };
    }

    // Armoury Crate and other ASUS SDK reads can interleave unrelated reports
    // on the same vendor queue. Prefix mismatch is not a parser failure.
    if (
        !startsWith(report, [
            ASUS_ROG_KEYBOARD_REPORT_ID,
            ASUS_ROG_GET_FAMILY_BYTE,
            ASUS_ROG_KEYBOARD_BATTERY_SUBCOMMAND,
        ])
    ) {
        return { state: "unrelated" };
    }

    return parseAsusRogPercentAndCharging(report, {
        percentIndex: 6,
        chargingIndex: 9,
    });
}

export function parseAsusRogKeyboardWiredBatteryReport(
    report: readonly number[],
): AsusRogBatteryParseResult {
    // Wired-style keyboard routes can return the known FF AA no-data shape
    // without a leading report id.
    if (isAsusRogWiredKeyboardNoDataReport(report)) {
        return { state: "noData", reason: "knownNoData" };
    }

    // The native HID binding may return input reports with or without the
    // report id byte, depending on the collection. Keep both offset sets
    // explicit instead of normalizing by shifting bytes.
    if (
        startsWith(report, [
            ASUS_ROG_GET_FAMILY_BYTE,
            ASUS_ROG_KEYBOARD_BATTERY_SUBCOMMAND,
        ])
    ) {
        return parseAsusRogPercentAndCharging(report, {
            percentIndex: 5,
            chargingIndex: 8,
        });
    }

    if (
        startsWith(report, [
            ASUS_ROG_KEYBOARD_REPORT_ID,
            ASUS_ROG_GET_FAMILY_BYTE,
            ASUS_ROG_KEYBOARD_BATTERY_SUBCOMMAND,
        ])
    ) {
        return parseAsusRogPercentAndCharging(report, {
            percentIndex: 6,
            chargingIndex: 9,
        });
    }

    return { state: "unrelated" };
}

export function parseAsusRogMouseBatteryReport(
    report: readonly number[],
    input: {
        readonly reportId: number;
        readonly parserKind: AsusRogMouseBatteryParserKind;
    },
): AsusRogBatteryParseResult {
    // G-Helper model facts show the mouse battery family as 12 07, but report
    // id and percent scaling vary by model. The route table supplies those
    // per-model facts and this parser rejects every other report shape.
    if (startsWith(report, [input.reportId, 0xff, 0xaa])) {
        return { state: "noData", reason: "knownNoData" };
    }

    if (
        !startsWith(report, [
            input.reportId,
            ASUS_ROG_GET_FAMILY_BYTE,
            ASUS_ROG_MOUSE_BATTERY_SUBCOMMAND,
        ])
    ) {
        return { state: "unrelated" };
    }

    const rawPercentIndex = resolveAsusRogMouseRawPercentIndex(
        input.parserKind,
    );
    if (report.length <= rawPercentIndex) {
        return { state: "malformed" };
    }

    const percent = scaleAsusRogMouseBatteryByte(
        report[rawPercentIndex],
        input.parserKind,
    );
    if (!isBatteryPercent(percent)) {
        return { state: "noData", reason: "outOfRange" };
    }

    return {
        state: "battery",
        reading: {
            percent,
            rawChargingByte: report[10],
            chargingState: parseAsusRogChargingState(report[10]),
        },
    };
}

function parseAsusRogPercentAndCharging(
    report: readonly number[],
    offsets: {
        readonly percentIndex: number;
        readonly chargingIndex: number;
    },
): AsusRogBatteryParseResult {
    if (
        report.length <= offsets.percentIndex ||
        report.length <= offsets.chargingIndex
    ) {
        return { state: "malformed" };
    }

    const percent = report[offsets.percentIndex];
    if (!isBatteryPercent(percent)) {
        return { state: "noData", reason: "outOfRange" };
    }

    return {
        state: "battery",
        reading: {
            percent,
            rawChargingByte: report[offsets.chargingIndex],
            chargingState: parseAsusRogChargingState(
                report[offsets.chargingIndex],
            ),
        },
    };
}

function isAsusRogWiredKeyboardNoDataReport(
    report: readonly number[],
): boolean {
    return (
        report.length >= 5 &&
        report[0] === 0xff &&
        report[1] === 0xaa &&
        report[4] === 0xff
    );
}

function parseAsusRogChargingState(
    value: number | undefined,
): AsusRogChargingState | undefined {
    switch (value) {
        case 0x00:
            return "notCharging";
        case 0x01:
            return "charging";
        case undefined:
            return undefined;
        default:
            return "unknown";
    }
}

function resolveAsusRogMouseRawPercentIndex(
    kind: AsusRogMouseBatteryParserKind,
): number {
    switch (kind) {
        case "rawPercentAt5":
        case "quarterPercentAt5":
            return 5;
        case "quarterPercentAt7":
            return 7;
    }
}

function scaleAsusRogMouseBatteryByte(
    value: number,
    kind: AsusRogMouseBatteryParserKind,
): number {
    switch (kind) {
        case "rawPercentAt5":
            return value;
        case "quarterPercentAt5":
        case "quarterPercentAt7":
            // Older G-Helper mouse models report battery in 25 percent units.
            return value * 25;
    }
}

function padReport(bytes: readonly number[]): readonly number[] {
    return [
        ...bytes,
        ...Array.from(
            {
                length: Math.max(
                    0,
                    ASUS_ROG_BATTERY_REPORT_LENGTH - bytes.length,
                ),
            },
            () => 0x00,
        ),
    ];
}

function startsWith(
    report: readonly number[],
    prefix: readonly number[],
): boolean {
    return prefix.every((value, index) => report[index] === value);
}

function isBatteryPercent(value: number): boolean {
    return value >= 0 && value <= 100;
}
