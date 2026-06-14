import { create } from "@bufbuild/protobuf";
import { timestampFromMs, type Timestamp } from "@bufbuild/protobuf/wkt";
import {
    AppearanceThemeSettingsSchema,
    AppearanceViewSettingsSchema,
    ColorFilledMultiColorPaintSettingsSchema,
    ColorFilledPaintSettingsSchema,
    ColorFilledSolidPaintSettingsSchema,
    CustomHttpCredential_BasicSchema,
    CustomHttpCredential_BearerSchema,
    CustomHttpCredential_HeaderSchema,
    CustomHttpCredential_QuerySchema,
    CustomHttpCredentialSchema,
    DiskThroughputDisplaySettingsSchema,
    GlobalDefaultsSchema,
    GlobalOverridesSchema,
    GlobalMultiColorPaintSettingsSchema,
    GlobalPaintOverrideSchema,
    GlobalMetricPaintSettingsSchema,
    GlobalSolidPaintSettingsSchema,
    GlobalThemeOverrideSchema,
    GlobalTransparentSurfaceOverrideSchema,
    GlobalViewOverrideSchema,
    MultiColorSetSchema,
    NetworkDisplaySettingsSchema,
    TerminalPaintSettingsSchema,
    TerminalThemeSettingsSchema,
    TransparentSurfaceSettingsSchema,
    type AppearanceThemeSettings as StoredAppearanceThemeSettings,
    type ColorFilledPaintSettings as StoredColorFilledPaintSettings,
    type CustomHttpCredential as StoredCustomHttpCredential,
    type GlobalDefaults as StoredGlobalDefaults,
    type GlobalMetricPaintSettings as StoredGlobalMetricPaintSettings,
    type GlobalOverrides as StoredGlobalOverrides,
    type MultiColorSet as StoredMultiColorSet,
} from "../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    ColorMode,
    MetricTheme,
    NetworkUnitBase,
    ResolvedAppearanceViewSettings,
    ResolvedGlobalMultiColorPaintSettings,
    ResolvedGlobalSolidPaintSettings,
    ScaleMode,
    TerminalThemeVariant,
} from "../resolved-settings";
import type {
    ResolvedColorFilledPaintSettingsOverride,
    ResolvedTerminalPaintSettingsOverride,
    ResolvedTransparentSurfaceSettingsOverride,
    ResolvedMultiColorSetOverride,
} from "../appearance-overrides";
import {
    readStoredGlobalSettings,
    writeStoredGlobalSettings,
    type StoredSettingsJsonObject,
} from "./codec";
import {
    storedCircleViewVariantByResolved,
    storedColorModeByResolved,
    storedNetworkUnitBaseByResolved,
    storedTerminalPalettePresetByResolved,
    storedTerminalThemeVariantByResolved,
    storedTextViewVariantByResolved,
    storedScaleModeByResolved,
    storedMetricViewByResolved,
    storedThemeByResolved,
} from "./enum-maps";
import { applyStoredTransparentSurfacePatch } from "./transparent-surface-patch";

export interface StoredGlobalSettingsPatch {
    readonly globalOverrideEnabled?: boolean | undefined;
    readonly viewOverrideEnabled?: boolean | undefined;
    readonly themeOverrideEnabled?: boolean | undefined;
    readonly transparentSurfaceOverrideEnabled?: boolean | undefined;
    readonly paintOverrideEnabled?: boolean | undefined;
    readonly view?: Partial<ResolvedAppearanceViewSettings> | undefined;
    readonly theme?: GlobalThemeSettingsPatch | undefined;
    readonly transparentSurface?: ResolvedTransparentSurfaceSettingsOverride | undefined;
    readonly paint?: GlobalPaintSettingsPatch | undefined;
    readonly network?: Partial<{
        readonly scaleMode: ScaleMode;
        readonly maximumDownloadSpeedMegabitsPerSecond: number | undefined;
        readonly maximumUploadSpeedMegabitsPerSecond: number | undefined;
        readonly unitBase: NetworkUnitBase;
    }> | undefined;
    readonly diskThroughput?: Partial<{
        readonly scaleMode: ScaleMode;
        readonly maximumReadThroughputMebibytesPerSecond: number | undefined;
        readonly maximumWriteThroughputMebibytesPerSecond: number | undefined;
    }> | undefined;
}

