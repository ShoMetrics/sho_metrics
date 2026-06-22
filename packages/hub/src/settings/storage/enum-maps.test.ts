import { describe, it } from "vitest";
import assert from "node:assert/strict";

import {
    catalogMetricCategoryByProto,
    catalogMetricReadingKindByProto,
    circleViewVariantByProto,
    colorModeByProto,
    diskThroughputDirectionByProto,
    diskUsageDisplayModeByProto,
    gridLineTypeByProto,
    gridLineVisibilityByProto,
    metricThemeByProto,
    metricViewByProto,
    networkDirectionByProto,
    networkMetricKindByProto,
    networkTrafficDisplayModeByProto,
    networkUnitBaseByProto,
    scaleModeByProto,
    sourceFailureModeByProto,
    temperatureUnitByProto,
    terminalPalettePresetByProto,
    terminalThemeVariantByProto,
    textViewVariantByProto,
} from "./resolver/stored-to-resolved-enum-maps";
import {
    storedCatalogMetricCategoryByResolved,
    storedCatalogMetricReadingKindByResolved,
    storedCircleViewVariantByResolved,
    storedColorModeByResolved,
    storedDiskThroughputDirectionByResolved,
    storedDiskUsageDisplayModeByResolved,
    storedGridLineTypeByResolved,
    storedGridLineVisibilityByResolved,
    storedMetricViewByResolved,
    storedNetworkDirectionByResolved,
    storedNetworkMetricKindByResolved,
    storedNetworkTrafficDisplayModeByResolved,
    storedNetworkUnitBaseByResolved,
    storedScaleModeByResolved,
    storedSourceFailureModeByResolved,
    storedTemperatureUnitByResolved,
    storedTerminalPalettePresetByResolved,
    storedTerminalThemeVariantByResolved,
    storedTextViewVariantByResolved,
    storedThemeByResolved,
} from "./resolved-to-stored-enum-maps";

describe("settings enum maps", () => {
    const bidirectionalMapCases = [
        ["metric view", metricViewByProto, storedMetricViewByResolved],
        ["circle view variant", circleViewVariantByProto, storedCircleViewVariantByResolved],
        ["text view variant", textViewVariantByProto, storedTextViewVariantByResolved],
        ["metric theme", metricThemeByProto, storedThemeByResolved],
        ["terminal theme variant", terminalThemeVariantByProto, storedTerminalThemeVariantByResolved],
        ["terminal palette preset", terminalPalettePresetByProto, storedTerminalPalettePresetByResolved],
        ["color mode", colorModeByProto, storedColorModeByResolved],
        ["grid line visibility", gridLineVisibilityByProto, storedGridLineVisibilityByResolved],
        ["grid line type", gridLineTypeByProto, storedGridLineTypeByResolved],
        ["scale mode", scaleModeByProto, storedScaleModeByResolved],
        ["network unit base", networkUnitBaseByProto, storedNetworkUnitBaseByResolved],
        ["source failure mode", sourceFailureModeByProto, storedSourceFailureModeByResolved],
        ["temperature unit", temperatureUnitByProto, storedTemperatureUnitByResolved],
        ["network direction", networkDirectionByProto, storedNetworkDirectionByResolved],
        ["network metric kind", networkMetricKindByProto, storedNetworkMetricKindByResolved],
        ["network traffic display mode", networkTrafficDisplayModeByProto, storedNetworkTrafficDisplayModeByResolved],
        ["catalog metric category", catalogMetricCategoryByProto, storedCatalogMetricCategoryByResolved],
        ["catalog metric reading kind", catalogMetricReadingKindByProto, storedCatalogMetricReadingKindByResolved],
        ["disk usage display mode", diskUsageDisplayModeByProto, storedDiskUsageDisplayModeByResolved],
        ["disk throughput direction", diskThroughputDirectionByProto, storedDiskThroughputDirectionByResolved],
    ] as const;

    for (const [name, resolvedValueByProtoValue, protoValueByResolvedValue] of bidirectionalMapCases) {
        it(`keeps ${name} maps paired`, () => {
            assertResolvedValuesRoundTrip(name, resolvedValueByProtoValue, protoValueByResolvedValue);
            assertProtoValuesRoundTrip(name, resolvedValueByProtoValue, protoValueByResolvedValue);
        });
    }
});

function assertResolvedValuesRoundTrip(
    mapName: string,
    resolvedValueByProtoValue: Readonly<Record<number, string | undefined>>,
    protoValueByResolvedValue: Readonly<Record<string, number>>,
): void {
    for (const [resolvedValue, protoValue] of Object.entries(protoValueByResolvedValue)) {
        assert.equal(
            resolvedValueByProtoValue[protoValue],
            resolvedValue,
            `${mapName}: resolved value ${resolvedValue} should round-trip through stored proto ${protoValue}`,
        );
    }
}

function assertProtoValuesRoundTrip(
    mapName: string,
    resolvedValueByProtoValue: Readonly<Record<number, string | undefined>>,
    protoValueByResolvedValue: Readonly<Record<string, number>>,
): void {
    for (const [protoValueText, resolvedValue] of Object.entries(resolvedValueByProtoValue)) {
        if (resolvedValue === undefined) {
            continue;
        }

        const protoValue = Number(protoValueText);
        assert.equal(
            protoValueByResolvedValue[resolvedValue],
            protoValue,
            `${mapName}: stored proto ${protoValue} should round-trip through resolved value ${resolvedValue}`,
        );
    }
}
