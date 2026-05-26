import type { KeySize } from "../../view-rendering/widget-data";

export interface ThemeStylePaints {
    readonly background: string;
    readonly backgroundFill: ThemeBackgroundFill | undefined;
    readonly surface: string;
}

export interface ThemeBodyPlacement {
    readonly xOffset: number;
    readonly yOffset: number;
    readonly renderSize: KeySize;
}

export interface ThemeBodyViewport {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly height: number;
    readonly body: ThemeBodyPlacement;
    readonly clipRadius?: number;
}

export type ThemeBackgroundFill =
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
 * A theme style applies visual treatment (background, overlay, filters)
 * independently of widget content.
 */
export interface ThemeStyle {
    readonly styleId: string;

    /** SVG <defs> block (filters, gradients). Inserted once inside <svg>. */
    renderDefs(keySize: KeySize, paints: ThemeStylePaints): string;

    /** Background layer rendered BELOW widget content. */
    renderBackground(keySize: KeySize, paints: ThemeStylePaints): string;

    /** Optional attributes for the physical display panel below glass/frame overlays. */
    renderPanelAttributes?(keySize: KeySize, paints: ThemeStylePaints): readonly string[];

    /** Optional texture rendered on the display panel above widget content. */
    renderPanelOverlay?(keySize: KeySize, paints: ThemeStylePaints): string;

    /**
     * Resolves the client area used to render and place widget body content.
     *
     * The `paints` parameter is present for ThemeStyle signature consistency.
     * Viewport geometry should not depend on theme colors.
     */
    resolveBodyViewport?(keySize: KeySize, paints: ThemeStylePaints): ThemeBodyViewport;

    /** Overlay layer rendered ABOVE widget content (e.g. glass sheen). */
    renderOverlay(keySize: KeySize, paints: ThemeStylePaints): string;
}
