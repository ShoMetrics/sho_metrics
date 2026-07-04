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
    SystemFeatureSettingsSchema,
    TerminalPaintSettingsSchema,
    TerminalThemeSettingsSchema,
    TransparentSurfaceSettingsSchema,
    type AppearanceThemeSettings as StoredAppearanceThemeSettings,
    type ColorFilledPaintSettings as StoredColorFilledPaintSettings,
    type CustomHttpCredential as StoredCustomHttpCredential,
    type GlobalMetricPaintSettings as StoredGlobalMetricPaintSettings,
    type GlobalOverrides as StoredGlobalOverrides,
    type MultiColorSet as StoredMultiColorSet,
} from "../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    ColorMode,
    MetricTheme,
    ResolvedAppearanceViewSettings,
    ResolvedGlobalMultiColorPaintSettings,
    ResolvedGlobalSolidPaintSettings,
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
    storedTerminalPalettePresetByResolved,
    storedTerminalThemeVariantByResolved,
    storedTextViewVariantByResolved,
    storedMetricViewByResolved,
    storedThemeByResolved,
} from "./resolved-to-stored-enum-maps";
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
    readonly system?: Partial<{
        readonly experimentalVendorHidBatteryEnabled: boolean;
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
    applySystemFeatureSettingsPatch(settings, patch.system);

    return writeStoredGlobalSettings(settings);
}

function applySystemFeatureSettingsPatch(
    settings: ReturnType<typeof readStoredGlobalSettings>["settings"],
    patch: StoredGlobalSettingsPatch["system"],
): void {
    if (patch?.experimentalVendorHidBatteryEnabled === undefined) {
        return;
    }

    settings.system ??= create(SystemFeatureSettingsSchema);
    settings.system.experimentalVendorHidBatteryEnabled = patch.experimentalVendorHidBatteryEnabled;
}

/**
 * Writes one Custom HTTP credential into plugin global settings.
 *
 * When replacing an existing credential with the same secret-bearing auth kind,
 * an omitted password or token keeps the stored secret because the PI cannot
 * read saved secrets back into edit fields.
 */
export function upsertStoredCustomHttpCredential(
    rawSettings: unknown,
    credential: StoredCustomHttpCredentialInput,
): StoredSettingsJsonObject {
    const settings = readStoredGlobalSettings(rawSettings).settings;
    const credentialIndex = settings.customHttpCredentials
        .findIndex((candidateCredential) => candidateCredential.id === credential.id);
    const existingCredential = credentialIndex < 0 ? undefined : settings.customHttpCredentials[credentialIndex];
    const storedCredential = buildStoredCustomHttpCredential(credential, existingCredential);

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
    existingCredential: StoredCustomHttpCredential | undefined,
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
                    password: credential.password ?? readExistingCredentialSecret(existingCredential, credential.authKind),
                }),
            };
            break;
        case "bearer":
            storedCredential.auth = {
                case: "bearer",
                value: create(CustomHttpCredential_BearerSchema, {
                    token: credential.token ?? readExistingCredentialSecret(existingCredential, credential.authKind),
                }),
            };
            break;
        case "header":
            storedCredential.auth = {
                case: "header",
                value: create(CustomHttpCredential_HeaderSchema, {
                    headerName: credential.headerName,
                    token: credential.token ?? readExistingCredentialSecret(existingCredential, credential.authKind),
                }),
            };
            break;
        case "query":
            storedCredential.auth = {
                case: "query",
                value: create(CustomHttpCredential_QuerySchema, {
                    queryParameterName: credential.queryParameterName,
                    token: credential.token ?? readExistingCredentialSecret(existingCredential, credential.authKind),
                }),
            };
            break;
    }

    return storedCredential;
}

function readExistingCredentialSecret(
    existingCredential: StoredCustomHttpCredential | undefined,
    authKind: StoredCustomHttpCredentialInput["authKind"],
): string | undefined {
    if (existingCredential?.auth.case !== authKind) {
        return undefined;
    }

    switch (existingCredential.auth.case) {
        case "basic":
            return existingCredential.auth.value.password;
        case "bearer":
        case "header":
        case "query":
            return existingCredential.auth.value.token;
    }
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
