import type { KeySize } from "../../rendering/widget-data";

/**
 * A graphic style applies visual treatment (background, overlay, filters)
 * independently of widget content.
 */
export interface GraphicStyle {
    readonly styleId: string;

    /** SVG <defs> block (filters, gradients). Inserted once inside <svg>. */
    renderDefs(keySize: KeySize): string;

    /** Background layer rendered BELOW widget content. */
    renderBackground(keySize: KeySize): string;

    /** Overlay layer rendered ABOVE widget content (e.g. glass sheen). */
    renderOverlay(keySize: KeySize): string;
}
