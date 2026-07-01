import type { ColorConfig } from "../../view-rendering/color/color-resolver";
import { resolveColorForThresholdValue } from "../../view-rendering/color/color-resolver";
import type { RenderOutlineTokens } from "../../view-rendering/color/render-appearance";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    type RenderTextStyles,
} from "../../view-rendering/rasterize/render-text-style";
import {
    buildSvgFilterAttributes,
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    type RenderThemeEffectTokens,
} from "../../view-rendering/rasterize/render-svg-effects";
import type { KeySize } from "../../view-rendering/widget-data";
import {
    clamp,
    escapeSvgText,
    formatSvgShapeOutlineStrokeAttributes,
    isSvgOutlineEnabled,
    renderStyledSvgText,
    resolveSvgShapeOutlineStrokeWidth,
} from "../../view-rendering/rasterize/svg-utils";
import type { WidgetBaseConfig } from "../widget-contract";
import { renderMetricTextRow } from "./metric-text-row";

/** Render configuration for the reusable semi-circle gauge panel primitive. */
export interface SemiCircleGaugePanelConfig extends WidgetBaseConfig {
    readonly paints: SemiCircleGaugePanelPaints;
    readonly textStyles: RenderTextStyles;
    readonly themeEffects: RenderThemeEffectTokens;
    readonly textOutline?: RenderOutlineTokens;
    readonly shapeOutline?: RenderOutlineTokens;
    readonly icons: SemiCircleGaugePanelIcons;
}

/** Paint tokens consumed directly by the semi-circle gauge panel SVG. */
export interface SemiCircleGaugePanelPaints {
    readonly primaryText: string;
    readonly secondaryText: string;
    readonly mutedText: string;
    readonly icon: string;
    readonly track: string;
    readonly divider: string;
}

/** SVG fragments rendered by the semi-circle gauge panel chrome. */
export interface SemiCircleGaugePanelIcons {
    readonly title: string;
}

/** Render-facing data for one gauge-led panel with two secondary readings. */
export interface SemiCircleGaugePanelData {
    readonly title: string;
    readonly primary: SemiCircleGaugePanelPrimaryReadingData;
    readonly secondary: readonly [
        SemiCircleGaugePanelSecondaryReadingData,
        SemiCircleGaugePanelSecondaryReadingData,
    ];
}

/** Text payload shared by the primary gauge reading and secondary rows. */
export interface SemiCircleGaugePanelReadingData {
    readonly kind: string;
    readonly label: string;
    readonly displayValue: string;
    readonly unit: string;
}

/** Primary reading data with normalized gauge progress. */
export interface SemiCircleGaugePanelPrimaryReadingData extends SemiCircleGaugePanelReadingData {
    readonly progress: number;
}

/** Secondary reading data; secondary rows are text-only. */
export type SemiCircleGaugePanelSecondaryReadingData = SemiCircleGaugePanelReadingData;

interface SemiCircleGaugePanelLayout {
    readonly mode: "square" | "wide";
    readonly title: TitleLayout;
    readonly gauge: GaugeLayout;
    readonly primaryValue: ValueLayout;
    readonly divider?: DividerLayout;
    readonly secondaryRows: readonly [SecondaryReadingLayout, SecondaryReadingLayout];
}

interface TitleLayout {
    readonly iconXCoordinate: number;
    readonly iconYCoordinate: number;
    readonly yCoordinate: number;
    readonly xCoordinate: number;
    readonly textWidth: number;
    readonly fontSize: number;
    readonly iconSize: number;
}

interface TextLayout {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly fontSize: number;
    readonly anchor?: "start" | "middle" | "end";
}

interface ValueLayout extends TextLayout {
    readonly unitFontSize: number;
}

interface RightAlignedValueLayout {
    readonly yCoordinate: number;
    readonly width: number;
    readonly fontSize: number;
    readonly unitFontSize: number;
    readonly fixedUnitWidth: number;
    readonly rightEdgeXCoordinate: number;
}

interface GaugeLayout {
    readonly centerXCoordinate: number;
    readonly centerYCoordinate: number;
    readonly radius: number;
    readonly strokeWidth: number;
}

interface DividerLayout {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly strokeWidth: number;
}

interface SecondaryReadingLayout {
    readonly label: TextLayout;
    readonly value: RightAlignedValueLayout;
}

const DEFAULT_COLOR_CONFIG: ColorConfig = {
    mode: "threshold",
    solidColor: "#3b82f6",
    thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ],
    isGradientEnabled: true,
};

