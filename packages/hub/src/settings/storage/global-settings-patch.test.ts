import assert from "node:assert/strict";
import { test } from "vitest";
import {
    ColorMode as StoredColorMode,
    MetricView as StoredMetricView,
    MetricTheme as StoredMetricTheme,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    ScaleMode as StoredScaleMode,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TextViewVariant as StoredTextViewVariant,
} from "../../generated/proto/shometrics/v1/settings_pb";
import { readStoredGlobalSettings } from "./codec";
import {
    deleteStoredCustomHttpCredential,
    upsertStoredCustomHttpCredential,
    writeStoredGlobalSettingsPatch,
} from "./global-settings-patch";

test("global settings patch writes global master override", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        globalOverrideEnabled: true,
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    assert.equal(settings.overrides?.enabled, true);
    assert.equal(settings.overrides?.view, undefined);
    assert.equal(settings.overrides?.theme, undefined);
    assert.equal(settings.overrides?.paint, undefined);
});

test("global settings patch writes System feature settings", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        system: {
            experimentalVendorHidBatteryEnabled: false,
        },
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    assert.equal(settings.system?.experimentalVendorHidBatteryEnabled, false);
});

test("global settings patch writes nested view theme and paint overrides", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        viewOverrideEnabled: false,
        themeOverrideEnabled: true,
        paintOverrideEnabled: true,
        view: {
            selectedView: "bar",
            textVariant: "title-card",
        },
        theme: {
            selectedTheme: "color-filled",
            terminal: {
                variant: "vintage",
            },
        },
        paint: {
            metric: {
                colorMode: "black-white",
            },
            terminal: {
                preset: "cyan",
            },
        },
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    const overrides = settings.overrides;

    assert.equal(overrides?.view?.enabled, false);
    assert.equal(overrides?.view?.view?.selectedView, StoredMetricView.BAR);
    assert.equal(overrides?.view?.view?.textVariant, StoredTextViewVariant.TITLE_CARD);
    assert.equal(overrides?.theme?.enabled, true);
    assert.equal(overrides?.theme?.theme?.selectedTheme, StoredMetricTheme.COLOR_FILLED);
    assert.equal(overrides?.theme?.theme?.terminal?.variant, StoredTerminalThemeVariant.VINTAGE);
    assert.equal(overrides?.paint?.enabled, true);
    assert.equal(overrides?.paint?.metric?.colorMode, StoredColorMode.BLACK_WHITE);
    assert.equal(overrides?.paint?.terminal?.preset, StoredTerminalPalettePreset.CYAN);
});

test("global settings patch writes pixel window theme", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        themeOverrideEnabled: true,
        theme: {
            selectedTheme: "pixel-window",
        },
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    assert.equal(settings.overrides?.theme?.enabled, true);
    assert.equal(settings.overrides?.theme?.theme?.selectedTheme, StoredMetricTheme.PIXEL_WINDOW);
});

test("global settings patch writes transparent surface override", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        transparentSurfaceOverrideEnabled: true,
        transparentSurface: {
            enabled: true,
            backgroundOpacityPercent: 45,
            textOutlinePercent: 55,
            shapeOutlinePercent: 65,
        },
    });

    const transparentSurface = readStoredGlobalSettings(nextSettings).settings.overrides
        ?.transparentSurface?.transparentSurface;

    assert.equal(readStoredGlobalSettings(nextSettings).settings.overrides?.transparentSurface?.enabled, true);
    assert.equal(transparentSurface?.enabled, true);
    assert.equal(transparentSurface?.backgroundOpacityPercent, 45);
    assert.equal(transparentSurface?.textOutlinePercent, 55);
    assert.equal(transparentSurface?.shapeOutlinePercent, 65);
});

test("global settings patch writes network and disk throughput defaults", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        network: {
            scaleMode: "custom",
            maximumDownloadSpeedMegabitsPerSecond: 250,
            maximumUploadSpeedMegabitsPerSecond: 100,
            unitBase: "bit",
        },
        diskThroughput: {
            scaleMode: "custom",
            maximumReadThroughputMebibytesPerSecond: 500,
            maximumWriteThroughputMebibytesPerSecond: 300,
        },
    });

    const defaults = readStoredGlobalSettings(nextSettings).settings.defaults;

    assert.equal(defaults?.network?.scaleMode, StoredScaleMode.CUSTOM);
    assert.equal(defaults?.network?.maximumDownloadSpeedMegabitsPerSecond, 250);
    assert.equal(defaults?.network?.maximumUploadSpeedMegabitsPerSecond, 100);
    assert.equal(defaults?.network?.unitBase, StoredNetworkUnitBase.BIT);
    assert.equal(defaults?.diskThroughput?.scaleMode, StoredScaleMode.CUSTOM);
    assert.equal(defaults?.diskThroughput?.maximumReadThroughputMebibytesPerSecond, 500);
    assert.equal(defaults?.diskThroughput?.maximumWriteThroughputMebibytesPerSecond, 300);
});

