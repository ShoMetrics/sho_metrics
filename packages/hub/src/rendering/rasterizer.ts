import { Resvg } from "@resvg/resvg-js";
import type { KeySize } from "./widget-data";
import { logger } from "../logging/logger";

const log = logger.for("Rasterizer");

/**
 * Rasterize an SVG string to a Base64-encoded PNG data URL.
 * Uses @resvg/resvg-js (Rust N-API) for pixel-perfect, cross-platform rendering.
 */
export function rasterizeSvgToPngDataUrl(svgString: string, renderSize: KeySize): string {
    try {
        const resvg = new Resvg(svgString, {
            fitTo: { mode: "width" as const, value: renderSize.width },
        });
        const rendered = resvg.render();
        const pngBuffer = rendered.asPng();
        const base64 = Buffer.from(pngBuffer).toString("base64");
        return `data:image/png;base64,${base64}`;
    } catch (error) {
        log.error(() => `SVG render failed: ${error}`);
        return "";
    }
}
