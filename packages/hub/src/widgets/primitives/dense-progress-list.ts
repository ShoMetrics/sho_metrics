import type { DenseMetricWidgetData, DenseMetricRowWidgetData } from "../../actions/dense-multi-metric/row-data";
import {
    adjustHexColorBrightness,
    parseHexColor,
    resolveReadableTextColor,
    resolveRelativeLuminance,
    type RgbColor,
} from "../../shared/color-utils";
import { resolveColorForThresholdValue } from "../../view-rendering/color/color-resolver";
import type { RenderOutlineTokens } from "../../view-rendering/color/render-appearance";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    resolveRenderTextStyleFontSize,
    type RenderTextStyles,
} from "../../view-rendering/rasterize/render-text-style";
import {
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    buildSvgFilterAttributes,
    type RenderThemeEffectTokens,
} from "../../view-rendering/rasterize/render-svg-effects";
import type { KeySize } from "../../view-rendering/widget-data";
import {
    clamp,
    escapeSvgText,
    isSvgOutlineEnabled,
    renderStyledSvgText,
    resolveSvgFilledShapeOutlinePadding,
} from "../../view-rendering/rasterize/svg-utils";
import type { WidgetBaseConfig } from "../widget-contract";

interface DenseProgressListConfig extends WidgetBaseConfig {
    readonly paints: DenseProgressListPaints;
    readonly textStyles: RenderTextStyles;
    readonly fillTintedTrack?: DenseProgressListFillTintedTrack;
    readonly labelLetterSpacingEm?: number;
    readonly themeEffects: RenderThemeEffectTokens;
    readonly textOutline?: RenderOutlineTokens;
    readonly shapeOutline?: RenderOutlineTokens;
}

/** Selects an unfilled track color derived from the row's filled progress color. */
export interface DenseProgressListFillTintedTrack {
    /** How much to lighten the fill color before using it as the unfilled track. */
    readonly trackLightenPercent: number;
}

interface DenseProgressListPaints {
    readonly labelText: string;
    readonly valueText: string;
    readonly unitText: string;
    readonly track: string;
}

interface DenseProgressListLayout {
    readonly paddingX: number;
    readonly paddingY: number;
    readonly columnCount: number;
    readonly rowCount: number;
    readonly columnWidth: number;
    readonly rowHeight: number;
    readonly labelWidth: number;
    readonly valueWidth: number;
    readonly unitWidth: number;
    readonly valueUnitGap: number;
    readonly valuePaddingX: number;
    readonly barHeight: number;
    readonly rowGap: number;
    readonly columnGap: number;
    readonly fontSize: number;
    readonly valueFontSize: number;
    readonly unitFontSize: number;
}

interface DenseProgressListCell {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly height: number;
}

interface DenseProgressListBar {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly height: number;
    readonly radius: number;
}

const BAR_TEXT_BASELINE_SHIFT_EM = 0.08;
const BAR_TEXT_MINIMUM_BASELINE_SHIFT_PX = 1;
const LABEL_BAR_GAP = 8;
const LABEL_TEXT_BASELINE_SHIFT_EM = 0.08;
const LABEL_TEXT_TRAILING_BLEED = 4;
const BAR_CORNER_RADIUS_RATIO = 0.25;

// Progress-row numbers sit across both filled and unfilled regions. Most themes
// use a small neutral material set; fixed-accent themes can opt into a
// fill-tinted track so the unfilled side stays in the same color family as the fill.
const TRACK_PALETTE_FOR_DARK_TEXT = [
    "rgba(255,255,255,0.46)",
    "rgba(255,255,255,0.54)",
    "rgba(255,255,255,0.62)",
] as const;
const TRACK_PALETTE_FOR_LIGHT_TEXT = [
    "rgba(17,24,39,0.50)",
    "rgba(17,24,39,0.44)",
    "rgba(17,24,39,0.36)",
] as const;
const FILL_TINTED_TRACK_OPACITY = 0.62;