export type StoredCustomHttpCredentialInput =
    | StoredCustomHttpBasicCredentialInput
    | StoredCustomHttpBearerCredentialInput
    | StoredCustomHttpHeaderCredentialInput
    | StoredCustomHttpQueryCredentialInput;

interface StoredCustomHttpCredentialBaseInput {
    readonly id: string;
    readonly nickname: string;
    readonly createdAtMilliseconds?: number | undefined;
    readonly updatedAtMilliseconds?: number | undefined;
}

export interface StoredCustomHttpBasicCredentialInput extends StoredCustomHttpCredentialBaseInput {
    readonly authKind: "basic";
    readonly username: string | undefined;
    readonly password: string | undefined;
}

export interface StoredCustomHttpBearerCredentialInput extends StoredCustomHttpCredentialBaseInput {
    readonly authKind: "bearer";
    readonly token: string | undefined;
}

export interface StoredCustomHttpHeaderCredentialInput extends StoredCustomHttpCredentialBaseInput {
    readonly authKind: "header";
    readonly headerName: string | undefined;
    readonly token: string | undefined;
}

export interface StoredCustomHttpQueryCredentialInput extends StoredCustomHttpCredentialBaseInput {
    readonly authKind: "query";
    readonly queryParameterName: string | undefined;
    readonly token: string | undefined;
}

interface GlobalThemeSettingsPatch {
    readonly selectedTheme?: MetricTheme | undefined;
    readonly terminal?: GlobalTerminalThemeSettingsPatch | undefined;
}

interface GlobalTerminalThemeSettingsPatch {
    readonly variant?: TerminalThemeVariant | undefined;
}

interface GlobalPaintSettingsPatch {
    readonly metric?: GlobalMetricPaintSettingsPatch | undefined;
    readonly colorFilled?: ResolvedColorFilledPaintSettingsOverride | undefined;
    readonly terminal?: ResolvedTerminalPaintSettingsOverride | undefined;
}

interface GlobalMetricPaintSettingsPatch {
    readonly colorMode?: ColorMode | undefined;
    readonly solid?: GlobalSolidPaintSettingsPatch | undefined;
    readonly multiColor?: GlobalMultiColorPaintSettingsPatch | undefined;
}

interface GlobalSolidPaintSettingsPatch {
    readonly color?: ResolvedGlobalSolidPaintSettings["color"] | undefined;
    readonly isGradientEnabled?: ResolvedGlobalSolidPaintSettings["isGradientEnabled"] | undefined;
}

interface GlobalMultiColorPaintSettingsPatch {
    readonly colors?: ResolvedMultiColorSetOverride | undefined;
    readonly lowThresholdPercent?: ResolvedGlobalMultiColorPaintSettings["lowThresholdPercent"] | undefined;
    readonly highThresholdPercent?: ResolvedGlobalMultiColorPaintSettings["highThresholdPercent"] | undefined;
    readonly isGradientEnabled?: ResolvedGlobalMultiColorPaintSettings["isGradientEnabled"] | undefined;
}

export function writeStoredGlobalSettingsPatch(
    rawSettings: unknown,
    patch: StoredGlobalSettingsPatch,
): StoredSettingsJsonObject {
    const settings = readStoredGlobalSettings(rawSettings).settings;

    settings.defaults ??= create(GlobalDefaultsSchema);
    settings.overrides ??= create(GlobalOverridesSchema);

    if (patch.globalOverrideEnabled !== undefined) {
        settings.overrides.enabled = patch.globalOverrideEnabled;
    }

    applyViewOverridePatch(settings.overrides, patch);
    applyThemeOverridePatch(settings.overrides, patch);
    applyTransparentSurfaceOverridePatch(settings.overrides, patch);
    applyPaintOverridePatch(settings.overrides, patch);
    applyNetworkDefaultsPatch(settings.defaults, patch.network);
    applyDiskThroughputDefaultsPatch(settings.defaults, patch.diskThroughput);

    return writeStoredGlobalSettings(settings);
}

