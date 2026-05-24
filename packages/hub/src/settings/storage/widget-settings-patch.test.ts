import assert from "node:assert/strict";
import test from "node:test";
import {
    ColorMode as StoredColorMode,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricTheme as StoredMetricTheme,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TextViewVariant as StoredTextViewVariant,
} from "../../generated/shometrics/v1/settings_pb";
import { readStoredWidgetSettings } from "./codec";
import { resolveQuickStartStoredWidgetSettings } from "./quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "./widget-settings-patch";
import {
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
} from "../../runtime/sources/source-ids";

test("widget patch fails before quick-start metric initialization", () => {
    assert.throws(
        () => writeStoredWidgetSettingsPatch(undefined, {
            network: {
                direction: "download",
            },
        }),
        /quick-start widget initialization/,
    );
});

test("widget patch fails when the patch domain does not match the current metric", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    assert.throws(
        () => writeStoredWidgetSettingsPatch(cpuSettings, {
            network: {
                direction: "download",
            },
        }),
        /non-network metric/,
    );
});

test("widget patch updates GPU reading within the GPU action domain", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        gpu: {
            kind: "power",
        },
    });

    const target = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.metric?.target;
    assert.equal(target?.case, "gpu");
    if (target?.case === "gpu") {
        assert.equal(target.value.kind, StoredGpuMetricKind.POWER);
    }
});

test("widget patch writes black-white color mode", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                flat: {
                    paint: {
                        colorMode: "black-white",
                    },
                },
            },
        },
    });

    const appearance = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.overrides?.appearance;
    assert.equal(appearance?.theme?.flat?.paint?.colorMode, StoredColorMode.BLACK_WHITE);
});

test("widget patch replaces metric source policy with helper preference and fallback", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
            fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
            failureMode: "useFallback",
        },
    });

    const sourcePolicy = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID]);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
});

test("widget patch replaces metric source policy with node preference and fallback", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
            fallbackSourceProfileIds: [BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID],
            failureMode: "useFallback",
        },
    });

    const sourcePolicy = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, [BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID]);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
});

test("widget patch clears source policy fallback state when returning to auto", () => {
    const gpuSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings,
        {
            source: {
                primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
                fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
                failureMode: "useFallback",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: undefined,
            fallbackSourceProfileIds: [],
            failureMode: "showUnavailable",
        },
    });

    const sourcePolicy = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, undefined);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, []);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.SHOW_UNAVAILABLE);
});

test("widget patch writes terminal theme", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
            },
        },
    });

    const appearance = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.overrides?.appearance;
    assert.equal(appearance?.theme?.selectedTheme, StoredMetricTheme.TERMINAL);
});

test("widget patch writes text view variant", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            view: {
                selectedView: "text",
                textVariant: "title-card",
            },
        },
    });

    const appearance = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.overrides?.appearance;
    assert.equal(appearance?.view?.textVariant, StoredTextViewVariant.TITLE_CARD);
});

test("widget patch writes terminal variant", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
                terminal: {
                    variant: "vintage",
                },
            },
        },
    });

    const appearance = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.overrides?.appearance;
    assert.equal(appearance?.theme?.terminal?.variant, StoredTerminalThemeVariant.VINTAGE);
});

test("widget patch writes terminal palette", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
                terminal: {
                    paint: {
                        preset: "amber",
                    },
                },
            },
        },
    });

    const appearance = readStoredWidgetSettings(nextSettings).settings.widget.value?.slot?.overrides?.appearance;
    assert.equal(appearance?.theme?.terminal?.paint?.preset, StoredTerminalPalettePreset.AMBER);
});