// Production dense rendering overrides these theme-owned tokens; the defaults keep the primitive standalone-testable.
export const DEFAULT_DENSE_PROGRESS_LIST_CONFIG: DenseProgressListConfig = {
    colorConfig: {
        mode: "threshold",
        solidColor: "#3b82f6",
        thresholds: [
            { min: 0, max: 50, color: "#22c55e" },
            { min: 50, max: 80, color: "#eab308" },
            { min: 80, max: 101, color: "#ef4444" },
        ],
        isGradientEnabled: true,
    },
    paints: {
        labelText: "rgba(255,255,255,0.82)",
        valueText: "#ffffff",
        unitText: "rgba(255,255,255,0.78)",
        track: "rgba(255,255,255,0.12)",
    },
    textStyles: DEFAULT_RENDER_TEXT_STYLES,
    themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    gradientHeadAdjustmentPercent: -15,
};

/** Renders the dense multi-metric row list body. */
export function renderDenseProgressList(
    data: DenseMetricWidgetData,
    config: DenseProgressListConfig,
    keySize: KeySize,
): string {
    const rows = data.rows.slice(0, 6);
    const layout = buildDenseProgressListLayout(rows.length, keySize);

    return rows.map((row, index) => renderDenseProgressListRow({
        row,
        rowIndex: index,
        cell: resolveDenseProgressListCell(index, layout),
        layout,
        config,
    })).join("");
}

function buildDenseProgressListLayout(rowCount: number, keySize: KeySize): DenseProgressListLayout {
    const isWide = keySize.width / keySize.height >= 1.45;
    const columnCount = isWide && rowCount >= 6 ? 2 : 1;
    const columnGap = isWide && columnCount === 2 ? 12 : 0;
    const paddingX = Math.round(keySize.width * (isWide ? 0.08 : 0.06));
    const paddingY = Math.round(keySize.height * 0.05);
    const effectiveRowCount = columnCount === 2 ? Math.ceil(rowCount / 2) : Math.max(1, rowCount);
    const rowGap = isWide ? 4 : clamp(Math.round(10 - rowCount), 4, 8);
    const columnWidth = (keySize.width - paddingX * 2 - columnGap * (columnCount - 1)) / columnCount;
    const rowHeight = (keySize.height - paddingY * 2 - rowGap * (effectiveRowCount - 1)) / effectiveRowCount;
    const isCompactColumn = columnWidth < 100;
    const labelWidthRatio = (columnWidth < 100 && isWide && columnCount === 2) ? 0.35 : 0.24;
    const labelWidth = Math.round(columnWidth * labelWidthRatio);
    const valueWidth = Math.round(columnWidth * (isCompactColumn ? 0.38 : 0.31));
    const unitWidth = Math.round(columnWidth * (isCompactColumn ? 0.13 : 0.10));
    const valueUnitGap = isCompactColumn ? 2 : 3;
    const valuePaddingX = isCompactColumn ? 3 : 5;
    const barHeightRatio = resolveDenseProgressListBarHeightRatio(rowCount, isWide);
    const barHeight = clamp(Math.round(rowHeight * barHeightRatio), 8, 30);
    const fontSizeRatio = resolveDenseProgressListLabelFontSizeRatio(rowCount, isWide);
    const fontSize = clamp(Math.round(rowHeight * fontSizeRatio), 10, 18);
    const valueFontSize = clamp(Math.round(rowHeight * (isWide ? 0.50 : 0.52)), 12, 24);

    return {
        paddingX,
        paddingY,
        columnCount,
        rowCount: effectiveRowCount,
        columnWidth,
        rowHeight,
        labelWidth,
        valueWidth,
        unitWidth,
        valueUnitGap,
        valuePaddingX,
        barHeight,
        rowGap,
        columnGap,
        fontSize,
        valueFontSize,
        unitFontSize: clamp(Math.round(valueFontSize * 0.56), 8, 14),
    };
}

function resolveDenseProgressListBarHeightRatio(rowCount: number, isWide: boolean): number {
    if (isWide) {
        return rowCount > 3 ? 0.68 : 0.62;
    }

    if (rowCount >= 6) {
        return 0.92;
    }
    if (rowCount === 5) {
        return 0.88;
    }
    if (rowCount === 4) {
        return 0.82;
    }

    return 0.66;
}