/** Default primitive tokens before a renderer maps product appearance into this panel. */
export const DEFAULT_SEMI_CIRCLE_GAUGE_PANEL_CONFIG: SemiCircleGaugePanelConfig = {
    colorConfig: DEFAULT_COLOR_CONFIG,
    paints: {
        primaryText: "#ffffff",
        secondaryText: "rgba(255,255,255,0.78)",
        mutedText: "rgba(255,255,255,0.56)",
        icon: "rgba(255,255,255,0.78)",
        track: "rgba(255,255,255,0.14)",
        divider: "rgba(255,255,255,0.14)",
    },
    textStyles: DEFAULT_RENDER_TEXT_STYLES,
    themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    icons: {
        title: "",
    },
};

/** Renders one semi-circle gauge with two secondary value rows. */
export function renderSemiCircleGaugePanel(
    data: SemiCircleGaugePanelData,
    config: SemiCircleGaugePanelConfig,
    keySize: KeySize,
): string {
    const layout = buildSemiCircleGaugePanelLayout(keySize);
    const primaryReading = data.primary;
    const secondaryReadings = data.secondary;
    const primaryColor = resolveColorForThresholdValue(
        clamp(primaryReading.progress, 0, 1) * 100,
        config.colorConfig,
    );

    return `
        <g class="semi-circle-gauge-panel">
            ${renderTitle(data.title, layout.title, config)}
            ${renderSemiCircleGauge({
                progress: primaryReading.progress,
                color: primaryColor,
                layout: layout.gauge,
                config,
            })}
            ${renderPrimaryReading(primaryReading, layout, config)}
            ${layout.divider === undefined ? "" : renderDivider(layout.divider, config)}
            ${secondaryReadings.map((reading, index) => renderSecondaryReading({
                reading,
                layout: layout.secondaryRows[index],
                config,
            })).join("")}
        </g>
    `;
}

function buildSemiCircleGaugePanelLayout(keySize: KeySize): SemiCircleGaugePanelLayout {
    const isWide = keySize.width / keySize.height >= 1.45;

    if (isWide) {
        const secondaryPanelLayout = buildWideSecondaryPanelLayout({
            topYCoordinate: 14,
            bottomYCoordinate: 96,
            valueLabelGap: 20,
            topLabelDividerGap: 13,
            bottomValueDividerGap: 17,
            dividerYOffset: -2,
        });

        return scaleSemiCircleGaugePanelLayout({
            mode: "wide",
            title: {
                iconXCoordinate: 17,
                iconYCoordinate: 13,
                xCoordinate: 27,
                yCoordinate: 14,
                textWidth: 34,
                fontSize: 11,
                iconSize: 13,
            },
            gauge: {
                centerXCoordinate: 56,
                centerYCoordinate: 72,
                radius: 43,
                strokeWidth: 8,
            },
            primaryValue: {
                xCoordinate: 56,
                yCoordinate: 65,
                width: 70,
                fontSize: 30,
                unitFontSize: 14,
                anchor: "middle",
            },
            divider: {
                xCoordinate: 111,
                yCoordinate: secondaryPanelLayout.dividerYCoordinate,
                width: 72,
                strokeWidth: 2,
            },
            secondaryRows: secondaryPanelLayout.secondaryRows,
        }, keySize, { width: 200, height: 100 });
    }

    return scaleSemiCircleGaugePanelLayout({
        mode: "square",
        title: {
            iconXCoordinate: 16,
            iconYCoordinate: 14,
            xCoordinate: 27,
            yCoordinate: 16,
            textWidth: 42,
            fontSize: 13,
            iconSize: 14,
        },
        gauge: {
            centerXCoordinate: 72,
            centerYCoordinate: 74,
            radius: 49,
            strokeWidth: 10,
        },
        primaryValue: {
            xCoordinate: 72,
            yCoordinate: 68,
            width: 86,
            fontSize: 38,
            unitFontSize: 17,
            anchor: "middle",
        },
        secondaryRows: buildSquareSecondaryReadingRows({
            topYCoordinate: 93,
            bottomYCoordinate: 144,
            rowBaselineGap: 27,
        }),
    }, keySize, { width: 144, height: 144 });
}

