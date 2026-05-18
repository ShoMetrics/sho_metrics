import {
    COLOR_COMPENSATION_SAMPLE_SWATCHES,
    type ColorCompensationSampleFocus,
} from "../color-compensation/patterns";
import { WIDGET_LOGICAL_SIZE } from "./widget-data";

export function renderColorCompensationSampleSvg(focus: ColorCompensationSampleFocus): string {
    return renderPatternFrame(renderSampleWidgetBody(focus));
}

function renderPatternFrame(body: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg"
        width="${WIDGET_LOGICAL_SIZE.width}" height="${WIDGET_LOGICAL_SIZE.height}"
        viewBox="0 0 ${WIDGET_LOGICAL_SIZE.width} ${WIDGET_LOGICAL_SIZE.height}">
        <defs></defs>
        <rect x="5" y="5" width="134" height="134" rx="18" fill="#181b20" />
        ${body}
    </svg>`;
}

function renderSampleWidgetBody(focus: ColorCompensationSampleFocus): string {
    switch (focus) {
        case "preflight":
            return renderPreflightPattern();
        case "saturation":
            return renderColorStrengthPattern();
        case "brightness":
            return renderLightnessPattern();
        case "gamma":
            return renderGrayLevelsPattern();
        case "shadow":
            return renderDarkDetailPattern();
        case "review":
            return renderMegaPreviewPattern();
    }
}

function renderPreflightPattern(): string {
    return `
        <g stroke="#e8e8e8" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <g transform="translate(14 28) scale(1.7)">
                <rect x="2" y="3" width="20" height="14" rx="2" stroke-width="1.4" />
                <line x1="8" y1="21" x2="16" y2="21" stroke-width="1.4" />
                <line x1="12" y1="17" x2="12" y2="21" stroke-width="1.4" />
            </g>
            <g transform="translate(58 56)" stroke-width="2">
                <line x1="0" y1="9" x2="28" y2="9" />
                <polyline points="6,4 0,9 6,14" />
                <polyline points="22,4 28,9 22,14" />
            </g>
            <g transform="translate(89 27) scale(1.7)">
                <rect x="2" y="2" width="20" height="20" rx="3" stroke-width="1.2" />
                <g stroke-width="0.8">
                    <rect x="4.75" y="5.5" width="2.5" height="2.5" rx="0.7" />
                    <rect x="8.75" y="5.5" width="2.5" height="2.5" rx="0.7" />
                    <rect x="12.75" y="5.5" width="2.5" height="2.5" rx="0.7" />
                    <rect x="16.75" y="5.5" width="2.5" height="2.5" rx="0.7" />
                    <rect x="4.75" y="10.5" width="2.5" height="2.5" rx="0.7" />
                    <rect x="8.75" y="10.5" width="2.5" height="2.5" rx="0.7" />
                    <rect x="12.75" y="10.5" width="2.5" height="2.5" rx="0.7" />
                    <rect x="16.75" y="10.5" width="2.5" height="2.5" rx="0.7" />
                    <rect x="4.75" y="15.5" width="14.5" height="3" rx="0.7" />
                </g>
            </g>
        </g>
        <text x="72" y="118" fill="#e8e8e8" opacity="0.85"
            font-family="Inter, Segoe UI, Arial, sans-serif"
            font-size="13" font-weight="700" letter-spacing="3"
            text-anchor="middle">MATCH</text>
    `;
}

function renderColorStrengthPattern(): string {
    const swatches = [
        COLOR_COMPENSATION_SAMPLE_SWATCHES.red,
        COLOR_COMPENSATION_SAMPLE_SWATCHES.yellow,
        COLOR_COMPENSATION_SAMPLE_SWATCHES.green,
        COLOR_COMPENSATION_SAMPLE_SWATCHES.blue,
    ];
    const cellWidth = 26;
    const gap = 6;
    const totalWidth = swatches.length * cellWidth + (swatches.length - 1) * gap;
    const startX = (WIDGET_LOGICAL_SIZE.width - totalWidth) / 2;

    return swatches.map((swatch, index) => (
        `<rect x="${startX + index * (cellWidth + gap)}" y="18" width="${cellWidth}" height="108" rx="9" fill="${swatch.color}" />`
    )).join("");
}

function renderLightnessPattern(): string {
    return `
        <rect x="16" y="16" width="112" height="112" rx="14" fill="#808080" />
        ${renderLabelText("Aa", 72, 82, 30, 1)}
    `;
}

function renderGrayLevelsPattern(): string {
    const grayLevels = ["#3a3a3a", "#5d5d5d", "#808080", "#a3a3a3", "#c6c6c6"];
    const cellWidth = 20;
    const gap = 4;
    const totalWidth = grayLevels.length * cellWidth + (grayLevels.length - 1) * gap;
    const startX = (WIDGET_LOGICAL_SIZE.width - totalWidth) / 2;

    return grayLevels.map((color, index) => (
        `<rect x="${startX + index * (cellWidth + gap)}" y="50" width="${cellWidth}" height="44" rx="5" fill="${color}" />`
    )).join("");
}

function renderDarkDetailPattern(): string {
    const colors = ["#3a1414", "#262626", "#142136", "#142a1d"];
    const cellWidth = 26;
    const gap = 6;
    const totalWidth = colors.length * cellWidth + (colors.length - 1) * gap;
    const startX = (WIDGET_LOGICAL_SIZE.width - totalWidth) / 2;

    return `
        <rect x="11" y="11" width="122" height="122" rx="14" fill="#0b0d11" />
        ${colors.map((color, index) => (
            `<rect x="${startX + index * (cellWidth + gap)}" y="22" width="${cellWidth}" height="100" rx="9" fill="${color}" />`
        )).join("")}
    `;
}

function renderMegaPreviewPattern(): string {
    return `
        <rect x="13" y="13" width="26" height="30" rx="6" fill="${COLOR_COMPENSATION_SAMPLE_SWATCHES.red.color}" />
        <rect x="42" y="13" width="26" height="30" rx="6" fill="${COLOR_COMPENSATION_SAMPLE_SWATCHES.yellow.color}" />
        <rect x="75" y="13" width="26" height="30" rx="6" fill="${COLOR_COMPENSATION_SAMPLE_SWATCHES.green.color}" />
        <rect x="104" y="13" width="26" height="30" rx="6" fill="${COLOR_COMPENSATION_SAMPLE_SWATCHES.blue.color}" />
        <rect x="13" y="52" width="21" height="25" rx="5" fill="#3f3f3f" />
        <rect x="37" y="52" width="21" height="25" rx="5" fill="#5f5f5f" />
        <rect x="61" y="52" width="21" height="25" rx="5" fill="#7f7f7f" />
        <rect x="85" y="52" width="21" height="25" rx="5" fill="#9f9f9f" />
        <rect x="109" y="52" width="21" height="25" rx="5" fill="#b8b8b8" />
        <rect x="17" y="86" width="110" height="18" rx="7" fill="#777777" />
        ${renderLabelText("Aa", 72, 100, 18, 1)}
        <rect x="13" y="113" width="26" height="17" rx="5" fill="#3a1717" />
        <rect x="42" y="113" width="26" height="17" rx="5" fill="#2e2e2e" />
        <rect x="75" y="113" width="26" height="17" rx="5" fill="#172a3e" />
        <rect x="104" y="113" width="26" height="17" rx="5" fill="#173421" />
    `;
}

function renderLabelText(text: string, x: number, y: number, fontSize: number, opacity: number): string {
    return `<text x="${x}" y="${y}"
        fill="#ffffff"
        opacity="${opacity}"
        font-family="Inter, Segoe UI, Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="800"
        text-anchor="middle">${text}</text>`;
}