function resolveDenseProgressListLabelFontSizeRatio(rowCount: number, isWide: boolean): number {
    if (isWide) {
        if (rowCount >= 6) {
            return 0.95;
        }
        if (rowCount === 5) {
            return 0.9;
        }
        if (rowCount === 4) {
            return 0.8;
        }

        return 0.5;
    }

    if (rowCount >= 4) {
        // Dense labels are horizontally fitted after this base size is chosen.
        // Keep the base generous so tiny row height is the limit, not an
        // overly defensive ratio from the earlier thinner-bar layout.
        return 0.95;
    }

    return 0.36;
}

function resolveDenseProgressListCell(index: number, layout: DenseProgressListLayout): DenseProgressListCell {
    const columnIndex = layout.columnCount === 2 ? index % 2 : 0;
    const rowIndex = layout.columnCount === 2 ? Math.floor(index / 2) : index;

    return {
        xCoordinate: layout.paddingX + columnIndex * (layout.columnWidth + layout.columnGap),
        yCoordinate: layout.paddingY + rowIndex * (layout.rowHeight + layout.rowGap),
        width: layout.columnWidth,
        height: layout.rowHeight,
    };
}

function renderDenseProgressListRow(options: {
    readonly row: DenseMetricRowWidgetData;
    readonly rowIndex: number;
    readonly cell: DenseProgressListCell;
    readonly layout: DenseProgressListLayout;
    readonly config: DenseProgressListConfig;
}): string {
    const label = options.row.widgetData.label;
    const valueText = options.row.widgetData.displayValue ?? options.row.widgetData.current.toFixed(0);
    const unitText = options.row.widgetData.unit;
    const rowCenterY = options.cell.yCoordinate + options.cell.height / 2;
    const bar = resolveDenseProgressListBar({
        cell: options.cell,
        layout: options.layout,
    });
    const valueBoxRightCoordinate = bar.xCoordinate + bar.width
        - options.layout.unitWidth
        - options.layout.valueUnitGap
        - options.layout.valuePaddingX;
    const valueBoxWidth = Math.max(1, valueBoxRightCoordinate - bar.xCoordinate);
    const unitXCoordinate = bar.xCoordinate + bar.width - options.layout.unitWidth - options.layout.valuePaddingX;
    const fillWidth = Math.max(0, bar.width * clamp(options.row.widgetData.progress, 0, 1));
    const filledColor = resolveColorForThresholdValue(
        clamp(options.row.widgetData.progress, 0, 1) * 100,
        options.config.colorConfig,
    );
    const barTextColor = resolveDenseBarTextColor({
        filledColor,
        fallbackTextColor: options.config.paints.valueText,
    });
    const trackColor = resolveDenseTrackColor({
        filledColor,
        fallbackTrackColor: options.config.paints.track,
        fillTintedTrack: options.config.fillTintedTrack,
        textColor: barTextColor,
    });
    const barCenterY = bar.yCoordinate + bar.height / 2;
    const valueTextFontSize = resolveRenderTextStyleFontSize(
        options.layout.valueFontSize,
        options.config.textStyles.value,
    );
    const barTextYCoordinate = resolveDenseBarTextYCoordinate(barCenterY, valueTextFontSize);
    return `
        <g class="dense-progress-list-row" data-slot-id="${escapeSvgText(options.row.slotId)}">
            ${renderStyledSvgText({
                id: `dense-progress-list-label-${options.rowIndex}`,
                text: label,
                xCoordinate: options.cell.xCoordinate,
                yCoordinate: rowCenterY,
                maxWidth: resolveDenseLabelTextMaxWidth(options.layout),
                baseFontSize: options.layout.fontSize,
                textStyle: options.config.textStyles.label,
                baselineShiftEm: LABEL_TEXT_BASELINE_SHIFT_EM,
                letterSpacingEm: options.config.labelLetterSpacingEm,
                fill: options.config.paints.labelText,
                outline: options.config.textOutline,
                extraAttributes: buildSvgFilterAttributes(options.config.textStyles.label.filter),
                fitOptions: {
                    minimumFontScale: 0.62,
                    widthGuardRatio: 1.02,
                },
            })}
            ${renderTrack({ bar, color: trackColor, config: options.config })}
            ${renderFill({
                id: `dense-progress-list-fill-${options.rowIndex}`,
                bar,
                width: fillWidth,
                color: filledColor,
                config: options.config,
            })}
            ${renderStyledSvgText({
                id: `dense-progress-list-value-${options.rowIndex}`,
                text: valueText,
                xCoordinate: valueBoxRightCoordinate,
                yCoordinate: barTextYCoordinate,
                maxWidth: valueBoxWidth,
                baseFontSize: options.layout.valueFontSize,
                textStyle: options.config.textStyles.value,
                textAnchor: "end",
                baselineShiftEm: 0,
                fill: barTextColor,
                outline: options.config.textOutline,
                extraAttributes: [
                    "font-variant-numeric=\"tabular-nums\"",
                    ...buildSvgFilterAttributes(options.config.textStyles.value.filter),
                ],
                fitOptions: {
                    minimumFontScale: 0.5,
                    widthGuardRatio: 1.02,
                },
            })}
            ${renderStyledSvgText({
                id: `dense-progress-list-unit-${options.rowIndex}`,
                text: unitText,
                xCoordinate: unitXCoordinate,
                yCoordinate: barTextYCoordinate,
                maxWidth: options.layout.unitWidth,
                baseFontSize: options.layout.unitFontSize,
                textStyle: options.config.textStyles.unit,
                textAnchor: "start",
                baselineShiftEm: 0,
                fill: barTextColor,
                outline: options.config.textOutline,
                extraAttributes: buildSvgFilterAttributes(options.config.textStyles.unit.filter),
                fitOptions: {
                    minimumFontScale: 0.5,
                    widthGuardRatio: 1.02,
                },
            })}
        </g>
    `;
}

