import type { KeySize } from "./widget-data";
import type { ThemePresetName } from "../widgets/widget-contract";
import { colorFilledStyle } from "../widgets/styles/color-filled";
import { cupertinoGlassStyle } from "../widgets/styles/cupertino-glass";
import { flatStyle } from "../widgets/styles/flat";
import { pixelWindowStyle } from "../widgets/styles/pixel-window";
import { terminalCleanStyle, terminalVintageStyle } from "../widgets/styles/terminal";
import type { ThemeBodyViewport, ThemeStyle, ThemeStylePaints } from "../widgets/styles/theme-style";

export function renderMetricFrame(options: {
    body: string;
    bodyViewport?: ThemeBodyViewport | undefined;
    themePreset: ThemePresetName;
    muted: boolean;
    paints: ThemeStylePaints;
    size: KeySize;
}): string {
    const style = resolveThemePreset(options.themePreset);
    const filterId = `muted-widget-${options.size.width}-${options.size.height}`;
    const mutedDefs = options.muted
        ? `
            <filter id="${filterId}" color-interpolation-filters="sRGB">
                <feColorMatrix type="saturate" values="0" />
                <feComponentTransfer>
                    <feFuncA type="linear" slope="0.38" />
                </feComponentTransfer>
            </filter>
        `
        : "";
    const body = options.muted
        ? `<g filter="url(#${filterId})">${options.body}</g>`
        : options.body;
    const viewportClipId = options.bodyViewport === undefined
        ? ""
        : bodyViewportClipId(options.themePreset, options.bodyViewport);
    const viewportDefs = options.bodyViewport === undefined
        ? ""
        : renderBodyViewportClipPath(viewportClipId, options.bodyViewport);
    const placedBody = options.bodyViewport === undefined
        ? body
        : renderPlacedBody(body, options.bodyViewport, viewportClipId);
    const panelAttributes = style.renderPanelAttributes?.(options.size, options.paints) ?? [];
    const panelStart = panelAttributes.length === 0
        ? ""
        : `<g ${panelAttributes.join(" ")}>`;
    const panelEnd = panelAttributes.length === 0 ? "" : "</g>";
    const panelOverlay = style.renderPanelOverlay?.(options.size, options.paints) ?? "";

    return `<svg xmlns="http://www.w3.org/2000/svg"
        width="${options.size.width}" height="${options.size.height}"
        viewBox="0 0 ${options.size.width} ${options.size.height}">
        <defs>${style.renderDefs(options.size, options.paints)}${viewportDefs}${mutedDefs}</defs>
        ${panelStart}
        ${style.renderBackground(options.size, options.paints)}
        ${placedBody}
        ${panelOverlay}
        ${panelEnd}
        ${style.renderOverlay(options.size, options.paints)}
    </svg>`;
}

export function resolveThemeBodyViewport(options: {
    themePreset: ThemePresetName;
    paints: ThemeStylePaints;
    size: KeySize;
}): ThemeBodyViewport | undefined {
    return resolveThemePreset(options.themePreset).resolveBodyViewport?.(options.size, options.paints);
}

function resolveThemePreset(themePreset: ThemePresetName): ThemeStyle {
    switch (themePreset) {
        case "color-filled":
            return colorFilledStyle;
        case "cupertino-glass":
            return cupertinoGlassStyle;
        case "flat":
            return flatStyle;
        case "pixel-window":
            return pixelWindowStyle;
        case "terminal-clean":
            return terminalCleanStyle;
        case "terminal-vintage":
            return terminalVintageStyle;
    }
}

function renderBodyViewportClipPath(clipId: string, viewport: ThemeBodyViewport): string {
    const clipRadius = viewport.clipRadius ?? 0;

    return `<clipPath id="${clipId}">
            <rect x="${viewport.xCoordinate}" y="${viewport.yCoordinate}"
                width="${viewport.width}" height="${viewport.height}"
                rx="${clipRadius}" />
        </clipPath>`;
}

function renderPlacedBody(body: string, viewport: ThemeBodyViewport, clipId: string): string {
    return `<g clip-path="url(#${clipId})">
            <g transform="translate(${viewport.xCoordinate} ${viewport.yCoordinate})">${body}</g>
        </g>`;
}

function bodyViewportClipId(themePreset: ThemePresetName, viewport: ThemeBodyViewport): string {
    return `${themePreset}-body-viewport-${viewport.width}-${viewport.height}`;
}
