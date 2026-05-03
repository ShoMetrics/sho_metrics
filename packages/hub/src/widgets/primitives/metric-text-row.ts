import { clamp, escapeSvgText, type SvgTextAnchor } from "../../rendering/svg-utils";

export interface MetricTextRowOptions {
    id: string;
    valueText: string;
    unitText: string;
    xCoordinate: number;
    yCoordinate: number;
    width: number;
    valueFontSize: number;
    unitFontSize: number;
    fontFamily: string;
    valueFontWeight: number | string;
    unitFontWeight: number | string;
    valueFill: string;
    unitFill: string;
    textAnchor?: SvgTextAnchor;
    unitBaselineOffset?: number;
    clipHeight?: number;
    valueExtraAttributes?: readonly string[];
}

const MINIMUM_ROW_WIDTH = 1;

/**
 * Renders a metric value and unit as one SVG text row inside a fixed box.
 * The row relies on resvg's own text layout for glyph placement, then clips the
 * final result to the caller-provided box. No per-frame text measurement or
 * third-party font layout dependency is used.
 */
export function renderMetricTextRow(options: MetricTextRowOptions): string {
    const width = Math.max(MINIMUM_ROW_WIDTH, options.width);
    const textAnchor = options.textAnchor ?? "start";
    const unitTier = resolveUnitTier(options.unitText);
    const unitFontSize = options.unitFontSize * unitTier.fontScale;
    const clipHeight = options.clipHeight
        ?? Math.max(options.valueFontSize, unitFontSize) * 1.45;
    const clipPathId = sanitizeSvgId(options.id);
    const clipXCoordinate = resolveClipXCoordinate(options.xCoordinate, width, textAnchor);
    const clipYCoordinate = options.yCoordinate - clipHeight / 2;
    const valueAttributes = options.valueExtraAttributes?.length
        ? ` ${options.valueExtraAttributes.join(" ")}`
        : "";
    const unitTspan = options.unitText.length > 0
        ? `<tspan dx="${formatSvgNumber(unitTier.gap)}" dy="${formatSvgNumber(options.unitBaselineOffset ?? 0)}"
                font-size="${formatSvgNumber(unitFontSize)}" font-weight="${escapeSvgText(String(options.unitFontWeight))}"
                fill="${escapeSvgText(options.unitFill)}">${escapeSvgText(options.unitText)}</tspan>`
        : "";
    const textElement = `<text x="${formatSvgNumber(options.xCoordinate)}" y="${formatSvgNumber(options.yCoordinate)}"
                text-anchor="${textAnchor}" dominant-baseline="middle"
                font-family="${escapeSvgText(options.fontFamily)}"><tspan font-size="${formatSvgNumber(options.valueFontSize)}"
                    font-weight="${escapeSvgText(String(options.valueFontWeight))}"
                    fill="${escapeSvgText(options.valueFill)}"${valueAttributes}>${escapeSvgText(options.valueText)}</tspan>${unitTspan}</text>`;

    return `
        <defs>
            <clipPath id="${clipPathId}">
                <rect x="${formatSvgNumber(clipXCoordinate)}" y="${formatSvgNumber(clipYCoordinate)}"
                    width="${formatSvgNumber(width)}" height="${formatSvgNumber(clipHeight)}" />
            </clipPath>
        </defs>
        <g clip-path="url(#${clipPathId})">
            ${textElement}
        </g>
    `;
}

function resolveUnitTier(unitText: string): { gap: number; fontScale: number } {
    const unitLength = Array.from(unitText.trim()).length;

    if (unitLength === 0) {
        return { gap: 0, fontScale: 1 };
    }

    if (unitLength === 1) {
        return { gap: 4, fontScale: 1 };
    }

    if (unitLength === 2) {
        return { gap: 4, fontScale: 0.98 };
    }

    if (unitLength === 3) {
        return { gap: 3, fontScale: 0.94 };
    }

    return { gap: 3, fontScale: 0.88 };
}

function resolveClipXCoordinate(xCoordinate: number, width: number, textAnchor: SvgTextAnchor): number {
    if (textAnchor === "middle") {
        return xCoordinate - width / 2;
    }

    if (textAnchor === "end") {
        return xCoordinate - width;
    }

    return xCoordinate;
}

function sanitizeSvgId(id: string): string {
    const sanitizedId = id.replace(/[^A-Za-z0-9_-]/g, "-");

    return sanitizedId.length > 0 ? sanitizedId : "metric-text-row";
}

function formatSvgNumber(value: number): string {
    const finiteValue = Number.isFinite(value) ? value : 0;
    const roundedValue = clamp(finiteValue, -10000, 10000);

    return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(2);
}
