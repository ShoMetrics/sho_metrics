/**
 * Voltage-to-percent estimation derived from Solaar.
 *
 * Source: Solaar `lib/logitech_receiver/hidpp20.py`,
 * `estimate_battery_level_percentage`.
 * Copyright (C) 2012-2013 Daniel Pavel
 * Copyright (C) 2014-2024 Solaar Contributors https://pwr-solaar.github.io/Solaar/
 * License: GPL-2.0-or-later according to the source file header.
 *
 * HID++ 0x1001 reports raw millivolts rather than an explicit percentage.
 * ShoMetrics marks percentages from this helper as voltage-derived estimates.
 */

const SOLAAR_LOGITECH_BATTERY_VOLTAGE_TO_PERCENTAGE = [
    [4186, 100],
    [4067, 90],
    [3989, 80],
    [3922, 70],
    [3859, 60],
    [3811, 50],
    [3778, 40],
    [3751, 30],
    [3717, 20],
    [3671, 10],
    [3646, 5],
    [3579, 2],
    [3500, 0],
] as const;

/** Estimates Logitech battery percent from HID++ 0x1001 raw voltage. */
export function estimateSolaarLogitechBatteryPercentFromVoltageMillivolts(
    voltageMillivolts: number,
): number {
    const firstPoint = SOLAAR_LOGITECH_BATTERY_VOLTAGE_TO_PERCENTAGE[0];
    const lastPoint = SOLAAR_LOGITECH_BATTERY_VOLTAGE_TO_PERCENTAGE[
        SOLAAR_LOGITECH_BATTERY_VOLTAGE_TO_PERCENTAGE.length - 1
    ];

    if (voltageMillivolts >= firstPoint[0]) {
        return firstPoint[1];
    }

    if (voltageMillivolts <= lastPoint[0]) {
        return lastPoint[1];
    }

    for (let index = 0; index < SOLAAR_LOGITECH_BATTERY_VOLTAGE_TO_PERCENTAGE.length - 1; index += 1) {
        const highPoint = SOLAAR_LOGITECH_BATTERY_VOLTAGE_TO_PERCENTAGE[index];
        const lowPoint = SOLAAR_LOGITECH_BATTERY_VOLTAGE_TO_PERCENTAGE[index + 1];
        if (voltageMillivolts >= lowPoint[0] && voltageMillivolts <= highPoint[0]) {
            const voltageRange = highPoint[0] - lowPoint[0];
            const percentageRange = highPoint[1] - lowPoint[1];
            return Math.round(lowPoint[1] + percentageRange * (voltageMillivolts - lowPoint[0]) / voltageRange);
        }
    }

    return 0;
}