test("global settings patch clears optional default maxima without clearing mode choices", () => {
    const initialSettings = writeStoredGlobalSettingsPatch(undefined, {
        network: {
            scaleMode: "custom",
            maximumDownloadSpeedMegabitsPerSecond: 250,
            maximumUploadSpeedMegabitsPerSecond: 100,
            unitBase: "bit",
        },
        diskThroughput: {
            scaleMode: "custom",
            maximumReadThroughputMebibytesPerSecond: 500,
            maximumWriteThroughputMebibytesPerSecond: 300,
        },
    });

    const nextSettings = writeStoredGlobalSettingsPatch(initialSettings, {
        network: {
            maximumDownloadSpeedMegabitsPerSecond: undefined,
            maximumUploadSpeedMegabitsPerSecond: undefined,
        },
        diskThroughput: {
            maximumReadThroughputMebibytesPerSecond: undefined,
            maximumWriteThroughputMebibytesPerSecond: undefined,
        },
    });

    const defaults = readStoredGlobalSettings(nextSettings).settings.defaults;

    assert.equal(defaults?.network?.scaleMode, StoredScaleMode.CUSTOM);
    assert.equal(defaults?.network?.maximumDownloadSpeedMegabitsPerSecond, undefined);
    assert.equal(defaults?.network?.maximumUploadSpeedMegabitsPerSecond, undefined);
    assert.equal(defaults?.network?.unitBase, StoredNetworkUnitBase.BIT);
    assert.equal(defaults?.diskThroughput?.scaleMode, StoredScaleMode.CUSTOM);
    assert.equal(defaults?.diskThroughput?.maximumReadThroughputMebibytesPerSecond, undefined);
    assert.equal(defaults?.diskThroughput?.maximumWriteThroughputMebibytesPerSecond, undefined);
});

test("global settings credential patch upserts complete Custom HTTP credentials", () => {
    const initialSettings = upsertStoredCustomHttpCredential(undefined, {
        id: "credential-1",
        nickname: "LHM",
        authKind: "basic",
        username: "admin",
        password: "old-password",
        createdAtMilliseconds: 1_700_000_000_000,
        updatedAtMilliseconds: 1_700_000_000_000,
    });

    const nextSettings = upsertStoredCustomHttpCredential(initialSettings, {
        id: "credential-1",
        nickname: "LHM updated",
        authKind: "basic",
        username: "admin",
        password: "new-password",
        createdAtMilliseconds: 1_700_000_000_000,
        updatedAtMilliseconds: 1_700_000_001_000,
    });

    const credentials = readStoredGlobalSettings(nextSettings).settings.customHttpCredentials;
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0]?.id, "credential-1");
    assert.equal(credentials[0]?.nickname, "LHM updated");
    assert.equal(credentials[0]?.auth.case, "basic");
    if (credentials[0]?.auth.case === "basic") {
        assert.equal(credentials[0].auth.value.username, "admin");
        assert.equal(credentials[0].auth.value.password, "new-password");
    }
});

test("global settings credential patch allows duplicate nicknames and contexts", () => {
    const firstSettings = upsertStoredCustomHttpCredential(undefined, {
        id: "credential-1",
        nickname: "LHM",
        authKind: "query",
        queryParameterName: "api_key",
        token: "token-1",
    });

    const nextSettings = upsertStoredCustomHttpCredential(firstSettings, {
        id: "credential-2",
        nickname: "LHM",
        authKind: "query",
        queryParameterName: "api_key",
        token: "token-2",
    });

    const credentials = readStoredGlobalSettings(nextSettings).settings.customHttpCredentials;
    assert.equal(credentials.length, 2);
    assert.deepEqual(credentials.map((credential) => credential.id), ["credential-1", "credential-2"]);
    assert.deepEqual(credentials.map((credential) => credential.nickname), ["LHM", "LHM"]);
});

test("global settings credential patch preserves existing secret when replacement omits it", () => {
    const initialSettings = upsertStoredCustomHttpCredential(undefined, {
        id: "credential-1",
        nickname: "Weather",
        authKind: "query",
        queryParameterName: "api_key",
        token: "secret-token",
    });

    const nextSettings = upsertStoredCustomHttpCredential(initialSettings, {
        id: "credential-1",
        nickname: "Weather updated",
        authKind: "query",
        queryParameterName: "token",
        token: undefined,
    });

    const credential = readStoredGlobalSettings(nextSettings).settings.customHttpCredentials[0];
    assert.equal(credential?.nickname, "Weather updated");
    assert.equal(credential?.auth.case, "query");
    if (credential?.auth.case === "query") {
        assert.equal(credential.auth.value.queryParameterName, "token");
        assert.equal(credential.auth.value.token, "secret-token");
    }
});

test("global settings credential patch deletes credentials without scanning widget references", () => {
    const firstSettings = upsertStoredCustomHttpCredential(undefined, {
        id: "credential-1",
        nickname: "LHM",
        authKind: "bearer",
        token: "token-1",
    });
    const secondSettings = upsertStoredCustomHttpCredential(firstSettings, {
        id: "credential-2",
        nickname: "Weather",
        authKind: "header",
        headerName: "X-API-Key",
        token: "token-2",
    });

    const nextSettings = deleteStoredCustomHttpCredential(secondSettings, "credential-1");

    const credentials = readStoredGlobalSettings(nextSettings).settings.customHttpCredentials;
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0]?.id, "credential-2");
});
