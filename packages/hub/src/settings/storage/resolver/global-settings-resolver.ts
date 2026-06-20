import { timestampMs } from "@bufbuild/protobuf/wkt";

import {
    ColorMode as StoredColorMode,
    type CustomHttpCredential as StoredCustomHttpCredential,
    type GlobalMetricPaintSettings as StoredGlobalMetricPaintSettings,
    type GlobalPaintOverride as StoredGlobalPaintOverride,
    type GlobalThemeOverride as StoredGlobalThemeOverride,
    type GlobalTransparentSurfaceOverride as StoredGlobalTransparentSurfaceOverride,
    type GlobalViewOverride as StoredGlobalViewOverride,
    type MetricSourceProfile as StoredMetricSourceProfile,
    type StoredGlobalSettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    ColorMode,
    ResolvedCustomHttpCredentialSummary,
    ResolvedGlobalDefaults,
    ResolvedGlobalSettings,
    ResolvedGlobalMetricPaintSettings,
    ResolvedGlobalPaintOverride,
    ResolvedGlobalThemeOverride,
    ResolvedGlobalTransparentSurfaceOverride,
    ResolvedGlobalViewOverride,
    ResolvedHttpMetricSourceConnection,
    ResolvedMetricSourceConnection,
    ResolvedMetricSourceProfile,
} from "../../resolved-settings";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_GLOBAL_TRANSPARENT_SURFACE_SETTINGS } from "../../default-appearance-settings";
import {
    resolveDiskThroughputDisplayDefaults,
    resolveNetworkDisplayDefaults,
} from "./display-settings-resolver";
import {
    resolveAppearanceThemeSettings,
    resolveAppearanceViewSettings,
    resolveColorFilledPaintSettings,
    resolveGlobalMultiColorPaintSettings,
    resolveGlobalSolidPaintSettings,
    resolveTerminalPaintSettings,
    resolveTransparentSurfaceSettings,
} from "./appearance-resolver";
import { resolveStoredEnum } from "./resolver-helpers";

const colorModeByProto = {
    [StoredColorMode.UNSPECIFIED]: undefined,
    [StoredColorMode.MULTI_COLOR]: "multi-color",
    [StoredColorMode.SOLID]: "solid",
    [StoredColorMode.BLACK_WHITE]: "black-white",
} satisfies Record<StoredColorMode, ColorMode | undefined>;

export function resolveStoredGlobalSettings(
    storedGlobalSettings: StoredGlobalSettings | undefined,
): ResolvedGlobalSettings {
    const storedOverrides = storedGlobalSettings?.overrides;
    const globalOverrideEnabled = storedOverrides?.enabled === true;
    const viewOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.view?.enabled ?? true);
    const themeOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.theme?.enabled ?? true);
    const transparentSurfaceOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.transparentSurface?.enabled ?? true);
    const paintOverrideEnabled = globalOverrideEnabled
        && (storedOverrides?.paint?.enabled ?? true);

    return {
        defaults: resolveGlobalDefaults(storedGlobalSettings),
        globalOverrideEnabled,
        viewOverride: viewOverrideEnabled
            ? resolveGlobalViewOverride(storedOverrides?.view)
            : undefined,
        themeOverride: themeOverrideEnabled
            ? resolveGlobalThemeOverride(storedOverrides?.theme)
            : undefined,
        transparentSurfaceOverride: transparentSurfaceOverrideEnabled
            ? resolveGlobalTransparentSurfaceOverride(storedOverrides?.transparentSurface)
            : undefined,
        paintOverride: paintOverrideEnabled
            ? resolveGlobalPaintOverride(storedOverrides?.paint)
            : undefined,
        sourceProfiles: (storedGlobalSettings?.sourceProfiles ?? []).map(resolveMetricSourceProfile),
        defaultSourceProfileId: storedGlobalSettings?.defaultSourceProfileId,
        customHttpCredentials: (storedGlobalSettings?.customHttpCredentials ?? [])
            .flatMap(resolveCustomHttpCredentialSummary),
        system: {
            experimentalVendorHidBatteryEnabled:
                storedGlobalSettings?.system?.experimentalVendorHidBatteryEnabled ?? true,
        },
    };
}

function resolveGlobalDefaults(
    storedGlobalSettings: StoredGlobalSettings | undefined,
): ResolvedGlobalDefaults {
    return {
        network: resolveNetworkDisplayDefaults(storedGlobalSettings?.defaults?.network),
        diskThroughput: resolveDiskThroughputDisplayDefaults(storedGlobalSettings?.defaults?.diskThroughput),
    };
}

