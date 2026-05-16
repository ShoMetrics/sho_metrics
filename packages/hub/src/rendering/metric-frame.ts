import type { KeySize } from "./widget-data";
import type { GraphicThemePresetName } from "../widgets/widget.interface";
import { colorFilledStyle } from "../widgets/styles/color-filled";
import { cupertinoGlassStyle } from "../widgets/styles/cupertino-glass";
import { flatStyle } from "../widgets/styles/flat";
import { oldCrtStyle } from "../widgets/styles/old-crt";
import type { GraphicStylePaints } from "../widgets/styles/style.interface";

export function renderMetricFrame(options: {
    body: string;
    graphicStyle: GraphicThemePresetName;
    muted: boolean;
    paints: GraphicStylePaints;
    size: KeySize;
}): string {
    const style = resolveGraphicStyle(options.graphicStyle);
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
    const panelAttributes = style.renderPanelAttributes?.(options.size, options.paints) ?? [];
    const panelStart = panelAttributes.length === 0
        ? ""
        : `<g ${panelAttributes.join(" ")}>`;
    const panelEnd = panelAttributes.length === 0 ? "" : "</g>";
    const panelOverlay = style.renderPanelOverlay?.(options.size, options.paints) ?? "";

    return `<svg xmlns="http://www.w3.org/2000/svg"
        width="${options.size.width}" height="${options.size.height}"
        viewBox="0 0 ${options.size.width} ${options.size.height}">
        <defs>${style.renderDefs(options.size, options.paints)}${mutedDefs}</defs>
        ${panelStart}
        ${style.renderBackground(options.size, options.paints)}
        ${body}
        ${panelOverlay}
        ${panelEnd}
        ${style.renderOverlay(options.size, options.paints)}
    </svg>`;
}

function resolveGraphicStyle(graphicStyle: GraphicThemePresetName) {
    switch (graphicStyle) {
        case "color-filled":
            return colorFilledStyle;
        case "cupertino-glass":
            return cupertinoGlassStyle;
        case "flat":
            return flatStyle;
        case "old-crt":
            return oldCrtStyle;
    }
}