function resolveDenseBarTextColor(options: {
    readonly filledColor: string;
    readonly fallbackTextColor: string;
}): string {
    return parseHexColor(options.filledColor) === undefined
        ? options.fallbackTextColor
        : resolveReadableTextColor(options.filledColor);
}

function resolveDenseTrackColor(options: {
    readonly filledColor: string;
    readonly fallbackTrackColor: string;
    readonly fillTintedTrack: DenseProgressListFillTintedTrack | undefined;
    readonly textColor: string;
}): string {
    if (options.fillTintedTrack !== undefined) {
        return resolveFillTintedTrackColor({
            fallbackTrackColor: options.fallbackTrackColor,
            filledColor: options.filledColor,
            trackLightenPercent: options.fillTintedTrack.trackLightenPercent,
        });
    }

    const filledColor = parseHexColor(options.filledColor);
    if (filledColor === undefined || parseHexColor(options.textColor) === undefined) {
        return options.fallbackTrackColor;
    }

    return resolveNeutralTrackColor(filledColor, options.textColor);
}

function resolveNeutralTrackColor(filledColor: RgbColor, textColor: string): string {
    const filledLuminance = resolveRelativeLuminance(filledColor);

    if (textColor === "#ffffff") {
        if (filledLuminance <= 0.14) {
            return TRACK_PALETTE_FOR_LIGHT_TEXT[0];
        }
        if (filledLuminance <= 0.28) {
            return TRACK_PALETTE_FOR_LIGHT_TEXT[1];
        }
        return TRACK_PALETTE_FOR_LIGHT_TEXT[2];
    }

    if (filledLuminance >= 0.82) {
        return TRACK_PALETTE_FOR_DARK_TEXT[2];
    }
    if (filledLuminance >= 0.55) {
        return TRACK_PALETTE_FOR_DARK_TEXT[1];
    }
    return TRACK_PALETTE_FOR_DARK_TEXT[0];
}

function resolveFillTintedTrackColor(options: {
    readonly fallbackTrackColor: string;
    readonly filledColor: string;
    readonly trackLightenPercent: number;
}): string {
    const adjustedTrackColor = parseHexColor(adjustHexColorBrightness(
        options.filledColor,
        options.trackLightenPercent,
    ));

    return adjustedTrackColor === undefined
        ? options.fallbackTrackColor
        : formatRgbaColor(adjustedTrackColor, FILL_TINTED_TRACK_OPACITY);
}

function formatRgbaColor(color: RgbColor, opacity: number): string {
    return `rgba(${color.red},${color.green},${color.blue},${opacity})`;
}

function resolveDenseLabelTextMaxWidth(layout: DenseProgressListLayout): number {
    return layout.labelWidth + Math.min(LABEL_TEXT_TRAILING_BLEED, LABEL_BAR_GAP / 2);
}