function scaleSemiCircleGaugePanelLayout(
    layout: SemiCircleGaugePanelLayout,
    keySize: KeySize,
    baseSize: KeySize,
): SemiCircleGaugePanelLayout {
    const scale = Math.min(keySize.width / baseSize.width, keySize.height / baseSize.height);

    if (Math.abs(scale - 1) < 0.005) {
        return layout;
    }

    const xOffset = (keySize.width - baseSize.width * scale) / 2;
    const yOffset = (keySize.height - baseSize.height * scale) / 2;

    return {
        mode: layout.mode,
        title: scaleTitleLayout(layout.title, scale, xOffset, yOffset),
        gauge: {
            centerXCoordinate: xOffset + layout.gauge.centerXCoordinate * scale,
            centerYCoordinate: yOffset + layout.gauge.centerYCoordinate * scale,
            radius: layout.gauge.radius * scale,
            strokeWidth: layout.gauge.strokeWidth * scale,
        },
        primaryValue: scaleValueLayout(layout.primaryValue, scale, xOffset, yOffset),
        divider: layout.divider === undefined
            ? undefined
            : {
                xCoordinate: xOffset + layout.divider.xCoordinate * scale,
                yCoordinate: yOffset + layout.divider.yCoordinate * scale,
                width: layout.divider.width * scale,
                strokeWidth: layout.divider.strokeWidth * scale,
            },
        secondaryRows: [
            scaleSecondaryReadingLayout(layout.secondaryRows[0], scale, xOffset, yOffset),
            scaleSecondaryReadingLayout(layout.secondaryRows[1], scale, xOffset, yOffset),
        ],
    };
}

function scaleTitleLayout(
    layout: TitleLayout,
    scale: number,
    xOffset: number,
    yOffset: number,
): TitleLayout {
    return {
        iconXCoordinate: xOffset + layout.iconXCoordinate * scale,
        iconYCoordinate: yOffset + layout.iconYCoordinate * scale,
        xCoordinate: xOffset + layout.xCoordinate * scale,
        yCoordinate: yOffset + layout.yCoordinate * scale,
        textWidth: layout.textWidth * scale,
        fontSize: layout.fontSize * scale,
        iconSize: layout.iconSize * scale,
    };
}

function scaleTextLayout(layout: TextLayout, scale: number, xOffset: number, yOffset: number): TextLayout {
    return {
        ...layout,
        xCoordinate: xOffset + layout.xCoordinate * scale,
        yCoordinate: yOffset + layout.yCoordinate * scale,
        width: layout.width * scale,
        fontSize: layout.fontSize * scale,
    };
}

function scaleValueLayout(layout: ValueLayout, scale: number, xOffset: number, yOffset: number): ValueLayout {
    return {
        ...scaleTextLayout(layout, scale, xOffset, yOffset),
        unitFontSize: layout.unitFontSize * scale,
    };
}

function scaleRightAlignedValueLayout(
    layout: RightAlignedValueLayout,
    scale: number,
    xOffset: number,
    yOffset: number,
): RightAlignedValueLayout {
    return {
        yCoordinate: yOffset + layout.yCoordinate * scale,
        width: layout.width * scale,
        fontSize: layout.fontSize * scale,
        unitFontSize: layout.unitFontSize * scale,
        fixedUnitWidth: layout.fixedUnitWidth * scale,
        rightEdgeXCoordinate: xOffset + layout.rightEdgeXCoordinate * scale,
    };
}

function scaleSecondaryReadingLayout(
    layout: SecondaryReadingLayout,
    scale: number,
    xOffset: number,
    yOffset: number,
): SecondaryReadingLayout {
    return {
        label: scaleTextLayout(layout.label, scale, xOffset, yOffset),
        value: scaleRightAlignedValueLayout(layout.value, scale, xOffset, yOffset),
    };
}

function buildWideSecondaryPanelLayout(options: {
    readonly topYCoordinate: number;
    readonly bottomYCoordinate: number;
    readonly valueLabelGap: number;
    readonly topLabelDividerGap: number;
    readonly bottomValueDividerGap: number;
    readonly dividerYOffset: number;
}): {
    readonly dividerYCoordinate: number;
    readonly secondaryRows: readonly [SecondaryReadingLayout, SecondaryReadingLayout];
} {
    const panelCenterYCoordinate = (options.topYCoordinate + options.bottomYCoordinate) / 2;
    // SVG text baselines make a geometrically centered divider look low; keep row anchors on the panel center.
    const dividerYCoordinate = panelCenterYCoordinate + options.dividerYOffset;
    const topLabelYCoordinate = panelCenterYCoordinate - options.topLabelDividerGap;
    const bottomValueYCoordinate = panelCenterYCoordinate + options.bottomValueDividerGap;

    return {
        dividerYCoordinate,
        secondaryRows: [
            buildWideSecondaryReadingLayout({
                valueYCoordinate: topLabelYCoordinate - options.valueLabelGap,
                labelYCoordinate: topLabelYCoordinate,
            }),
            buildWideSecondaryReadingLayout({
                valueYCoordinate: bottomValueYCoordinate,
                labelYCoordinate: bottomValueYCoordinate + options.valueLabelGap,
            }),
        ],
    };
}