/** Writes one complete Custom HTTP credential into plugin global settings. */
export function upsertStoredCustomHttpCredential(
    rawSettings: unknown,
    credential: StoredCustomHttpCredentialInput,
): StoredSettingsJsonObject {
    const settings = readStoredGlobalSettings(rawSettings).settings;
    const storedCredential = buildStoredCustomHttpCredential(credential);
    const credentialIndex = settings.customHttpCredentials
        .findIndex((candidateCredential) => candidateCredential.id === credential.id);

    if (credentialIndex < 0) {
        settings.customHttpCredentials.push(storedCredential);
    } else {
        settings.customHttpCredentials[credentialIndex] = storedCredential;
    }

    return writeStoredGlobalSettings(settings);
}

/** Deletes one Custom HTTP credential by opaque id. Widget references are not scanned or rewritten. */
export function deleteStoredCustomHttpCredential(
    rawSettings: unknown,
    credentialId: string,
): StoredSettingsJsonObject {
    const settings = readStoredGlobalSettings(rawSettings).settings;
    settings.customHttpCredentials = settings.customHttpCredentials
        .filter((credential) => credential.id !== credentialId);

    return writeStoredGlobalSettings(settings);
}

function buildStoredCustomHttpCredential(
    credential: StoredCustomHttpCredentialInput,
): StoredCustomHttpCredential {
    const storedCredential = create(CustomHttpCredentialSchema, {
        id: credential.id,
        nickname: credential.nickname,
        createdAt: readOptionalTimestamp(credential.createdAtMilliseconds),
        updatedAt: readOptionalTimestamp(credential.updatedAtMilliseconds),
    });

    switch (credential.authKind) {
        case "basic":
            storedCredential.auth = {
                case: "basic",
                value: create(CustomHttpCredential_BasicSchema, {
                    username: credential.username,
                    password: credential.password,
                }),
            };
            break;
        case "bearer":
            storedCredential.auth = {
                case: "bearer",
                value: create(CustomHttpCredential_BearerSchema, {
                    token: credential.token,
                }),
            };
            break;
        case "header":
            storedCredential.auth = {
                case: "header",
                value: create(CustomHttpCredential_HeaderSchema, {
                    headerName: credential.headerName,
                    token: credential.token,
                }),
            };
            break;
        case "query":
            storedCredential.auth = {
                case: "query",
                value: create(CustomHttpCredential_QuerySchema, {
                    queryParameterName: credential.queryParameterName,
                    token: credential.token,
                }),
            };
            break;
    }

    return storedCredential;
}

function readOptionalTimestamp(timestampMilliseconds: number | undefined): Timestamp | undefined {
    return timestampMilliseconds === undefined
        ? undefined
        : timestampFromMs(timestampMilliseconds);
}

function applyViewOverridePatch(
    overrides: StoredGlobalOverrides,
    patch: StoredGlobalSettingsPatch,
): void {
    if (patch.viewOverrideEnabled === undefined && patch.view === undefined) {
        return;
    }

    const viewOverride = overrides.view ??= create(GlobalViewOverrideSchema);

    if (patch.viewOverrideEnabled !== undefined) {
        viewOverride.enabled = patch.viewOverrideEnabled;
    }

    if (patch.view === undefined) {
        return;
    }

    const view = viewOverride.view ??= create(AppearanceViewSettingsSchema);
    if (patch.view.selectedView !== undefined) {
        view.selectedView = storedMetricViewByResolved[patch.view.selectedView];
    }
    if (patch.view.circleVariant !== undefined) {
        view.circleVariant = storedCircleViewVariantByResolved[patch.view.circleVariant];
    }
    if (patch.view.textVariant !== undefined) {
        view.textVariant = storedTextViewVariantByResolved[patch.view.textVariant];
    }
}