function resolveDenseBarTextYCoordinate(centerYCoordinate: number, valueFontSize: number): number {
    // The global SVG text baseline presets are tuned for larger metric text.
    // Bar-internal text is much smaller, so use a local visual-center offset
    // that stays visible even after the font size is clamped down. Value and
    // unit share this coordinate so their baselines do not drift apart.
    return centerYCoordinate
        + Math.max(BAR_TEXT_MINIMUM_BASELINE_SHIFT_PX, valueFontSize * BAR_TEXT_BASELINE_SHIFT_EM);
}

function resolveDenseProgressListBar(options: {
    readonly cell: DenseProgressListCell;
    readonly layout: DenseProgressListLayout;
}): DenseProgressListBar {
    const xCoordinate = options.cell.xCoordinate + options.layout.labelWidth + LABEL_BAR_GAP;
    const width = Math.max(1, options.cell.xCoordinate + options.cell.width - xCoordinate);

    return {
        xCoordinate,
        yCoordinate: options.cell.yCoordinate + (options.cell.height - options.layout.barHeight) / 2,
        width,
        height: options.layout.barHeight,
        radius: clamp(Math.round(options.layout.barHeight * BAR_CORNER_RADIUS_RATIO), 2, 6),
    };
}

function renderTrack(options: {
    readonly bar: DenseProgressListBar;
    readonly color: string;
    readonly config: DenseProgressListConfig;
}): string {
    return `
        ${renderFilledRectOutline({
            className: "dense-progress-list-track-outline",
            bar: options.bar,
            width: options.bar.width,
            outline: options.config.shapeOutline,
        })}
        <rect class="dense-progress-list-track"
            x="${formatSvgNumber(options.bar.xCoordinate)}" y="${formatSvgNumber(options.bar.yCoordinate)}"
            width="${formatSvgNumber(options.bar.width)}" height="${formatSvgNumber(options.bar.height)}"
            rx="${formatSvgNumber(options.bar.radius)}" fill="${escapeSvgText(options.color)}"
            ${buildSvgFilterAttributes(options.config.themeEffects.subtleFilter).join(" ")} />
    `;
}

function renderFill(options: {
    readonly id: string;
    readonly bar: DenseProgressListBar;
    readonly width: number;
    readonly color: string;
    readonly config: DenseProgressListConfig;
}): string {
    if (options.width <= 0) {
        return "";
    }

    const clipPathId = escapeSvgText(options.id);

    return `
        <defs>
            <clipPath id="${clipPathId}">
                <rect x="${formatSvgNumber(options.bar.xCoordinate)}" y="${formatSvgNumber(options.bar.yCoordinate)}"
                    width="${formatSvgNumber(options.bar.width)}" height="${formatSvgNumber(options.bar.height)}"
                    rx="${formatSvgNumber(options.bar.radius)}" />
            </clipPath>
        </defs>
        <rect class="dense-progress-list-fill"
            x="${formatSvgNumber(options.bar.xCoordinate)}" y="${formatSvgNumber(options.bar.yCoordinate)}"
            width="${formatSvgNumber(options.width)}" height="${formatSvgNumber(options.bar.height)}"
            fill="${escapeSvgText(options.color)}" clip-path="url(#${clipPathId})"
            ${buildSvgFilterAttributes(options.config.themeEffects.metricFilter).join(" ")} />
    `;
}

function renderFilledRectOutline(options: {
    readonly className: string;
    readonly bar: DenseProgressListBar;
    readonly width: number;
    readonly outline: RenderOutlineTokens | undefined;
}): string {
    if (!isSvgOutlineEnabled(options.outline) || options.width <= 0 || options.bar.height <= 0) {
        return "";
    }

    const padding = resolveSvgFilledShapeOutlinePadding(options.bar.height, options.outline);

    return `<rect class="${options.className}"
        x="${formatSvgNumber(options.bar.xCoordinate - padding)}"
        y="${formatSvgNumber(options.bar.yCoordinate - padding)}"
        width="${formatSvgNumber(options.width + padding * 2)}"
        height="${formatSvgNumber(options.bar.height + padding * 2)}"
        rx="${formatSvgNumber(options.bar.radius + padding)}"
        fill="${escapeSvgText(options.outline.color)}" opacity="${formatSvgNumber(options.outline.strength)}" />`;
}

function formatSvgNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;

    return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2);
}
