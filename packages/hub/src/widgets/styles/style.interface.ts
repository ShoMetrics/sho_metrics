import type { KeySize } from "../../rendering/widget-data";

export interface GraphicStylePaints {
    readonly background: string;
    readonly surface: string;
}

/**
 * A graphic style applies visual treatment (background, overlay, filters)
 * independently of widget content.
 */
export interface GraphicStyle {
    readonly styleId: string;

    /** SVG <defs> block (filters, gradients). Inserted once inside <svg>. */
    renderDefs(keySize: KeySize, paints: GraphicStylePaints): string;

    /** Background layer rendered BELOW widget content. */
    renderBackground(keySize: KeySize, paints: GraphicStylePaints): string;

    /** Overlay layer rendered ABOVE widget content (e.g. glass sheen). */
    renderOverlay(keySize: KeySize, paints: GraphicStylePaints): string;
}
