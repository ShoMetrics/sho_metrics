import type { KeySize } from "./widget-data";
import type { GraphicThemePresetName } from "../widgets/widget.interface";
import { cupertinoGlassStyle } from "../widgets/styles/cupertino-glass";
import { flatStyle } from "../widgets/styles/flat";
import type { GraphicStylePaints } from "../widgets/styles/style.interface";

export function renderMetricFrame(options: {
    body: string;
    graphicStyle: GraphicThemePresetName;
    muted: boolean;
    paints: GraphicStylePaints;
    size: KeySize;
}): string {
    const style = options.graphicStyle === "cupertino-glass" ? cupertinoGlassStyle : flatStyle;
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

    return `<svg xmlns="http://www.w3.org/2000/svg"
        width="${options.size.width}" height="${options.size.height}"
        viewBox="0 0 ${options.size.width} ${options.size.height}">
        <defs>${style.renderDefs(options.size, options.paints)}${mutedDefs}</defs>
        ${style.renderBackground(options.size, options.paints)}
        ${body}
        ${style.renderOverlay(options.size, options.paints)}
    </svg>`;
}