function applyThemeOverridePatch(
    overrides: StoredGlobalOverrides,
    patch: StoredGlobalSettingsPatch,
): void {
    if (patch.themeOverrideEnabled === undefined && patch.theme === undefined) {
        return;
    }

    const themeOverride = overrides.theme ??= create(GlobalThemeOverrideSchema);

    if (patch.themeOverrideEnabled !== undefined) {
        themeOverride.enabled = patch.themeOverrideEnabled;
    }

    if (patch.theme === undefined) {
        return;
    }

    applyThemeSettingsPatch(themeOverride.theme ??= create(AppearanceThemeSettingsSchema), patch.theme);
}

function applyThemeSettingsPatch(
    theme: StoredAppearanceThemeSettings,
    patch: GlobalThemeSettingsPatch,
): void {
    if (patch.selectedTheme !== undefined) {
        theme.selectedTheme = storedThemeByResolved[patch.selectedTheme];
    }
    if (patch.terminal?.variant !== undefined) {
        theme.terminal ??= create(TerminalThemeSettingsSchema);
        theme.terminal.variant = storedTerminalThemeVariantByResolved[patch.terminal.variant];
    }
}

function applyTransparentSurfaceOverridePatch(
    overrides: StoredGlobalOverrides,
    patch: StoredGlobalSettingsPatch,
): void {
    if (patch.transparentSurfaceOverrideEnabled === undefined && patch.transparentSurface === undefined) {
        return;
    }

    const transparentSurfaceOverride = overrides.transparentSurface ??= create(GlobalTransparentSurfaceOverrideSchema);

    if (patch.transparentSurfaceOverrideEnabled !== undefined) {
        transparentSurfaceOverride.enabled = patch.transparentSurfaceOverrideEnabled;
    }

    if (patch.transparentSurface !== undefined) {
        applyStoredTransparentSurfacePatch(
            transparentSurfaceOverride.transparentSurface ??= create(TransparentSurfaceSettingsSchema),
            patch.transparentSurface,
        );
    }
}

function applyColorFilledPaintPatch(
    colorFilled: StoredColorFilledPaintSettings,
    patch: ResolvedColorFilledPaintSettingsOverride,
): void {
    if (patch.colorMode !== undefined) {
        colorFilled.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.solid !== undefined) {
        const solid = colorFilled.solid ??= create(ColorFilledSolidPaintSettingsSchema);
        if (patch.solid.color !== undefined) {
            solid.color = patch.solid.color;
        }
        if (patch.solid.isGradientEnabled !== undefined) {
            solid.gradientEnabled = patch.solid.isGradientEnabled;
        }
    }

    if (patch.multiColor !== undefined) {
        const multiColor = colorFilled.multiColor ??= create(ColorFilledMultiColorPaintSettingsSchema);
        applyMultiColorSetPatch(multiColor.colors ??= create(MultiColorSetSchema), patch.multiColor.colors);
        if (patch.multiColor.isGradientEnabled !== undefined) {
            multiColor.gradientEnabled = patch.multiColor.isGradientEnabled;
        }
    }
}

function applyPaintOverridePatch(
    overrides: StoredGlobalOverrides,
    patch: StoredGlobalSettingsPatch,
): void {
    if (patch.paintOverrideEnabled === undefined && patch.paint === undefined) {
        return;
    }

    const paint = overrides.paint ??= create(GlobalPaintOverrideSchema);

    if (patch.paintOverrideEnabled !== undefined) {
        paint.enabled = patch.paintOverrideEnabled;
    }

    if (patch.paint === undefined) {
        return;
    }

    if (patch.paint.metric !== undefined) {
        applyGlobalMetricPaintPatch(paint.metric ??= create(GlobalMetricPaintSettingsSchema), patch.paint.metric);
    }
    if (patch.paint.colorFilled !== undefined) {
        applyColorFilledPaintPatch(
            paint.colorFilled ??= create(ColorFilledPaintSettingsSchema),
            patch.paint.colorFilled,
        );
    }
    if (patch.paint.terminal !== undefined) {
        const terminal = paint.terminal ??= create(TerminalPaintSettingsSchema);
        if (patch.paint.terminal.preset !== undefined) {
            terminal.preset = storedTerminalPalettePresetByResolved[patch.paint.terminal.preset];
        }
    }
}