function buildWideSecondaryReadingLayout(options: {
    readonly valueYCoordinate: number;
    readonly labelYCoordinate: number;
}): SecondaryReadingLayout {
    const rightEdgeXCoordinate = 178;
    const unitWidth = 14;

    return {
        label: {
            xCoordinate: rightEdgeXCoordinate,
            yCoordinate: options.labelYCoordinate,
            width: 48,
            fontSize: 11.5,
            anchor: "end",
        },
        value: {
            yCoordinate: options.valueYCoordinate,
            width: 70,
            fontSize: 26,
            unitFontSize: 12,
            fixedUnitWidth: unitWidth,
            rightEdgeXCoordinate,
        },
    };
}

function buildSquareSecondaryReadingRows(options: {
    readonly topYCoordinate: number;
    readonly bottomYCoordinate: number;
    readonly rowBaselineGap: number;
}): readonly [SecondaryReadingLayout, SecondaryReadingLayout] {
    const centerYCoordinate = (options.topYCoordinate + options.bottomYCoordinate) / 2;
    const halfRowBaselineGap = options.rowBaselineGap / 2;

    return [
        buildSquareSecondaryReadingLayout(centerYCoordinate - halfRowBaselineGap),
        buildSquareSecondaryReadingLayout(centerYCoordinate + halfRowBaselineGap),
    ];
}

function buildSquareSecondaryReadingLayout(centerYCoordinate: number): SecondaryReadingLayout {
    return {
        label: {
            xCoordinate: 9,
            yCoordinate: centerYCoordinate,
            width: 48,
            fontSize: 13,
            anchor: "start",
        },
        value: {
            yCoordinate: centerYCoordinate,
            width: 68,
            fontSize: 26,
            unitFontSize: 12,
            fixedUnitWidth: 24,
            rightEdgeXCoordinate: 131,
        },
    };
}

function renderTitle(title: string, layout: TitleLayout, config: SemiCircleGaugePanelConfig): string {
    return `
        ${renderTitleIcon({
            iconFragment: config.icons.title,
            centerXCoordinate: layout.iconXCoordinate,
            centerYCoordinate: layout.iconYCoordinate,
            iconSize: layout.iconSize,
            config,
        })}
        ${renderStyledSvgText({
        id: "semi-circle-gauge-panel-title",
        text: title,
        xCoordinate: layout.xCoordinate,
        yCoordinate: layout.yCoordinate,
        maxWidth: layout.textWidth,
        baseFontSize: layout.fontSize,
        textStyle: config.textStyles.smallLabel,
        textAnchor: "start",
        fill: config.paints.primaryText,
        outline: config.textOutline,
        extraAttributes: buildSvgFilterAttributes(config.textStyles.smallLabel.filter),
        fitOptions: { minimumFontScale: 0.58, widthGuardRatio: 1.05 },
    })}
    `;
}

function renderTitleIcon(options: {
    readonly iconFragment: string;
    readonly centerXCoordinate: number;
    readonly centerYCoordinate: number;
    readonly iconSize: number;
    readonly config: SemiCircleGaugePanelConfig;
}): string {
    if (options.iconFragment.length === 0) {
        return "";
    }

    const iconScale = options.iconSize / 58;

    return `<g class="semi-circle-gauge-panel-title-icon"
        color="${escapeSvgText(options.config.paints.icon)}"
        transform="translate(${formatSvgNumber(options.centerXCoordinate)} ${formatSvgNumber(options.centerYCoordinate)}) scale(${formatSvgNumber(iconScale)})"
        ${buildSvgFilterAttributes(options.config.themeEffects.iconFilter).join(" ")}>
        ${options.iconFragment}
    </g>`;
}

