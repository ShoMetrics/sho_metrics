export interface RenderLayoutTokens {
    readonly singleProgressCircleCenterIconScale: number;
    readonly dualProgressCircleCenterIconScale: number;
}

export const DEFAULT_RENDER_LAYOUT_TOKENS = {
    singleProgressCircleCenterIconScale: 1,
    dualProgressCircleCenterIconScale: 0.86,
} satisfies RenderLayoutTokens;