function applyGlobalMetricPaintPatch(
    metric: StoredGlobalMetricPaintSettings,
    patch: GlobalMetricPaintSettingsPatch,
): void {
    if (patch.colorMode !== undefined) {
        metric.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.solid !== undefined) {
        const solid = metric.solid ??= create(GlobalSolidPaintSettingsSchema);
        if (patch.solid.color !== undefined) {
            solid.color = patch.solid.color;
        }
        if (patch.solid.isGradientEnabled !== undefined) {
            solid.gradientEnabled = patch.solid.isGradientEnabled;
        }
    }
    if (patch.multiColor !== undefined) {
        const multiColor = metric.multiColor ??= create(GlobalMultiColorPaintSettingsSchema);
        applyMultiColorSetPatch(multiColor.colors ??= create(MultiColorSetSchema), patch.multiColor.colors);
        if (patch.multiColor.lowThresholdPercent !== undefined) {
            multiColor.lowThresholdPercent = patch.multiColor.lowThresholdPercent;
        }
        if (patch.multiColor.highThresholdPercent !== undefined) {
            multiColor.highThresholdPercent = patch.multiColor.highThresholdPercent;
        }
        if (patch.multiColor.isGradientEnabled !== undefined) {
            multiColor.gradientEnabled = patch.multiColor.isGradientEnabled;
        }
    }
}

function applyMultiColorSetPatch(
    colors: StoredMultiColorSet,
    patch: ResolvedMultiColorSetOverride | undefined,
): void {
    if (patch?.lowColor !== undefined) {
        colors.lowColor = patch.lowColor;
    }
    if (patch?.mediumColor !== undefined) {
        colors.mediumColor = patch.mediumColor;
    }
    if (patch?.highColor !== undefined) {
        colors.highColor = patch.highColor;
    }
}

function applyNetworkDefaultsPatch(
    defaults: StoredGlobalDefaults,
    patch: StoredGlobalSettingsPatch["network"],
): void {
    if (!patch) {
        return;
    }

    const network = defaults.network ??= create(NetworkDisplaySettingsSchema);
    if (patch.scaleMode !== undefined) {
        network.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumDownloadSpeedMegabitsPerSecond" in patch) {
        network.maximumDownloadSpeedMegabitsPerSecond = patch.maximumDownloadSpeedMegabitsPerSecond;
    }
    if ("maximumUploadSpeedMegabitsPerSecond" in patch) {
        network.maximumUploadSpeedMegabitsPerSecond = patch.maximumUploadSpeedMegabitsPerSecond;
    }
    if (patch.unitBase !== undefined) {
        network.unitBase = storedNetworkUnitBaseByResolved[patch.unitBase];
    }
}

function applyDiskThroughputDefaultsPatch(
    defaults: StoredGlobalDefaults,
    patch: StoredGlobalSettingsPatch["diskThroughput"],
): void {
    if (!patch) {
        return;
    }

    const diskThroughput = defaults.diskThroughput ??= create(DiskThroughputDisplaySettingsSchema);
    if (patch.scaleMode !== undefined) {
        diskThroughput.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumReadThroughputMebibytesPerSecond" in patch) {
        diskThroughput.maximumReadThroughputMebibytesPerSecond = patch.maximumReadThroughputMebibytesPerSecond;
    }
    if ("maximumWriteThroughputMebibytesPerSecond" in patch) {
        diskThroughput.maximumWriteThroughputMebibytesPerSecond = patch.maximumWriteThroughputMebibytesPerSecond;
    }
}
