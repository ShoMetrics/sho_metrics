import {
    clamp,
    escapeSvgText,
    formatSvgTextFitAttributes,
    resolveSvgTextFit,
    sanitizeSvgId,
    type SvgTextAnchor,
    type SvgTextFitOptions,
} from "../../rendering/svg-utils";

interface MetricTextRowOptions {
    readonly id: string;
    readonly layout: MetricTextRowLayout;
    readonly value: MetricTextSegment;
    readonly unit: MetricTextUnitSegment;
    readonly fitOptions?: SvgTextFitOptions;
}

interface MetricTextRowLayout {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly textAnchor?: SvgTextAnchor;
    readonly clipHeight?: number;
}

interface MetricTextSegment {
    readonly text: string;
    readonly fontSize: number;
    readonly fontFamily: string;
    readonly fontWeight: number | string;
    readonly fill: string;
    readonly extraAttributes?: readonly string[];
}

interface MetricTextUnitSegment extends MetricTextSegment {
    readonly baselineOffset?: number;
}

const MINIMUM_ROW_WIDTH = 1;

/**
 * Renders a metric value and unit as one SVG text row inside a fixed box.
 * The row relies on resvg's own text layout for glyph placement, then clips the
 * final result to the caller-provided box. No per-frame text measurement or
 * third-party font layout dependency is used.
 */
export function renderMetricTextRow(options: MetricTextRowOptions): string {
    const width = Math.max(MINIMUM_ROW_WIDTH, options.layout.width);
    const textAnchor = options.layout.textAnchor ?? "start";
    const unitTier = resolveUnitTier(options.unit.text);
    const rawUnitFontSize = options.unit.fontSize * unitTier.fontScale;
    const textFit = resolveSvgTextFit({
        runs: [
            {
                text: options.value.text,
                fontSize: options.value.fontSize,
                fontWeight: options.value.fontWeight,
            },
            {
                text: options.unit.text,
                fontSize: rawUnitFontSize,
                fontWeight: options.unit.fontWeight,
            },
        ],
        maxWidth: width,
        extraWidth: options.unit.text.length > 0 ? unitTier.gap : 0,
        fitOptions: options.fitOptions,
    });
    const valueFontSize = options.value.fontSize * textFit.fontScale;
    const unitFontSize = rawUnitFontSize * textFit.fontScale;
    const unitGap = unitTier.gap * textFit.fontScale;
    const clipHeight = options.layout.clipHeight
        ?? Math.max(valueFontSize, unitFontSize) * 1.45;
    const clipPathId = sanitizeSvgId(options.id, "metric-text-row");
    const clipXCoordinate = resolveClipXCoordinate(options.layout.xCoordinate, width, textAnchor);
    const clipYCoordinate = options.layout.yCoordinate - clipHeight / 2;
    const valueAttributes = options.value.extraAttributes?.length
        ? ` ${options.value.extraAttributes.join(" ")}`
        : "";
    const unitAttributes = options.unit.extraAttributes?.length
        ? ` ${options.unit.extraAttributes.join(" ")}`
        : "";
    const unitTspan = options.unit.text.length > 0
        ? `<tspan dx="${formatSvgNumber(unitGap)}" dy="${formatSvgNumber(options.unit.baselineOffset ?? 0)}"
                font-family="${escapeSvgText(options.unit.fontFamily)}" font-size="${formatSvgNumber(unitFontSize)}"
                font-weight="${escapeSvgText(String(options.unit.fontWeight))}"
                fill="${escapeSvgText(options.unit.fill)}"${unitAttributes}>${escapeSvgText(options.unit.text)}</tspan>`
        : "";
    const textFitAttributes = formatSvgTextFitAttributes(textFit);
    const textElement = `<text x="${formatSvgNumber(options.layout.xCoordinate)}" y="${formatSvgNumber(options.layout.yCoordinate)}"
                text-anchor="${textAnchor}" dominant-baseline="middle"${textFitAttributes}><tspan
                    font-family="${escapeSvgText(options.value.fontFamily)}" font-size="${formatSvgNumber(valueFontSize)}"
                    font-weight="${escapeSvgText(String(options.value.fontWeight))}"
                    fill="${escapeSvgText(options.value.fill)}"${valueAttributes}>${escapeSvgText(options.value.text)}</tspan>${unitTspan}</text>`;

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

function formatSvgNumber(value: number): string {
    const finiteValue = Number.isFinite(value) ? value : 0;
    const roundedValue = clamp(finiteValue, -10000, 10000);

    return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(2);
}
