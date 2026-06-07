import type { DenseMetricWidgetData, DenseMetricRowWidgetData } from "../../actions/dense-multi-metric/row-data";
import { resolveReadableTextColor } from "../../shared/color-utils";
import { resolveColorForThresholdValue } from "../../view-rendering/color-resolver";
import type { RenderOutlineTokens } from "../../view-rendering/render-appearance";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    resolveRenderTextStyleFontSize,
    type RenderTextStyles,
} from "../../view-rendering/render-text-style";
import {
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    buildSvgFilterAttributes,
    type RenderThemeEffectTokens,
} from "../../view-rendering/render-svg-effects";
import type { KeySize } from "../../view-rendering/widget-data";
import {
    clamp,
    escapeSvgText,
    isSvgOutlineEnabled,
    renderStyledSvgText,
    resolveSvgFilledShapeOutlinePadding,
} from "../../view-rendering/svg-utils";
import type { WidgetBaseConfig } from "../widget-contract";

interface DenseProgressListConfig extends WidgetBaseConfig {
    readonly paints: DenseProgressListPaints;
    readonly textStyles: RenderTextStyles;
    readonly themeEffects: RenderThemeEffectTokens;
    readonly textOutline?: RenderOutlineTokens;
    readonly shapeOutline?: RenderOutlineTokens;
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
    const columnCount = isWide && rowCount > 3 ? 2 : 1;
    const columnGap = isWide && columnCount === 2 ? 12 : 0;
    const paddingX = Math.round(keySize.width * (isWide ? 0.08 : 0.105));
    const paddingY = Math.round(keySize.height * (isWide ? 0.12 : 0.12));
    const effectiveRowCount = columnCount === 2 ? Math.ceil(rowCount / 2) : Math.max(1, rowCount);
    const rowGap = isWide ? 4 : clamp(Math.round(10 - rowCount), 4, 8);
    const columnWidth = (keySize.width - paddingX * 2 - columnGap * (columnCount - 1)) / columnCount;
    const rowHeight = (keySize.height - paddingY * 2 - rowGap * (effectiveRowCount - 1)) / effectiveRowCount;
    const compactColumn = columnWidth < 100;
    const labelWidth = Math.round(columnWidth * (compactColumn ? 0.25 : 0.24));
    const valueWidth = Math.round(columnWidth * (compactColumn ? 0.38 : 0.31));
    const unitWidth = Math.round(columnWidth * (compactColumn ? 0.13 : 0.10));
    const valueUnitGap = compactColumn ? 2 : 3;
    const valuePaddingX = compactColumn ? 3 : 5;
    const barHeight = clamp(Math.round(rowHeight * (isWide ? 0.62 : 0.66)), 8, 30);
    const fontSize = clamp(Math.round(rowHeight * (isWide ? 0.42 : 0.36)), 10, 18);
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
    const barColor = resolveColorForThresholdValue(
        clamp(options.row.widgetData.progress, 0, 1) * 100,
        options.config.colorConfig,
    );
    const barCenterY = bar.yCoordinate + bar.height / 2;
    const valueTextFontSize = resolveRenderTextStyleFontSize(
        options.layout.valueFontSize,
        options.config.textStyles.value,
    );
    const barTextYCoordinate = resolveDenseBarTextYCoordinate(barCenterY, valueTextFontSize);
    const valueTextColor = fillWidth >= valueBoxRightCoordinate - bar.xCoordinate
        ? resolveReadableTextColor(barColor)
        : options.config.paints.valueText;
    const unitTextColor = fillWidth >= unitXCoordinate - bar.xCoordinate
        ? resolveReadableTextColor(barColor)
        : options.config.paints.unitText;

    return `
        <g class="dense-progress-list-row" data-slot-id="${escapeSvgText(options.row.slotId)}">
            ${renderStyledSvgText({
                id: `dense-progress-list-label-${options.rowIndex}`,
                text: label,
                xCoordinate: options.cell.xCoordinate,
                yCoordinate: rowCenterY,
                maxWidth: options.layout.labelWidth,
                baseFontSize: options.layout.fontSize,
                textStyle: options.config.textStyles.label,
                fill: options.config.paints.labelText,
                outline: options.config.textOutline,
                extraAttributes: buildSvgFilterAttributes(options.config.textStyles.label.filter),
                fitOptions: {
                    minimumFontScale: 0.62,
                    widthGuardRatio: 1.02,
                },
            })}
            ${renderTrack(bar, options.config)}
            ${renderFill({
                id: `dense-progress-list-fill-${options.rowIndex}`,
                bar,
                width: fillWidth,
                color: barColor,
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
                fill: valueTextColor,
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
                fill: unitTextColor,
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
    const xCoordinate = options.cell.xCoordinate + options.layout.labelWidth + 8;
    const width = Math.max(1, options.cell.xCoordinate + options.cell.width - xCoordinate);

    return {
        xCoordinate,
        yCoordinate: options.cell.yCoordinate + (options.cell.height - options.layout.barHeight) / 2,
        width,
        height: options.layout.barHeight,
        radius: options.layout.barHeight / 2,
    };
}

function renderTrack(bar: DenseProgressListBar, config: DenseProgressListConfig): string {
    return `
        ${renderFilledRectOutline({
            className: "dense-progress-list-track-outline",
            bar,
            width: bar.width,
            outline: config.shapeOutline,
        })}
        <rect class="dense-progress-list-track"
            x="${formatSvgNumber(bar.xCoordinate)}" y="${formatSvgNumber(bar.yCoordinate)}"
            width="${formatSvgNumber(bar.width)}" height="${formatSvgNumber(bar.height)}"
            rx="${formatSvgNumber(bar.radius)}" fill="${escapeSvgText(config.paints.track)}"
            ${buildSvgFilterAttributes(config.themeEffects.subtleFilter).join(" ")} />
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