function renderSemiCircleGauge(options: {
    readonly progress: number;
    readonly color: string;
    readonly layout: GaugeLayout;
    readonly config: SemiCircleGaugePanelConfig;
}): string {
    const progress = clamp(options.progress, 0, 1);
    const startPoint = resolveArcPoint(options.layout, 180);
    const endPoint = resolveArcPoint(options.layout, 0);
    const progressEndPoint = resolveArcPoint(options.layout, 180 - 180 * progress);
    const trackPath = describeArc(startPoint, endPoint, options.layout.radius, 0);
    const progressPath = progress > 0
        ? describeArc(startPoint, progressEndPoint, options.layout.radius, 0)
        : "";

    return `
        ${renderArcOutline("semi-circle-gauge-panel-gauge-track-outline", trackPath, options.layout, options.config)}
        <path class="semi-circle-gauge-panel-gauge-track" d="${trackPath}" fill="none"
            stroke="${escapeSvgText(options.config.paints.track)}" stroke-width="${options.layout.strokeWidth}"
            stroke-linecap="round" ${buildSvgFilterAttributes(options.config.themeEffects.subtleFilter).join(" ")} />
        ${progressPath.length > 0 ? `
            ${renderArcOutline("semi-circle-gauge-panel-gauge-fill-outline", progressPath, options.layout, options.config)}
            <path class="semi-circle-gauge-panel-gauge-fill" d="${progressPath}" fill="none"
                stroke="${escapeSvgText(options.color)}" stroke-width="${options.layout.strokeWidth}"
                stroke-linecap="round" />
        ` : ""}
    `;
}

function renderArcOutline(
    className: string,
    pathData: string,
    layout: GaugeLayout,
    config: SemiCircleGaugePanelConfig,
): string {
    if (!isSvgOutlineEnabled(config.shapeOutline)) {
        return "";
    }

    return `<path class="${className}" d="${pathData}"
        ${formatSvgShapeOutlineStrokeAttributes({
            outline: config.shapeOutline,
            strokeWidth: resolveSvgShapeOutlineStrokeWidth(layout.strokeWidth, config.shapeOutline),
            lineCap: "round",
        })} />`;
}

function renderPrimaryReading(
    reading: SemiCircleGaugePanelReadingData,
    layout: SemiCircleGaugePanelLayout,
    config: SemiCircleGaugePanelConfig,
): string {
    return `
        ${renderValueWithUnit({
            id: "semi-circle-gauge-panel-primary-value",
            reading,
            layout: layout.primaryValue,
            valueTextColor: config.paints.primaryText,
            unitTextColor: config.paints.secondaryText,
            config,
            minimumFontScale: 0.45,
        })}
    `;
}

function renderDivider(layout: DividerLayout, config: SemiCircleGaugePanelConfig): string {
    return `<line class="semi-circle-gauge-panel-divider"
        x1="${formatSvgNumber(layout.xCoordinate)}" y1="${formatSvgNumber(layout.yCoordinate)}"
        x2="${formatSvgNumber(layout.xCoordinate + layout.width)}" y2="${formatSvgNumber(layout.yCoordinate)}"
        stroke="${escapeSvgText(config.paints.divider)}" stroke-width="${formatSvgNumber(layout.strokeWidth)}"
        ${buildSvgFilterAttributes(config.themeEffects.subtleFilter).join(" ")} />`;
}

function renderSecondaryReading(options: {
    readonly reading: SemiCircleGaugePanelReadingData;
    readonly layout: SecondaryReadingLayout;
    readonly config: SemiCircleGaugePanelConfig;
}): string {
    return `
        ${renderStyledSvgText({
            id: `semi-circle-gauge-panel-secondary-${options.reading.kind}-label`,
            text: options.reading.label,
            xCoordinate: options.layout.label.xCoordinate,
            yCoordinate: options.layout.label.yCoordinate,
            maxWidth: options.layout.label.width,
            baseFontSize: options.layout.label.fontSize,
            textStyle: options.config.textStyles.label,
            textAnchor: options.layout.label.anchor,
            fill: options.config.paints.secondaryText,
            outline: options.config.textOutline,
            extraAttributes: buildSvgFilterAttributes(options.config.textStyles.label.filter),
            fitOptions: { minimumFontScale: 0.5, widthGuardRatio: 1.05 },
        })}
        ${renderRightAlignedValueWithFixedUnit({
            id: `semi-circle-gauge-panel-secondary-${options.reading.kind}-value`,
            reading: options.reading,
            layout: options.layout.value,
            valueTextColor: options.config.paints.primaryText,
            unitTextColor: options.config.paints.secondaryText,
            config: options.config,
            minimumFontScale: 0.42,
        })}
    `;
}

