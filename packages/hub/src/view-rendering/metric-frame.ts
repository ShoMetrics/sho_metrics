import type { KeySize } from "./widget-data";
import type { ThemePresetName } from "../widgets/widget-contract";
import { colorFilledStyle } from "../widgets/styles/color-filled";
import { cupertinoGlassStyle } from "../widgets/styles/cupertino-glass";
import { flatStyle } from "../widgets/styles/flat";
import { pixelWindowStyle } from "../widgets/styles/pixel-window";
import { terminalCleanStyle, terminalVintageStyle } from "../widgets/styles/terminal";
import type { ThemeBodyViewport, ThemeStyle, ThemeStylePaints } from "../widgets/styles/theme-style";

export interface MetricFrameBody {
    /**
     * SVG fragment that may include body-local defs, ids, and url(#...) refs.
     *
     * When one frame composes multiple bodies, the frame renderer namespaces
     * ids found inside each body and rewrites matching local refs. Body
     * fragments must not use <style> blocks with #id selectors; use inline SVG
     * references instead so the frame can isolate them.
     */
    readonly svg: string;
    readonly bodyViewport?: ThemeBodyViewport | undefined;
    readonly muted: boolean;
}

export function renderMetricFrame(options: {
    bodies: readonly MetricFrameBody[];
    themePreset: ThemePresetName;
    paints: ThemeStylePaints;
    size: KeySize;
}): string {
    const style = resolveThemePreset(options.themePreset);
    const filterId = `muted-widget-${options.size.width}-${options.size.height}`;
    // The filter definition is shared, but each body chooses independently
    // whether its own SVG is wrapped with the muted filter.
    const mutedDefs = options.bodies.some(body => body.muted)
        ? `
            <filter id="${filterId}" color-interpolation-filters="sRGB">
                <feColorMatrix type="saturate" values="0" />
                <feComponentTransfer>
                    <feFuncA type="linear" slope="0.38" />
                </feComponentTransfer>
            </filter>
        `
        : "";
    const viewportDefs = options.bodies
        .map((body, index) => body.bodyViewport === undefined
            ? ""
            : renderBodyViewportClipPath(
                bodyViewportClipId(options.themePreset, body.bodyViewport, index),
                body.bodyViewport,
            ))
        .join("");
    const placedBodies = options.bodies
        .map((body, index) => renderFrameBody({
            body,
            filterId,
            index,
            namespaceBodyIds: options.bodies.length > 1,
            themePreset: options.themePreset,
        }))
        .join("");
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
        ${placedBodies}
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

function renderFrameBody(options: {
    body: MetricFrameBody;
    filterId: string;
    index: number;
    namespaceBodyIds: boolean;
    themePreset: ThemePresetName;
}): string {
    const wrappedBodySvg = options.body.muted
        ? `<g filter="url(#${options.filterId})">${options.body.svg}</g>`
        : options.body.svg;
    const bodySvg = options.namespaceBodyIds
        ? namespaceSvgFragmentIds(wrappedBodySvg, `body-${options.index}`)
        : wrappedBodySvg;

    if (options.body.bodyViewport === undefined) {
        return bodySvg;
    }

    const clipId = bodyViewportClipId(options.themePreset, options.body.bodyViewport, options.index);

    return renderPlacedBody(bodySvg, options.body.bodyViewport, clipId);
}

function renderPlacedBody(body: string, viewport: ThemeBodyViewport, clipId: string): string {
    const xCoordinate = viewport.xCoordinate + viewport.body.xOffset;
    const yCoordinate = viewport.yCoordinate + viewport.body.yOffset;
    const scale = Math.min(
        viewport.width / viewport.body.renderSize.width,
        viewport.height / viewport.body.renderSize.height,
    );
    const transform = scale === 1
        ? `translate(${formatSvgNumber(xCoordinate)} ${formatSvgNumber(yCoordinate)})`
        : `translate(${formatSvgNumber(xCoordinate)} ${formatSvgNumber(yCoordinate)}) scale(${formatSvgNumber(scale)})`;

    return `<g clip-path="url(#${clipId})">
            <g transform="${transform}">${body}</g>
        </g>`;
}

function bodyViewportClipId(themePreset: ThemePresetName, viewport: ThemeBodyViewport, index: number): string {
    return `${themePreset}-body-viewport-${index}-${viewport.xCoordinate}-${viewport.yCoordinate}-${viewport.width}-${viewport.height}`;
}

function namespaceSvgFragmentIds(svg: string, namespace: string): string {
    const localIds = new Set(
        Array.from(svg.matchAll(/\bid="([^"]+)"/gu), match => match[1] ?? ""),
    );

    if (localIds.size === 0) {
        return svg;
    }

    const resolveNamespacedId = (id: string): string => localIds.has(id)
        ? `${namespace}-${id}`
        : id;

    return svg
        .replace(/\bid="([^"]+)"/gu, (_match, id: string) => `id="${resolveNamespacedId(id)}"`)
        .replace(/url\(#([^)]+)\)/gu, (_match, id: string) => `url(#${resolveNamespacedId(id)})`)
        .replace(/\b(xlink:href|href)="#([^"]+)"/gu, (_match, attributeName: string, id: string) =>
            `${attributeName}="#${resolveNamespacedId(id)}"`);
}

function formatSvgNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}
