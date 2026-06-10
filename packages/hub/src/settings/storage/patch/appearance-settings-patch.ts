import { create } from "@bufbuild/protobuf";
import {
    AppearanceThemeSettingsSchema,
    AppearanceViewSettingsSchema,
    ColorFilledMultiColorPaintSettingsSchema,
    ColorFilledPaintSettingsSchema,
    ColorFilledSolidPaintSettingsSchema,
    ColorFilledThemeSettingsSchema,
    CupertinoGlassThemeSettingsSchema,
    FlatThemeSettingsSchema,
    LineAppearanceSettingsSchema,
    MetricMultiColorChannelColorsSchema,
    MetricMultiColorPaintSettingsSchema,
    MetricPaintSettingsSchema,
    MetricSolidChannelColorsSchema,
    MetricSolidPaintSettingsSchema,
    MultiColorSetSchema,
    TerminalPaintSettingsSchema,
    TerminalThemeSettingsSchema,
    TransparentSurfaceSettingsSchema,
    type AppearanceSettings as StoredAppearanceSettings,
    type ColorFilledPaintSettings as StoredColorFilledPaintSettings,
    type MetricMultiColorPaintSettings as StoredMetricMultiColorPaintSettings,
    type MetricPaintSettings as StoredMetricPaintSettings,
    type MetricSolidPaintSettings as StoredMetricSolidPaintSettings,
    type MultiColorSet as StoredMultiColorSet,
} from "../../../generated/shometrics/v1/settings_pb.js";
import type {
    ResolvedAppearanceSettingsOverride,
    ResolvedColorFilledPaintSettingsOverride,
    ResolvedMetricPaintSettingsOverride,
    ResolvedMultiColorSetOverride,
} from "../../appearance-overrides";
import {
    storedCircleViewVariantByResolved,
    storedColorModeByResolved,
    storedGridLineTypeByResolved,
    storedGridLineVisibilityByResolved,
    storedMetricViewByResolved,
    storedTerminalPalettePresetByResolved,
    storedTerminalThemeVariantByResolved,
    storedTextViewVariantByResolved,
    storedThemeByResolved,
} from "../enum-maps";
import { applyStoredTransparentSurfacePatch } from "../transparent-surface-patch";