function renderValueWithUnit(options: {
    readonly id: string;
    readonly reading: SemiCircleGaugePanelReadingData;
    readonly layout: ValueLayout;
    readonly valueTextColor: string;
    readonly unitTextColor: string;
    readonly config: SemiCircleGaugePanelConfig;
    readonly minimumFontScale: number;
}): string {
    return renderMetricTextRow({
        id: options.id,
        layout: {
            xCoordinate: options.layout.xCoordinate,
            yCoordinate: options.layout.yCoordinate,
            width: options.layout.width,
            textAnchor: options.layout.anchor,
        },
        value: {
            text: options.reading.displayValue,
            baseFontSize: options.layout.fontSize,
            textStyle: options.config.textStyles.value,
            fill: options.valueTextColor,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(options.config.textStyles.value.filter),
            ],
        },
        unit: {
            text: options.reading.unit,
            baseFontSize: options.layout.unitFontSize,
            textStyle: options.config.textStyles.unit,
            fill: options.unitTextColor,
            baselineOffset: 2,
            extraAttributes: buildSvgFilterAttributes(options.config.textStyles.unit.filter),
        },
        fitOptions: {
            minimumFontScale: options.minimumFontScale,
            widthGuardRatio: 1.12,
        },
        outline: options.config.textOutline,
    });
}

function renderRightAlignedValueWithFixedUnit(options: {
    readonly id: string;
    readonly reading: SemiCircleGaugePanelReadingData;
    readonly layout: RightAlignedValueLayout;
    readonly valueTextColor: string;
    readonly unitTextColor: string;
    readonly config: SemiCircleGaugePanelConfig;
    readonly minimumFontScale: number;
}): string {
    const unitWidth = options.layout.fixedUnitWidth;
    const valueUnitGap = 3;
    const valueWidth = Math.max(1, options.layout.width - unitWidth - valueUnitGap);
    const unitStartXCoordinate = options.layout.rightEdgeXCoordinate - unitWidth;
    const valueXCoordinate = options.reading.unit.length === 0
        ? options.layout.rightEdgeXCoordinate
        : unitStartXCoordinate - valueUnitGap;

    return `
        ${renderStyledSvgText({
            id: `${options.id}-value`,
            text: options.reading.displayValue,
            xCoordinate: valueXCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: valueWidth,
            baseFontSize: options.layout.fontSize,
            textStyle: options.config.textStyles.value,
            textAnchor: "end",
            fill: options.valueTextColor,
            outline: options.config.textOutline,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(options.config.textStyles.value.filter),
            ],
            fitOptions: {
                minimumFontScale: options.minimumFontScale,
                widthGuardRatio: 1.12,
            },
        })}
        ${renderStyledSvgText({
            id: `${options.id}-unit`,
            text: options.reading.unit,
            xCoordinate: options.layout.rightEdgeXCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: unitWidth,
            baseFontSize: options.layout.unitFontSize,
            textStyle: options.config.textStyles.unit,
            textAnchor: "end",
            fill: options.unitTextColor,
            outline: options.config.textOutline,
            extraAttributes: buildSvgFilterAttributes(options.config.textStyles.unit.filter),
            fitOptions: {
                minimumFontScale: 0.5,
                widthGuardRatio: 1.4,
            },
        })}
    `;
}

function resolveArcPoint(layout: GaugeLayout, angleDegrees: number): { readonly x: number; readonly y: number } {
    const angleRadians = angleDegrees * Math.PI / 180;

    return {
        x: layout.centerXCoordinate + layout.radius * Math.cos(angleRadians),
        y: layout.centerYCoordinate - layout.radius * Math.sin(angleRadians),
    };
}

function describeArc(
    startPoint: { readonly x: number; readonly y: number },
    endPoint: { readonly x: number; readonly y: number },
    radius: number,
    largeArcFlag: 0 | 1,
): string {
    return `M ${formatSvgNumber(startPoint.x)} ${formatSvgNumber(startPoint.y)} A ${formatSvgNumber(radius)} ${formatSvgNumber(radius)} 0 ${largeArcFlag} 1 ${formatSvgNumber(endPoint.x)} ${formatSvgNumber(endPoint.y)}`;
}

function formatSvgNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;

    return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2);
}
