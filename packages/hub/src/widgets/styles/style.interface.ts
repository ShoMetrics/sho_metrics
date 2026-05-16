import type { KeySize } from "../../rendering/widget-data";

export interface GraphicStylePaints {
    readonly background: string;
    readonly backgroundFill: GraphicBackgroundFill | undefined;
    readonly surface: string;
}

export type GraphicBackgroundFill =
    | {
        readonly fillKind: "solid";
        readonly color: string;
        readonly isGradientEnabled: boolean;
    }
    | {
        readonly fillKind: "soft-triangle";
        readonly lowColor: string;
        readonly mediumColor: string;
        readonly highColor: string;
        readonly isGradientEnabled: boolean;
    };

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

    /** Optional attributes for the physical display panel below glass/frame overlays. */
    renderPanelAttributes?(keySize: KeySize, paints: GraphicStylePaints): readonly string[];

    /** Optional texture rendered on the display panel above widget content. */
    renderPanelOverlay?(keySize: KeySize, paints: GraphicStylePaints): string;

    /** Overlay layer rendered ABOVE widget content (e.g. glass sheen). */
    renderOverlay(keySize: KeySize, paints: GraphicStylePaints): string;
}