export function applyAppearancePatch(
    appearance: StoredAppearanceSettings,
    patch: ResolvedAppearanceSettingsOverride,
): void {
    if (patch.view !== undefined) {
        const view = appearance.view ??= create(AppearanceViewSettingsSchema);
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

    if (patch.theme !== undefined) {
        applyAppearanceThemePatch(appearance.theme ??= create(AppearanceThemeSettingsSchema), patch.theme);
    }

    if (patch.line !== undefined) {
        const line = appearance.line ??= create(LineAppearanceSettingsSchema);
        if (patch.line.lineSmoothingPercent !== undefined) {
            line.lineSmoothingPercent = patch.line.lineSmoothingPercent;
        }
        if (patch.line.gridLineVisibility !== undefined) {
            line.gridLineVisibility = storedGridLineVisibilityByResolved[patch.line.gridLineVisibility];
        }
        if (patch.line.gridLineType !== undefined) {
            line.gridLineType = storedGridLineTypeByResolved[patch.line.gridLineType];
        }
    }

    if (patch.transparentSurface !== undefined) {
        applyStoredTransparentSurfacePatch(
            appearance.transparentSurface ??= create(TransparentSurfaceSettingsSchema),
            patch.transparentSurface,
        );
    }
}

function applyAppearanceThemePatch(
    theme: NonNullable<StoredAppearanceSettings["theme"]>,
    patch: NonNullable<ResolvedAppearanceSettingsOverride["theme"]>,
): void {
    if (patch.selectedTheme !== undefined) {
        theme.selectedTheme = storedThemeByResolved[patch.selectedTheme];
    }
    if (patch.terminal?.variant !== undefined) {
        theme.terminal ??= create(TerminalThemeSettingsSchema);
        theme.terminal.variant = storedTerminalThemeVariantByResolved[patch.terminal.variant];
    }
    if (patch.terminal?.paint !== undefined) {
        theme.terminal ??= create(TerminalThemeSettingsSchema);
        const paint = theme.terminal.paint ??= create(TerminalPaintSettingsSchema);
        if (patch.terminal.paint.preset !== undefined) {
            paint.preset = storedTerminalPalettePresetByResolved[patch.terminal.paint.preset];
        }
    }
    if (patch.flat?.paint !== undefined) {
        const flat = theme.flat ??= create(FlatThemeSettingsSchema);
        applyMetricPaintPatch(flat.paint ??= create(MetricPaintSettingsSchema), patch.flat.paint);
    }
    if (patch.cupertinoGlass?.paint !== undefined) {
        const cupertinoGlass = theme.cupertinoGlass ??= create(CupertinoGlassThemeSettingsSchema);
        applyMetricPaintPatch(cupertinoGlass.paint ??= create(MetricPaintSettingsSchema), patch.cupertinoGlass.paint);
    }
    if (patch.colorFilled?.paint !== undefined) {
        const colorFilled = theme.colorFilled ??= create(ColorFilledThemeSettingsSchema);
        applyColorFilledPaintPatch(
            colorFilled.paint ??= create(ColorFilledPaintSettingsSchema),
            patch.colorFilled.paint,
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

function applyMetricPaintPatch(metric: StoredMetricPaintSettings, patch: ResolvedMetricPaintSettingsOverride): void {
    if (patch.colorMode !== undefined) {
        metric.colorMode = storedColorModeByResolved[patch.colorMode];
    }
    if (patch.solid !== undefined) {
        applyMetricSolidPaintPatch(metric.solid ??= create(MetricSolidPaintSettingsSchema), patch.solid);
    }
    if (patch.multiColor !== undefined) {
        applyMetricMultiColorPaintPatch(
            metric.multiColor ??= create(MetricMultiColorPaintSettingsSchema),
            patch.multiColor,
        );
    }
}

function applyMetricSolidPaintPatch(
    solid: StoredMetricSolidPaintSettings,
    patch: NonNullable<ResolvedMetricPaintSettingsOverride["solid"]>,
): void {
    if (patch.colors !== undefined) {
        const colors = solid.colors ??= create(MetricSolidChannelColorsSchema);
        if (patch.colors.usageColor !== undefined) {
            colors.usageColor = patch.colors.usageColor;
        }
        if (patch.colors.downloadColor !== undefined) {
            colors.downloadColor = patch.colors.downloadColor;
        }
        if (patch.colors.uploadColor !== undefined) {
            colors.uploadColor = patch.colors.uploadColor;
        }
        if (patch.colors.diskReadColor !== undefined) {
            colors.diskReadColor = patch.colors.diskReadColor;
        }
        if (patch.colors.diskWriteColor !== undefined) {
            colors.diskWriteColor = patch.colors.diskWriteColor;
        }
    }
    if (patch.isGradientEnabled !== undefined) {
        solid.gradientEnabled = patch.isGradientEnabled;
    }
}

function applyMetricMultiColorPaintPatch(
    multiColor: StoredMetricMultiColorPaintSettings,
    patch: NonNullable<ResolvedMetricPaintSettingsOverride["multiColor"]>,
): void {
    if (patch.lowThresholdPercent !== undefined) {
        multiColor.lowThresholdPercent = patch.lowThresholdPercent;
    }
    if (patch.highThresholdPercent !== undefined) {
        multiColor.highThresholdPercent = patch.highThresholdPercent;
    }
    if (patch.isGradientEnabled !== undefined) {
        multiColor.gradientEnabled = patch.isGradientEnabled;
    }
    if (patch.colors !== undefined) {
        const colors = multiColor.colors ??= create(MetricMultiColorChannelColorsSchema);
        applyMultiColorSetPatch(colors.usage ??= create(MultiColorSetSchema), patch.colors.usage);
        applyMultiColorSetPatch(colors.download ??= create(MultiColorSetSchema), patch.colors.download);
        applyMultiColorSetPatch(colors.upload ??= create(MultiColorSetSchema), patch.colors.upload);
        applyMultiColorSetPatch(colors.diskRead ??= create(MultiColorSetSchema), patch.colors.diskRead);
        applyMultiColorSetPatch(colors.diskWrite ??= create(MultiColorSetSchema), patch.colors.diskWrite);
    }
}

function applyMultiColorSetPatch(colors: StoredMultiColorSet, patch: ResolvedMultiColorSetOverride | undefined): void {
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