function resolveGlobalViewOverride(
    storedOverride: StoredGlobalViewOverride | undefined,
): ResolvedGlobalViewOverride {
    return {
        view: resolveAppearanceViewSettings(DEFAULT_APPEARANCE_SETTINGS.view, storedOverride?.view),
    };
}

function resolveGlobalThemeOverride(
    storedOverride: StoredGlobalThemeOverride | undefined,
): ResolvedGlobalThemeOverride {
    return {
        theme: resolveAppearanceThemeSettings(DEFAULT_APPEARANCE_SETTINGS.theme, storedOverride?.theme),
    };
}

function resolveGlobalTransparentSurfaceOverride(
    storedOverride: StoredGlobalTransparentSurfaceOverride | undefined,
): ResolvedGlobalTransparentSurfaceOverride {
    return {
        transparentSurface: resolveTransparentSurfaceSettings(
            DEFAULT_GLOBAL_TRANSPARENT_SURFACE_SETTINGS,
            storedOverride?.transparentSurface,
        ),
    };
}

function resolveGlobalPaintOverride(
    storedOverride: StoredGlobalPaintOverride | undefined,
): ResolvedGlobalPaintOverride {
    return {
        metric: resolveGlobalMetricPaintSettings(storedOverride?.metric),
        colorFilled: resolveColorFilledPaintSettings(
            DEFAULT_APPEARANCE_SETTINGS.theme.colorFilled.paint,
            storedOverride?.colorFilled,
        ),
        terminal: resolveTerminalPaintSettings(
            DEFAULT_APPEARANCE_SETTINGS.theme.terminal.paint,
            storedOverride?.terminal,
        ),
    };
}

function resolveGlobalMetricPaintSettings(
    storedMetric: StoredGlobalMetricPaintSettings | undefined,
): ResolvedGlobalMetricPaintSettings {
    return {
        colorMode: resolveStoredEnum(storedMetric?.colorMode, colorModeByProto, "solid"),
        solid: resolveGlobalSolidPaintSettings(storedMetric?.solid),
        multiColor: resolveGlobalMultiColorPaintSettings(storedMetric?.multiColor),
    };
}

function resolveMetricSourceProfile(
    storedProfile: StoredMetricSourceProfile,
): ResolvedMetricSourceProfile {
    return {
        id: storedProfile.id ?? "",
        displayName: storedProfile.displayName ?? "",
        sourceTypeId: storedProfile.sourceTypeId ?? "",
        connection: resolveMetricSourceConnection(storedProfile),
    };
}

function resolveMetricSourceConnection(
    storedProfile: StoredMetricSourceProfile,
): ResolvedMetricSourceConnection | undefined {
    switch (storedProfile.connection.case) {
        case "http":
            return {
                connectionKind: "http",
                baseUrl: storedProfile.connection.value.baseUrl ?? "",
            } satisfies ResolvedHttpMetricSourceConnection;
        case undefined:
            return undefined;
    }
}

function resolveCustomHttpCredentialSummary(
    storedCredential: StoredCustomHttpCredential,
): ResolvedCustomHttpCredentialSummary[] {
    const commonSummary = {
        id: storedCredential.id ?? "",
        nickname: storedCredential.nickname ?? "",
        createdAtMilliseconds: readTimestampMilliseconds(storedCredential.createdAt),
        updatedAtMilliseconds: readTimestampMilliseconds(storedCredential.updatedAt),
    };

    switch (storedCredential.auth.case) {
        case "basic":
            return [{
                ...commonSummary,
                authKind: "basic",
                authContext: storedCredential.auth.value.username ?? "",
            } satisfies ResolvedCustomHttpCredentialSummary];
        case "bearer":
            return [{
                ...commonSummary,
                authKind: "bearer",
                authContext: "",
            } satisfies ResolvedCustomHttpCredentialSummary];
        case "header":
            return [{
                ...commonSummary,
                authKind: "header",
                authContext: storedCredential.auth.value.headerName ?? "",
            } satisfies ResolvedCustomHttpCredentialSummary];
        case "query":
            return [{
                ...commonSummary,
                authKind: "query",
                authContext: storedCredential.auth.value.queryParameterName ?? "",
            } satisfies ResolvedCustomHttpCredentialSummary];
        case undefined:
            return [];
    }
}

function readTimestampMilliseconds(
    timestamp: StoredCustomHttpCredential["createdAt"] | undefined,
): number | undefined {
    return timestamp === undefined ? undefined : timestampMs(timestamp);
}
